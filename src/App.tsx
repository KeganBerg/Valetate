import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ASSETS, type AssetDef } from './assets';
import { Canvas, MAX_Z, MIN_Z, type View } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { LivePanel } from './components/LivePanel';
import { MapsDialog } from './components/MapsDialog';
import { Palette } from './components/Palette';
import { exportJson, exportPng, exportSvg, parseMapFile } from './export';
import { GRID, duplicateSpotLabels, findSpot, listSpots, lotAround, snap, uid, unionBounds } from './geometry';
import { canEditMaps, MapConflict, ROLE_INFO, type DataSource, type Role } from './data/source';
import { findCar, friendlyError, nextOpenSpot, nextTag } from './ops';
import { keyHook } from './keys';
import { blockersOf, blocksAfterMove } from './stacks';
import { currentMapId, setCurrentMapId } from './storage';
import { initState, reducer } from './store';
import { TEMPLATES, instantiate, type Template } from './templates';
import { liveRequests, newGuestToken } from './requests';
import { GuestLinkDialog } from './components/GuestLink';
import { PhotoSheet } from './components/PhotoSheet';
import { createPhotoQueue } from './photoQueue';
import type { CarRequest, LotEvent, LotMap, MapItem, ParkedCar, Shift, Spot, Tip } from './types';
import { almostFull, isPre, standPoint } from './surge';
import { EventDialog, EventPill } from './components/EventMode';
import { ShiftSheet } from './components/ShiftSheet';
import { Dashboard } from './components/Dashboard';
import { dayStart, duration, money, splitPool } from './shifts';

function initialMap(maps: LotMap[]): { map: LotMap; firstRun: boolean } {
  const id = currentMapId();
  const found = maps.find((m) => m.id === id) ?? maps[0];
  if (found) return { map: found, firstRun: false };
  return { map: instantiate(TEMPLATES[0]), firstRun: true };
}

/** Next unused row letter: A, B, … Z, AA, AB … */
function nextRowLetter(items: MapItem[]): string {
  const used = new Set(items.filter((i) => i.kind === 'spaceRow').map((i) => (i.prefix ?? '').trim().toUpperCase()));
  for (let n = 0; n < 702; n++) {
    const l = n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26));
    if (!used.has(l)) return l;
  }
  return '';
}

function nextSpaceNumber(items: MapItem[]): string {
  const nums = items.filter((i) => i.kind === 'space').map((i) => parseInt(i.label ?? '', 10)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

const carName = (c: ParkedCar) => (c.ticket ? `#${c.ticket}` : c.plate);

// key tags are handed out across every map at a stand, so one sequence for all of them
const LAST_TAG_KEY = 'valetate.lastTag';
function readLastTag(): string {
  try {
    return localStorage.getItem(LAST_TAG_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeLastTag(tag: string) {
  try {
    localStorage.setItem(LAST_TAG_KEY, tag);
  } catch {
    // not remembered; the suggestion falls back to the parked cars
  }
}

function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
};

export interface Account {
  name: string;
  email: string;
  companyName: string;
  onSignOut: () => void;
  onTeam?: () => void;
  onSwitchCompany?: () => void;
}

interface Props {
  source: DataSource;
  role: Role;
  account?: Account;
  initialMaps: LotMap[];
  initialCars: ParkedCar[];
}

export default function App({ source, role, account, initialMaps, initialCars }: Props) {
  const canEdit = canEditMaps(role);
  const init = useMemo(() => initialMap(initialMaps), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, dispatch] = useReducer(reducer, init.map, initState);
  const { map, selected } = state;
  const [maps, setMaps] = useState<LotMap[]>(initialMaps);
  const [showMaps, setShowMaps] = useState(init.firstRun && canEdit);
  const [view, setViewState] = useState<View>({ x: 40, y: 40, z: 0.6 });
  // until someone pans or zooms, keep the lot fitted as the window changes size
  const autoFit = useRef(true);
  const setView = useCallback((v: View | ((v: View) => View)) => {
    autoFit.current = false;
    setViewState(v);
  }, []);
  const [snapOn, setSnapOn] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<'edit' | 'live'>(canEdit ? 'edit' : 'live');
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved');
  const [panel, setPanel] = useState<'none' | 'palette' | 'inspector'>('none');
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<Spot | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; label?: string } | null>(null);
  const [live, setLive] = useState(true);
  const [unsynced, setUnsynced] = useState(() => source.outbox?.count() ?? 0);
  // a change normally syncs in a blink; only mention it once it has been waiting a moment
  const [showUnsynced, setShowUnsynced] = useState(false);
  useEffect(() => {
    if (!unsynced) return setShowUnsynced(false);
    const t = window.setTimeout(() => setShowUnsynced(true), 1500);
    return () => window.clearTimeout(t);
  }, [unsynced > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cars, setCars] = useState<ParkedCar[]>(initialCars);
  const [activeSpotKey, setActiveSpotKey] = useState<string | null>(null);
  const [moving, setMoving] = useState<ParkedCar | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastTag, setLastTagState] = useState<string>(readLastTag);
  const setLastTag = (t: string) => {
    setLastTagState(t);
    writeLastTag(t);
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const clipboard = useRef<MapItem[]>([]);
  const loadedRef = useRef<LotMap>(init.map);

  const spots = useMemo(() => listSpots(map.items), [map.items]);
  const duplicates = useMemo(() => duplicateSpotLabels(map.items), [map.items]);
  const mapCars = useMemo(() => cars.filter((c) => c.mapId === map.id), [cars, map.id]);
  const occupied = useMemo(() => new Map(mapCars.map((c) => [c.spotKey, c])), [mapCars]);
  // cars whose spot was removed or renumbered in the editor: they still need retrieving
  const orphans = useMemo(() => {
    const keys = new Set(spots.map((s) => s.key));
    return mapCars.filter((c) => !keys.has(c.spotKey));
  }, [mapCars, spots]);
  const activeSpot = spots.find((s) => s.key === activeSpotKey) ?? null;

  const flash = useCallback((msg: string, undo?: () => void, label?: string) => {
    const t = { msg, undo, label };
    setToast(t);
    // a decision (not just an undo) stays up long enough to read and choose
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), label ? 12000 : undo ? 6000 : 2600);
  }, []);

  const upsertMapInList = (m: LotMap) => setMaps((ms) => [m, ...ms.filter((x) => x.id !== m.id)]);

  // the version of each map this device last saw on the server; saves go over it
  const versions = useRef(new Map<string, number>(init.map.version === undefined ? [] : [[init.map.id, init.map.version]]));
  const noteVersion = (m: LotMap) => {
    if (m.version !== undefined) versions.current.set(m.id, m.version);
  };
  // one save at a time, so each starts from the version the last one got back
  const saveChain = useRef(Promise.resolve());
  // bumped on a conflict: saves queued before it would overwrite the version just shown
  const conflicts = useRef(0);
  const lastSaved = useRef<LotMap | null>(null);
  const persistMap = useCallback(
    (m: LotMap) => {
      setSaving('saving');
      lastSaved.current = m;
      const gen = conflicts.current;
      saveChain.current = saveChain.current.then(async () => {
        if (gen !== conflicts.current) return;
        try {
          const v = await source.saveMap(m, versions.current.get(m.id));
          if (v !== undefined) versions.current.set(m.id, v);
          setSaving('saved');
        } catch (e) {
          if (!(e instanceof MapConflict)) {
            setSaving('error');
            flash(`Couldn't save: ${e instanceof Error ? e.message : e}`);
            return;
          }
          setSaving('saved');
          conflicts.current++;
          const theirs = e.theirs;
          // my newest edit of this map, including any queued behind this save
          const mine = lastSaved.current?.id === m.id ? lastSaved.current : m;
          const keepMine = () => {
            if (theirs) versions.current.set(m.id, theirs.version!);
            else versions.current.delete(m.id);
            loadRef.current({ ...mine, updatedAt: Date.now() }, true);
          };
          if (!theirs) {
            versions.current.delete(m.id);
            flash(`“${m.name}” was deleted on another device.`, keepMine, 'Restore it');
            return;
          }
          // show their version; one tap puts mine back over it
          versions.current.set(m.id, theirs.version!);
          setMaps((ms) => ms.map((x) => (x.id === theirs.id ? theirs : x)));
          if (mapRef.current.id === m.id) {
            loadedRef.current = theirs;
            dispatch({ type: 'load', map: theirs });
          }
          flash('Someone else changed this map at the same time. Showing their version.', keepMine, 'Keep mine');
        }
      });
    },
    [source, flash],
  );

  // autosave (skip the untouched map we just loaded)
  useEffect(() => {
    if (state.map === loadedRef.current || !canEdit) return;
    upsertMapInList(state.map);
    const t = window.setTimeout(() => persistMap(state.map), source.kind === 'cloud' ? 700 : 300);
    return () => window.clearTimeout(t);
  }, [state.map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentMapId(map.id);
  }, [map.id]);

  // retrieval requests, and a heads-up when a new one comes in from another device
  const [requests, setRequests] = useState<CarRequest[]>([]);
  const [guestLinkCar, setGuestLinkCar] = useState<ParkedCar | null>(null);
  const [photoCar, setPhotoCar] = useState<ParkedCar | null>(null);
  const photoQueue = useMemo(() => createPhotoQueue(source), [source]);
  const seenRequests = useRef<Set<string> | null>(null);
  const refreshRequests = useCallback(async () => {
    const list = await source.listRequests().catch(() => null);
    if (!list) return;
    const seen = seenRequests.current;
    const fresh = seen ? list.filter((r) => !seen.has(r.id) && r.status === 'open') : [];
    seenRequests.current = new Set(list.map((r) => r.id));
    setRequests(list);
    if (fresh.length) {
      const c = carsRef.current.find((x) => x.id === fresh[0].carId);
      flash(`New request: ${c ? `${carName(c)} in ${c.spotLabel}` : 'a car'}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`);
      navigator.vibrate?.([120, 60, 120]);
    }
  }, [source, flash]);
  const carsRef = useRef(cars);
  carsRef.current = cars;

  // event mode: one shared let-out countdown for the whole crew
  const [event, setEvent] = useState<LotEvent | null>(null);
  const [eventDialog, setEventDialog] = useState(false);
  const [outSince, setOutSince] = useState(0);
  const refreshEvent = useCallback(async () => {
    const e = await source.getEvent().catch(() => undefined);
    if (e !== undefined) setEvent(e);
  }, [source]);
  useEffect(() => {
    refreshEvent();
  }, [refreshEvent]);

  // shifts and the tip pool
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipUrl, setTipUrl] = useState('');
  const [shiftOpen, setShiftOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const refreshTeam = useCallback(async () => {
    const from = dayStart(Date.now());
    const [s, t, u] = await Promise.all([
      source.listShifts(from - 24 * 60 * 60 * 1000).catch(() => null),
      source.listTips(from).catch(() => null),
      source.getTipUrl().catch(() => null),
    ]);
    if (s) setShifts(s);
    if (t) setTips(t);
    if (u !== null) setTipUrl(u);
  }, [source]);
  useEffect(() => {
    refreshTeam();
  }, [refreshTeam]);
  const myShift = useMemo(() => {
    const t = Math.max(now, Date.now());
    const open = shifts.find((s) => s.userId === source.me.id && !s.endedAt);
    const { total, shares } = splitPool(tips, shifts, dayStart(t), Infinity, t);
    const mine = shares.find((s) => s.userId === source.me.id)?.cents ?? 0;
    return { on: !!open, time: open ? `on ${duration(t - open.startedAt)}` : '', pool: open ? money(mine) : money(total) };
  }, [shifts, tips, now, source]);
  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);
  // a car asked for "at the let-out" follows the let-out if it's moved; once the event ends it's just a request
  const timedRequests = useMemo(
    () => (event ? requests.map((r) => (r.dueAt ? { ...r, dueAt: event.letOutAt } : r)) : requests.map((r) => (r.dueAt ? { ...r, dueAt: null } : r))),
    [requests, event],
  );
  const mapRequests = useMemo(
    () => liveRequests(timedRequests, new Set(mapCars.map((c) => c.id))),
    [timedRequests, mapCars],
  );
  const requestedSpots = useMemo(() => {
    const byCar = new Map(mapCars.map((c) => [c.id, c.spotKey]));
    return new Map(mapRequests.map((r) => [byCar.get(r.carId)!, isPre(r, now) ? ('pre' as const) : r.status]));
  }, [mapRequests, mapCars, now]);
  /** spots holding cars that must move before a requested car can get out */
  const mustMoveSpots = useMemo(() => {
    const keys = new Set<string>();
    for (const r of mapRequests) if (r.status !== 'ready') for (const c of blockersOf(mapCars, r.carId)) keys.add(c.spotKey);
    return keys;
  }, [mapRequests, mapCars]);
  // where the stand is on this lot (the valet booth), for staging during an event
  const stand = useMemo(
    () => standPoint(map.items, { x: map.width / 2, y: map.height }),
    [map.items, map.width, map.height],
  );

  // the let-out pace: how many cars have left since it started
  const letOut = event?.letOutAt ?? 0;
  const lettingOut = !!event && now >= letOut;
  useEffect(() => {
    if (!lettingOut) return setOutSince(0);
    let stop = false;
    const check = () => source.carsOutSince(letOut).then((n) => !stop && setOutSince(n), () => {});
    check();
    const t = window.setInterval(check, 20000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [source, lettingOut, letOut, cars.length]);

  // say so when the let-out starts, once per event
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!event || !lettingOut || announced.current === event.id) return;
    const first = announced.current === null && now - letOut > 60_000;
    announced.current = event.id;
    if (first) return; // opened the app mid let-out: nothing new to announce
    const due = timedRequests.filter((r) => r.dueAt && r.status === 'open').length;
    flash(`${event.name || 'The event'} is letting out${due ? ` · ${due} asked-ahead ${due === 1 ? 'car is' : 'cars are'} due now` : ''}`);
    navigator.vibrate?.([200, 80, 200, 80, 200]);
  }, [event, lettingOut, letOut, now, timedRequests, flash]);

  // lot nearly full: say so once as it fills, and point at the lot with the most room
  const openSpots = spots.length - mapCars.filter((c) => spots.some((s) => s.key === c.spotKey)).length;
  const lotFull = mode === 'live' && almostFull(openSpots, spots.length);
  const wasFull = useRef(false);
  useEffect(() => {
    if (lotFull && !wasFull.current) {
      const room = maps
        .filter((m) => m.id !== map.id)
        .map((m) => ({ m, open: listSpots(m.items).length - cars.filter((c) => c.mapId === m.id).length }))
        .sort((a, b) => b.open - a.open)[0];
      flash(`${map.name} is almost full: ${openSpots} open${room && room.open > 0 ? ` · ${room.m.name} has ${room.open}` : ''}`);
    }
    wasFull.current = lotFull;
  }, [lotFull]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchRequest = (id: string, patch: Partial<CarRequest>) =>
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const refreshCars = useCallback(async () => {
    try {
      setCars(await source.listCars());
    } catch {
      // keep what we have; the next change will retry
    }
  }, [source]);

  // live updates from other devices
  const mapRef = useRef(map);
  mapRef.current = map;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(
    () =>
      source.subscribe({
        cars: refreshCars,
        requests: refreshRequests,
        event: refreshEvent,
        team: refreshTeam,
        live: setLive,
        maps: async () => {
          const ms = await source.listMaps().catch(() => null);
          if (!ms) return;
          setMaps(ms);
          // someone else changed the map we're looking at: follow along unless we're editing it
          const cur = ms.find((m) => m.id === mapRef.current.id);
          if (cur && cur.updatedAt > mapRef.current.updatedAt && modeRef.current === 'live') {
            loadedRef.current = cur;
            noteVersion(cur);
            dispatch({ type: 'load', map: cur });
          }
        },
      }),
    [source, refreshCars, refreshRequests, refreshEvent, refreshTeam],
  );

  // a phone that slept or lost signal missed changes: catch up as soon as it's back
  useEffect(() => {
    const catchUp = () => {
      if (document.visibilityState !== 'visible') return;
      source.outbox?.flush().then(refreshCars);
      refreshCars();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    const offline = () => setLive(false);
    window.addEventListener('offline', offline);
    return () => {
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
      window.removeEventListener('offline', offline);
    };
  }, [source, refreshCars]);

  // car changes made with no signal: show how many are waiting, and say so if one is refused later
  useEffect(
    () =>
      source.outbox?.subscribe((count, dropped) => {
        setUnsynced(count);
        if (dropped !== undefined) {
          flash(`A change made offline didn't save: ${friendlyError(dropped)}`);
          refreshCars();
        }
      }),
    [source, flash, refreshCars],
  );

  const run = (p: Promise<unknown>, undo?: () => void) =>
    p.catch((e) => {
      flash(friendlyError(e));
      undo?.();
      refreshCars();
    });

  useEffect(() => {
    if (mode !== 'live') return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, [mode]);

  const mapNow = useRef(map);
  mapNow.current = map;
  /** show the whole lot, plus anything hanging off its edges */
  const fit = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width < 40 || height < 40) return;
    const m = mapNow.current;
    const b = unionBounds(m.items);
    const x0 = Math.min(0, b?.x ?? 0);
    const y0 = Math.min(0, b?.y ?? 0);
    const w = Math.max(m.width, b ? b.x + b.w : 0) - x0;
    const h = Math.max(m.height, b ? b.y + b.h : 0) - y0;
    // leave room for the floating buttons on phones
    const pad = width <= 820 ? 24 : 48;
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min((width - pad * 2) / w, (height - pad * 2) / h)));
    autoFit.current = true;
    setViewState({ z, x: (width - w * z) / 2 - x0 * z, y: (height - h * z) / 2 - y0 * z });
  }, []);

  // fit whenever a different map is opened…
  useLayoutEffect(fit, [map.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and when the screen changes size, unless the view was moved by hand
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => autoFit.current && fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomBy = (f: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    setView((v) => {
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * f));
      const cx = r.width / 2;
      const cy = r.height / 2;
      return { z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z };
    });
  };

  /** resize the lot (and shift objects when it grows up or left) without the picture jumping */
  const applyLot = (g: { items: MapItem[]; width: number; height: number; dx: number; dy: number }, opts: { key?: string; select?: string[] } = {}) => {
    dispatch({ type: 'commit', items: g.items, size: { width: g.width, height: g.height }, ...opts });
    if (g.dx || g.dy) setView((v) => ({ ...v, x: v.x - g.dx * v.z, y: v.y - g.dy * v.z }));
  };

  const fitLotToObjects = () => {
    const g = lotAround(map.items, map.width, map.height, { shrink: true });
    if (!g) return flash('The lot already fits everything on it');
    applyLot(g);
    requestAnimationFrame(fit);
    flash(`Lot is now ${g.width} × ${g.height}`);
  };

  const load = (m: LotMap, persist: boolean) => {
    loadedRef.current = persist ? (null as unknown as LotMap) : m;
    if (!persist) noteVersion(m);
    dispatch({ type: 'load', map: m });
    setShowMaps(false);
    setHighlight(null);
    setActiveSpotKey(null);
    setMoving(null);
    if (persist) {
      upsertMapInList(m);
      persistMap(m);
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  // the lot grows to hold anything added or moved past its edge
  const commit = (items: MapItem[], opts: { key?: string; select?: string[] } = {}) => {
    const grown = lotAround(items, map.width, map.height);
    if (grown) applyLot(grown, opts);
    else dispatch({ type: 'commit', items, ...opts });
  };

  const addAsset = (a: AssetDef, at?: { x: number; y: number }) => {
    let p = at;
    if (!p) {
      const r = stageRef.current!.getBoundingClientRect();
      p = { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
    }
    const it: MapItem = {
      id: uid(),
      kind: a.kind,
      x: snap(p.x - a.w / 2),
      y: snap(p.y - a.h / 2),
      w: a.w,
      h: a.h,
      rotation: 0,
      ...a.defaults,
    };
    if (a.kind === 'spaceRow') it.prefix = nextRowLetter(map.items);
    if (a.kind === 'space' && !a.defaults?.accessible) it.label = nextSpaceNumber(map.items);
    commit([...map.items, it], { select: [it.id] });
    setPanel('none');
  };

  const selItems = map.items.filter((i) => selected.includes(i.id));

  const duplicate = () => {
    if (!selItems.length) return;
    const copies = selItems.map((i) => ({
      ...i,
      id: uid(),
      x: i.x + GRID * 4,
      y: i.y + GRID * 4,
      ...(i.kind === 'spaceRow' ? { prefix: nextRowLetter(map.items) } : {}),
    }));
    commit([...map.items, ...copies], { select: copies.map((c) => c.id) });
  };

  const remove = () => {
    if (!selected.length) return;
    commit(
      map.items.filter((i) => !selected.includes(i.id)),
      { select: [] },
    );
  };

  const rotate = (deg: number) =>
    commit(map.items.map((i) => (selected.includes(i.id) ? { ...i, rotation: (((i.rotation + deg) % 360) + 360) % 360 } : i)));

  const nudge = (dx: number, dy: number) =>
    commit(
      map.items.map((i) => (selected.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
      { key: 'nudge' },
    );

  const order = (where: 'front' | 'back') => {
    const sel = map.items.filter((i) => selected.includes(i.id));
    const rest = map.items.filter((i) => !selected.includes(i.id));
    commit(where === 'front' ? [...rest, ...sel] : [...sel, ...rest]);
  };

  const setBlocks = (car: ParkedCar, blocks: string[]) => {
    setCars((cs) => cs.map((c) => (c.id === car.id ? { ...c, blocks } : c)));
    run(source.setBlocks(car.id, blocks));
  };

  const setKeys = (car: ParkedCar, out: boolean) => {
    const patch = out
      ? { keysWith: source.me.id, keysWithName: source.me.name, keysOutAt: Date.now() }
      : { keysWith: '', keysWithName: '', keysOutAt: null };
    setCars((cs) => cs.map((c) => (c.id === car.id ? { ...c, ...patch } : c)));
    run(source.setKeys(car.id, out));
    const hook = keyHook(car);
    flash(out ? `Keys for ${carName(car)} are with you` : `Keys for ${carName(car)} back ${hook ? `on hook ${hook}` : 'on the board'}`);
  };

  const retrieveCar = (car: ParkedCar) => {
    const putBack = () => setCars((cs) => [...cs.filter((c) => c.id !== car.id), car]);
    const takeOff = () => setCars((cs) => cs.filter((c) => c.id !== car.id));
    takeOff();
    setRequests((rs) => rs.filter((r) => r.carId !== car.id));
    const done = source.retrieveCar(car.id);
    run(done, putBack);
    // a mis-tap at rush shouldn't lose a car: offer undo for a few seconds
    flash(`${carName(car)} retrieved from ${car.spotLabel}`, () => {
      putBack();
      run(
        done.catch(() => {}).then(() => source.unretrieveCar(car)),
        takeOff,
      );
      flash(`${carName(car)} is back in ${car.spotLabel}`);
    });
  };

  const requestCar = (car: ParkedCar, dueAt?: number) => {
    const r: CarRequest = {
      dueAt: dueAt ?? null,
      id: uid(),
      carId: car.id,
      mapId: car.mapId,
      status: 'open',
      source: 'staff',
      note: '',
      createdAt: Date.now(),
      createdByName: source.me.name,
      claimedBy: '',
      claimedByName: '',
      claimedAt: null,
      readyAt: null,
    };
    seenRequests.current?.add(r.id);
    setRequests((rs) => [...rs, r]);
    run(source.createRequest(r), () => setRequests((rs) => rs.filter((x) => x.id !== r.id))).then(refreshRequests);
    setNow(Date.now());
    flash(dueAt ? `${carName(car)} asked for at the let-out` : `${carName(car)} requested`);
  };

  const centerOn = (s: Spot) => {
    const r = stageRef.current!.getBoundingClientRect();
    const z = Math.max(view.z, 1.2);
    // on phones the bottom sheet covers the lower half, so aim higher
    const cy = r.width <= 820 ? r.height * 0.28 : r.height / 2;
    setView({ z, x: r.width / 2 - s.cx * z, y: cy - s.cy * z });
  };

  const focusSpot = (s: Spot) => {
    setHighlight(s);
    centerOn(s);
    if (mode === 'edit') dispatch({ type: 'select', ids: [s.itemId] });
    else {
      setActiveSpotKey(s.key);
      setPanel('inspector');
    }
    window.setTimeout(() => setHighlight((h) => (h === s ? null : h)), 4000);
  };

  const find = (q: string) => {
    if (!q.trim()) return;
    const spot = findSpot(map.items, q);
    // while moving a car, typing a spot number drops it there
    if (moving && spot) return onSpotClick(spot);
    // in the live lot, "104" most often means tag 104, so check cars on every map first;
    // a spot label typed exactly still wins over a loose match like part of a plate
    const hit = findCar(cars, q);
    const useCar = hit && (mode === 'live' ? hit.rank <= 1 || !spot : !spot);
    if (!useCar) {
      if (spot) focusSpot(spot);
      else flash(`Nothing called "${q}"`);
      return;
    }
    const car = hit.car;
    const m = car.mapId === map.id ? map : maps.find((x) => x.id === car.mapId);
    if (!m) return flash(`${carName(car)} is on a map that was deleted`);
    const s = listSpots(m.items).find((sp) => sp.key === car.spotKey);
    if (m.id !== map.id) load(m, false);
    if (!s) {
      setPanel('inspector');
      return flash(`${carName(car)} needs a new spot (see the top of the list)`);
    }
    // after switching maps, wait for the new map to be fitted before zooming in on the spot
    if (m.id !== map.id) requestAnimationFrame(() => focusSpot(s));
    else focusSpot(s);
  };

  const onSpotClick = (s: Spot | null) => {
    if (moving && s) {
      if (occupied.has(s.key)) return flash(`Spot ${s.label} is taken`);
      // a car that moves is no longer in the stack it was part of
      const unstack = blocksAfterMove(cars, moving.id);
      const unstacked = new Map(unstack.map((u) => [u.id, u.blocks]));
      setCars((cs) =>
        cs.map((c) => ({
          ...c,
          ...(unstacked.has(c.id) ? { blocks: unstacked.get(c.id) } : {}),
          ...(c.id === moving.id ? { spotKey: s.key, spotLabel: s.label } : {}),
        })),
      );
      run(source.moveCar(moving.id, s.key, s.label));
      for (const u of unstack) run(source.setBlocks(u.id, u.blocks));
      flash(`${carName(moving)} moved to ${s.label}`);
      setMoving(null);
      setActiveSpotKey(s.key);
      return;
    }
    setActiveSpotKey(s?.key ?? null);
    if (s) setPanel('inspector');
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (showMaps) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mode !== 'edit') {
        if (k === 'escape') {
          setActiveSpotKey(null);
          setMoving(null);
        }
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && k === 'c') {
        clipboard.current = selItems;
      } else if (mod && k === 'v' && clipboard.current.length) {
        e.preventDefault();
        const copies = clipboard.current.map((i) => ({ ...i, id: uid(), x: i.x + GRID * 4, y: i.y + GRID * 4 }));
        clipboard.current = copies;
        commit([...map.items, ...copies], { select: copies.map((c) => c.id) });
      } else if (mod && k === 'a') {
        e.preventDefault();
        dispatch({ type: 'select', ids: map.items.map((i) => i.id) });
      } else if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        remove();
      } else if (k === 'escape') {
        dispatch({ type: 'select', ids: [] });
      } else if (k === 'r' && selected.length) {
        rotate(e.shiftKey ? -90 : 90);
      } else if (k.startsWith('arrow') && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? GRID * 5 : snapOn ? GRID : 1;
        nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const importFile = async (f: File) => {
    try {
      const m = parseMapFile(await f.text());
      // always import as a new copy so it can't overwrite an existing map
      load({ ...m, id: uid(), updatedAt: Date.now() }, true);
      flash(`Imported "${m.name}"`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not import that file');
    }
  };

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">V</span>
          <span className="brand-name">Valetate</span>
        </div>
        <button className="map-name" onClick={() => setShowMaps(true)} title="Switch map">
          {map.name || 'Untitled lot'} <span className="caret">▾</span>
        </button>
        {canEdit && (
          <div className="seg" role="tablist">
            <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
              Edit map
            </button>
            <button
              className={mode === 'live' ? 'on' : ''}
              onClick={() => {
                setMode('live');
                dispatch({ type: 'select', ids: [] });
              }}
            >
              Live lot
            </button>
          </div>
        )}
        <form
          className="find"
          onSubmit={(e) => {
            e.preventDefault();
            find(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'live' ? 'Find tag, plate or spot' : 'Find spot: D 12'}
            aria-label={mode === 'live' ? 'Find a car or spot' : 'Find a spot'}
            enterKeyHint="search"
          />
        </form>
        <div className="grow" />
        {mode === 'edit' && (
          <div className="tools">
            <button onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
            <button className={showGrid ? 'on' : ''} onClick={() => setShowGrid(!showGrid)} title="Show grid">
              Grid
            </button>
            <button className={snapOn ? 'on' : ''} onClick={() => setSnapOn(!snapOn)} title="Snap to grid (hold Alt to override)">
              Snap
            </button>
          </div>
        )}
        {canEdit && mode === 'edit' && (
          <span className={`save-state ${saving}`} title={source.kind === 'cloud' ? 'Saved for your whole team' : 'Saved on this device'}>
            {saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : 'Saved'}
          </span>
        )}
        <details className="menu">
          <summary aria-label="Menu">
            {account ? <span className="avatar">{initials(account.name || account.email)}</span> : <span className="dots">•••</span>}
          </summary>
          <div className="menu-list" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
            {account && (
              <div className="menu-who">
                <b>{account.name}</b>
                <small>{account.email}</small>
                <small>
                  {account.companyName} · <span className={`role role-${role}`}>{ROLE_INFO[role].name}</span>
                </small>
              </div>
            )}
            {account?.onTeam && <button onClick={account.onTeam}>Team and roles</button>}
            {account?.onSwitchCompany && <button onClick={account.onSwitchCompany}>Switch company</button>}
            {account && <hr />}
            {mode === 'live' && <button onClick={() => setShiftOpen(true)}>Shift and tips</button>}
            {role !== 'valet' && <button onClick={() => setReportOpen(true)}>Stand report</button>}
            {mode === 'live' && <button onClick={() => setEventDialog(true)}>{event ? 'Event: change let-out time' : 'Start event mode'}</button>}
            <button onClick={() => exportPng(map).catch((e) => flash(e.message))}>Save map as image (PNG)</button>
            <button onClick={() => exportSvg(map)}>Save map as vector (SVG)</button>
            <button onClick={() => exportJson(map)}>Export map file</button>
            {account && (
              <>
                <hr />
                <button onClick={account.onSignOut}>Sign out</button>
              </>
            )}
          </div>
        </details>
      </header>

      <main>
        {mode === 'edit' && <Palette onAdd={(a) => addAsset(a)} open={panel === 'palette'} onClose={() => setPanel('none')} />}
        <div className={`stage ${mode === 'live' && (event || lotFull) ? 'has-pill' : ''}`} ref={stageRef}>
          <Canvas
            map={map}
            selected={selected}
            dispatch={dispatch}
            view={view}
            setView={setView}
            snapOn={snapOn}
            showGrid={showGrid && mode === 'edit'}
            highlight={highlight}
            onDropAsset={(name, x, y) => {
              const a = ASSETS.find((d) => d.name === name);
              if (a) addAsset(a, { x, y });
            }}
            mode={mode}
            occupied={occupied}
            requested={mode === 'live' ? requestedSpots : undefined}
            mustMove={mode === 'live' ? mustMoveSpots : undefined}
            now={now}
            activeSpot={activeSpotKey}
            onSpotClick={onSpotClick}
          />
          <div className="zoom">
            <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
              −
            </button>
            <button onClick={fit} title="Fit map to screen">
              {Math.round(view.z * 100)}%
            </button>
            <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">
              +
            </button>
          </div>
          <div className="mobile-tabs">
            {mode === 'edit' && (
              <button className={panel === 'palette' ? 'on' : ''} onClick={() => setPanel(panel === 'palette' ? 'none' : 'palette')}>
                ＋ Add
              </button>
            )}
            <button className={panel === 'inspector' ? 'on' : ''} onClick={() => setPanel(panel === 'inspector' ? 'none' : 'inspector')}>
              {mode === 'edit' ? 'Properties' : 'Cars'}
              {mode === 'live' && mapRequests.some((r) => r.status === 'open' && !isPre(r, now)) && (
                <span className="tab-badge">{mapRequests.filter((r) => r.status === 'open' && !isPre(r, now)).length}</span>
              )}
            </button>
          </div>
          {mode === 'live' && event && <EventPill event={event} onOpen={() => setPanel('inspector')} />}
          {mode === 'live' && lotFull && !event && (
            <div className="full-pill" role="status">
              Lot almost full · {openSpots} open
            </div>
          )}
          {toast && (
            <div className={`toast ${toast.undo ? 'with-action' : ''}`} role="status">
              {toast.msg}
              {toast.undo && (
                <button
                  onClick={() => {
                    const undo = toast.undo!;
                    setToast(null);
                    undo();
                  }}
                >
                  {toast.label ?? 'Undo'}
                </button>
              )}
            </div>
          )}
          {mode === 'live' && ((showUnsynced && unsynced > 0) || (!live && source.kind === 'cloud')) && (
            <div className="conn" role="status">
              {showUnsynced && unsynced > 0
                ? `No signal · ${unsynced} ${unsynced === 1 ? 'change' : 'changes'} saved on this phone`
                : 'Reconnecting… the lot may be out of date'}
            </div>
          )}
        </div>
        {mode === 'edit' ? (
          <Inspector
            map={map}
            selected={selItems}
            spotCount={spots.length}
            duplicates={duplicates}
            onPatch={(id, patch, key) => commit(map.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), { key })}
            onMeta={(patch) => dispatch({ type: 'meta', patch })}
            onFitLot={fitLotToObjects}
            onDuplicate={duplicate}
            onDelete={remove}
            onRotate={rotate}
            onOrder={order}
            open={panel === 'inspector'}
            onClose={() => setPanel('none')}
          />
        ) : (
          <LivePanel
            spots={spots}
            cars={mapCars}
            allCars={cars}
            orphans={orphans}
            active={activeSpot}
            now={now}
            moving={moving}
            suggestedTag={nextTag(cars, lastTag)}
            open={panel === 'inspector'}
            onClose={() => setPanel('none')}
            onPark={(spot, data) => {
              const car: ParkedCar = {
                ...data,
                id: uid(),
                mapId: map.id,
                spotKey: spot.key,
                spotLabel: spot.label,
                parkedAt: Date.now(),
                ...(source.kind === 'cloud' ? { guestToken: newGuestToken() } : {}),
              };
              setCars((cs) => [...cs, car]);
              run(source.parkCar(car), () => setCars((cs) => cs.filter((c) => c.id !== car.id)));
              setNow(Date.now());
              if (car.ticket) setLastTag(car.ticket);
              // jump to the next open spot so the next car is one tap away
              const taken = new Set([...mapCars.map((c) => c.spotKey), spot.key]);
              const next = nextOpenSpot(spots, taken, spot.key);
              setActiveSpotKey(next?.key ?? null);
              flash(`${carName(car)} parked in ${spot.label}${next ? ` · next ${next.label}` : ''}`);
            }}
            onUpdate={(car, patch) => {
              setCars((cs) => cs.map((c) => (c.id === car.id ? { ...c, ...patch } : c)));
              run(source.updateCar(car.id, patch));
              if (patch.ticket) setLastTag(patch.ticket);
              flash('Details saved');
            }}
            onRetrieve={retrieveCar}
            onFind={find}
            onKeys={setKeys}
            onBlocks={setBlocks}
            requests={mapRequests}
            me={source.me.id}
            onRequest={requestCar}
            event={event}
            outSince={outSince}
            stand={stand}
            onEditEvent={() => setEventDialog(true)}
            shift={myShift}
            onShift={() => setShiftOpen(true)}
            preUntil={event && event.letOutAt > now ? event.letOutAt : undefined}
            onRequestTag={(tag, dueAt) => {
              const t = tag.replace(/^#/, '').trim().toLowerCase();
              const car = mapCars.find((c) => c.ticket.trim().toLowerCase() === t) ?? cars.find((c) => c.ticket.trim().toLowerCase() === t);
              if (!car) return `No car with tag #${tag} is parked`;
              if (car.mapId !== map.id) return `#${tag} is on another lot`;
              if (requests.some((r) => r.carId === car.id)) return `#${tag} is already requested`;
              requestCar(car, dueAt);
              return null;
            }}
            onGuestLink={source.kind === 'cloud' ? setGuestLinkCar : undefined}
            onPhotos={setPhotoCar}
            onClaim={(r) => {
              patchRequest(r.id, { status: 'claimed', claimedBy: source.me.id, claimedByName: source.me.name, claimedAt: Date.now() });
              // whoever goes for the car takes its keys off the board
              const car = cars.find((c) => c.id === r.carId);
              if (car && !car.keysWith)
                setCars((cs) =>
                  cs.map((c) => (c.id === car.id ? { ...c, keysWith: source.me.id, keysWithName: source.me.name, keysOutAt: Date.now() } : c)),
                );
              run(source.claimRequest(r.id).then(() => (car && !car.keysWith ? source.setKeys(car.id, true) : undefined)))
                .then(refreshRequests)
                .then(refreshCars);
            }}
            onUnclaim={(r) => {
              patchRequest(r.id, { status: 'open', claimedBy: '', claimedByName: '', claimedAt: null });
              run(source.unclaimRequest(r.id)).then(refreshRequests);
            }}
            onReady={(r) => {
              patchRequest(r.id, { status: 'ready', readyAt: Date.now() });
              run(source.markReady(r.id)).then(refreshRequests);
            }}
            onCancel={(r) => {
              setRequests((rs) => rs.filter((x) => x.id !== r.id));
              run(source.cancelRequest(r.id)).then(refreshRequests);
            }}
            onHandOver={retrieveCar}
            onStartMove={setMoving}
            onFocus={(s) => {
              setActiveSpotKey(s.key);
              centerOn(s);
            }}
          />
        )}
      </main>

      {eventDialog && (
        <EventDialog
          event={event}
          onClose={() => setEventDialog(false)}
          onSave={(e) => {
            const fresh = !event;
            setEvent(e);
            setEventDialog(false);
            run(fresh ? source.startEvent(e) : source.updateEvent(e.id, e)).then(refreshEvent);
            flash(fresh ? `Event mode on: let-out at ${new Date(e.letOutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Let-out time saved');
            setPanel('inspector');
          }}
          onEnd={() => {
            if (!event) return;
            setEvent(null);
            setEventDialog(false);
            run(source.endEvent(event.id)).then(refreshEvent);
            flash('Event ended');
          }}
        />
      )}
      {reportOpen && <Dashboard source={source} onClose={() => setReportOpen(false)} />}
      {shiftOpen && (
        <ShiftSheet
          me={source.me}
          isManager={role !== 'valet'}
          isAdmin={role === 'admin'}
          now={now}
          shifts={shifts}
          tips={tips}
          tipUrl={tipUrl}
          cars={cars}
          requests={requests}
          onClose={() => setShiftOpen(false)}
          onClockIn={(s) => {
            setShifts((ss) => [...ss, s]);
            run(source.clockIn(s), () => setShifts((ss) => ss.filter((x) => x.id !== s.id))).then(refreshTeam);
            flash('Clocked in');
          }}
          onClockOut={(s, note) => {
            setShifts((ss) => ss.map((x) => (x.id === s.id ? { ...x, endedAt: Date.now(), handoffNote: note } : x)));
            run(source.clockOut(s.id, note)).then(refreshTeam);
            flash(s.userId === source.me.id ? `Clocked out after ${duration(Date.now() - s.startedAt)}` : `${s.userName || 'Valet'} clocked out`);
          }}
          onTip={(t) => {
            setTips((ts) => [...ts, t]);
            run(source.addTip(t), () => setTips((ts) => ts.filter((x) => x.id !== t.id))).then(refreshTeam);
            flash(`${money(t.amountCents)} ${t.method === 'cash' ? 'cash' : 'digital'} tip logged`);
          }}
          onVoidTip={(t) => {
            setTips((ts) => ts.filter((x) => x.id !== t.id));
            run(source.voidTip(t.id), () => setTips((ts) => [...ts, t])).then(refreshTeam);
          }}
          onTipUrl={(u) => {
            setTipUrl(u);
            run(source.setTipUrl(u)).then(refreshTeam);
            flash(u ? 'Tip link saved' : 'Tip link removed');
          }}
        />
      )}
      {photoCar && <PhotoSheet car={photoCar} source={source} queue={photoQueue} onClose={() => setPhotoCar(null)} />}
      {guestLinkCar && <GuestLinkDialog car={guestLinkCar} company={account?.companyName} onClose={() => setGuestLinkCar(null)} />}

      {showMaps && (
        <MapsDialog
          maps={maps}
          currentId={map.id}
          onOpen={(m) => load(m, false)}
          onTemplate={(t: Template) => load(instantiate(t), true)}
          canEdit={canEdit}
          onDelete={(m) => {
            run(source.deleteMap(m.id));
            setCars((cs) => cs.filter((c) => c.mapId !== m.id));
            const rest = maps.filter((x) => x.id !== m.id);
            setMaps(rest);
            if (m.id === map.id) load(rest[0] ?? instantiate(TEMPLATES[0]), false);
          }}
          onImport={importFile}
          onClose={() => setShowMaps(false)}
        />
      )}
    </div>
  );
}
