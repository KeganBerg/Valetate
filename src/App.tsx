import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ASSETS, type AssetDef } from './assets';
import { Canvas, MAX_Z, MIN_Z, type View } from './components/Canvas';
import { Inspector, Stepper } from './components/Inspector';
import { Guide } from './components/Guide';
import { AlignBar } from './components/Satellite';
import { ATTRIBUTION, placeBackdrop } from './backdrop';
import { SitesDialog } from './components/SitesDialog';
import { AreaDialog } from './components/AreaDialog';
import { Palette } from './components/Palette';
import { exportJson, exportPng, exportSvg, parseMapFile } from './export';
import { GRID, duplicateSpotLabels, listSpots, lotAround, snap, uid, unionBounds } from './geometry';
import { canEditMaps, MapConflict, ROLE_INFO, type DataSource, type Role } from './data/source';
import { friendlyError } from './errors';
import { currentMapId, setCurrentMapId } from './storage';
import { useBackToClose } from './dialog';
import { saveCachedMaps } from './lotCache';
import { GettingStarted } from './components/GettingStarted';
import { initState, reducer } from './store';
import { TEMPLATES, instantiate, instantiateSite, type SiteTemplate, type Template } from './templates';
import { AREA_KINDS, areaInfo, areasOf, findInSite, newSite, nextPosition } from './sites';
import type { LotMap, MapItem, Site, Spot } from './types';

const blankTemplate = () => TEMPLATES.find((t) => t.key === 'blank') ?? TEMPLATES[0];

function initialMap(maps: LotMap[]): { map: LotMap; firstRun: boolean; draft?: Site } {
  const id = currentMapId();
  const found = maps.find((m) => m.id === id) ?? maps[0];
  if (found) return { map: found, firstRun: false };
  // nothing yet: an empty site to start in, saved once something is drawn
  const draft = newSite('My site');
  return { map: instantiate(blankTemplate(), { siteId: draft.id, name: 'Whole site', position: 0 }), firstRun: true, draft };
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

function itemTitle(it: MapItem | undefined) {
  if (!it) return 'Item';
  if (it.kind === 'space' && it.accessible) return 'Accessible space';
  if (it.kind === 'spaceRow') return it.prefix?.trim() ? `Row ${it.prefix.trim()}` : 'Row of spaces';
  return ASSETS.find((a) => a.kind === it.kind)?.name ?? 'Item';
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
  /** people on the team (admins only; for the setup steps) */
  teamSize?: number;
}

interface Props {
  source: DataSource;
  role: Role;
  account?: Account;
  initialMaps: LotMap[];
  initialSites: Site[];
  /** where to keep a copy of the maps for opening with no signal */
  cacheKey?: string;
}

export default function App({ source, role, account, initialMaps, initialSites, cacheKey }: Props) {
  const canEdit = canEditMaps(role);
  const init = useMemo(() => initialMap(initialMaps), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, dispatch] = useReducer(reducer, init.map, initState);
  const { map, selected } = state;
  const [maps, setMaps] = useState<LotMap[]>(initialMaps);
  const [sites, setSites] = useState<Site[]>(initialSites);
  // sites made on this device that aren't saved yet: saved just before their first area
  const pendingSites = useRef(new Map<string, Site>(init.draft ? [[init.draft.id, init.draft]] : []));
  const [showMaps, setShowMaps] = useState(init.firstRun && canEdit);
  const [showAddArea, setShowAddArea] = useState(false);
  const [areaMenu, setAreaMenu] = useState(false);
  const [view, setViewState] = useState<View>({ x: 40, y: 40, z: 0.6 });
  // until someone pans or zooms, keep the lot fitted as the window changes size
  const autoFit = useRef(true);
  const setView = useCallback((v: View | ((v: View) => View)) => {
    autoFit.current = false;
    setViewState(v);
  }, []);
  const [snapOn, setSnapOn] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved');
  const [panel, setPanel] = useState<'none' | 'palette' | 'inspector'>('none');
  const [alignOn, setAlignOn] = useState(false);
  // the step-by-step guide for drawing a first lot
  const [guideOn, setGuideOn] = useState(false);
  // on a phone the panels are sheets over the map: back closes them
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 820px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 820px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useBackToClose(phone && panel !== 'none', () => setPanel('none'));
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<Spot | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; label?: string } | null>(null);
  const [live, setLive] = useState(true);
  // a new company's admin sees the setup steps until they're done or hidden
  const setupKey = cacheKey && `${cacheKey}.setup`;
  const [setupHidden, setSetupHidden] = useState(() => {
    try {
      return !!(setupKey && JSON.parse(localStorage.getItem(setupKey) ?? '{}').hidden);
    } catch {
      return false;
    }
  });
  const hideSetup = () => {
    setSetupHidden(true);
    try {
      if (setupKey) localStorage.setItem(setupKey, JSON.stringify({ hidden: true }));
    } catch {
      // not remembered; it shows again next time
    }
  };
  useEffect(() => {
    if (!cacheKey) return;
    const t = window.setTimeout(() => saveCachedMaps(cacheKey, maps, sites), 1000);
    return () => window.clearTimeout(t);
  }, [cacheKey, maps, sites]);
  const stageRef = useRef<HTMLDivElement>(null);
  const clipboard = useRef<MapItem[]>([]);
  const loadedRef = useRef<LotMap>(init.map);

  const spots = useMemo(() => listSpots(map.items), [map.items]);
  const duplicates = useMemo(() => duplicateSpotLabels(map.items), [map.items]);

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
          const pending = m.siteId ? pendingSites.current.get(m.siteId) : undefined;
          if (pending) {
            await source.saveSite(pending);
            pendingSites.current.delete(pending.id);
            setSites((ss) => (ss.some((x) => x.id === pending.id) ? ss : [...ss, pending]));
          }
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

  // live updates from other devices
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(
    () =>
      source.subscribe({
        live: setLive,
        maps: async () => {
          const [ss, ms] = await Promise.all([source.listSites(), source.listMaps()]).catch(() => [null, null]);
          if (!ms || !ss) return;
          setMaps(ms);
          setSites([...ss, ...[...pendingSites.current.values()].filter((p) => !ss.some((x) => x.id === p.id))]);
          // someone else changed the map on screen: viewers follow along (editors keep their work)
          const cur = ms.find((m) => m.id === mapRef.current.id);
          if (cur && cur.updatedAt > mapRef.current.updatedAt && !canEdit) {
            loadedRef.current = cur;
            noteVersion(cur);
            dispatch({ type: 'load', map: cur });
          }
        },
      }),
    [source, canEdit], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // lining up the satellite photo ends on its own when the photo goes away or the map changes
  const aligning = alignOn && canEdit && !!map.backdrop && !map.backdrop.hidden;
  useEffect(() => setAlignOn(false), [map.id]);

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
    if (!g) return flash('The area already fits everything on it');
    applyLot(g);
    requestAnimationFrame(fit);
    flash(`The area is now ${g.width} × ${g.height}`);
  };

  const load = (m: LotMap, persist: boolean) => {
    loadedRef.current = persist ? (null as unknown as LotMap) : m;
    if (!persist) noteVersion(m);
    dispatch({ type: 'load', map: m });
    setShowMaps(false);
    setHighlight(null);
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
    // zoomed far out (a phone showing the whole lot), a new row is a speck: zoom in so it can be grabbed
    if (!at) {
      const r = stageRef.current!.getBoundingClientRect();
      // a comfortable working size: the row fills most of the width, small things show life-size
      const want = Math.min(1, (r.width * 0.6) / Math.max(it.w, it.h));
      if (Math.max(it.w, it.h) * view.z < 160 && want > view.z) {
        const cx = it.x + it.w / 2;
        const cy = it.y + it.h / 2;
        setView({ z: want, x: r.width / 2 - cx * want, y: r.height / 2 - cy * want });
      }
    }
  };

  const selItems = map.items.filter((i) => selected.includes(i.id));

  /** open the step-by-step guide, on a new site, a new area of this site, or the area that's open */
  const startGuide = (fresh: false | 'site' | 'area') => {
    if (fresh === 'site') {
      const s = newSite('New site');
      pendingSites.current.set(s.id, s);
      setSites((ss) => [...ss, s]);
      load(instantiate(blankTemplate(), { siteId: s.id, name: 'Whole site', position: 0 }), true);
    } else if (fresh === 'area' && map.siteId) {
      setShowAddArea(false);
      load(instantiate(blankTemplate(), { siteId: map.siteId, name: 'New area', position: nextPosition(maps, map.siteId) }), true);
    }
    setShowMaps(false);
    dispatch({ type: 'select', ids: [] });
    setPanel('none');
    setGuideOn(true);
  };

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
    const what = selected.length === 1 ? itemTitle(selItems[0]).toLowerCase() : `${selected.length} things`;
    commit(
      map.items.filter((i) => !selected.includes(i.id)),
      { select: [] },
    );
    // deleting is the scariest tap: say what went and offer it back right there
    flash(`Deleted ${what}`, () => dispatch({ type: 'undo' }), 'Undo');
  };

  const deselect = () => {
    dispatch({ type: 'select', ids: [] });
    setPanel('none');
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

  const centerOn = (s: Spot) => {
    const r = stageRef.current!.getBoundingClientRect();
    const z = Math.max(view.z, 1.2);
    // on phones the bottom sheet covers the lower half, so aim higher
    const cy = r.width <= 820 ? r.height * 0.28 : r.height / 2;
    setView({ z, x: r.width / 2 - s.cx * z, y: cy - s.cy * z });
  };

  // ---------- sites and areas ----------

  const site: Site | undefined = sites.find((x) => x.id === map.siteId) ?? (map.siteId ? pendingSites.current.get(map.siteId) : undefined);
  // the areas of the site on screen, with the one being edited as it is now
  const areas = useMemo(() => {
    if (!map.siteId) return [map];
    const list = areasOf(maps, map.siteId).map((a) => (a.id === map.id ? map : a));
    return list.some((a) => a.id === map.id) ? list : areasOf([...list, map], map.siteId);
  }, [maps, map]);

  const openArea = (a: LotMap) => {
    setAreaMenu(false);
    if (a.id !== map.id) load(a, false);
  };

  /** a new site from a starting point: the site, then each of its areas */
  const startSite = (t: SiteTemplate) => {
    const s = newSite(t.name);
    pendingSites.current.set(s.id, s);
    setSites((ss) => [...ss, s]);
    const [first, ...rest] = instantiateSite(t, s.id);
    load(first, true);
    for (const a of rest) {
      upsertMapInList(a);
      persistMap(a);
    }
    flash(`Started “${s.name}” with ${t.areas.length === 1 ? '1 area' : `${t.areas.length} areas`}. Rename anything by tapping it.`);
  };

  const renameSite = (s: Site, name: string) => {
    const next = { ...s, name, updatedAt: Date.now() };
    setSites((ss) => ss.map((x) => (x.id === s.id ? next : x)));
    if (pendingSites.current.has(s.id)) pendingSites.current.set(s.id, next);
    else source.saveSite(next).catch((e) => flash(friendlyError(e)));
  };

  const deleteSite = (s: Site) => {
    pendingSites.current.delete(s.id);
    source.deleteSite(s.id).catch((e) => flash(friendlyError(e)));
    const restSites = sites.filter((x) => x.id !== s.id);
    const restMaps = maps.filter((m) => m.siteId !== s.id);
    setSites(restSites);
    setMaps(restMaps);
    if (map.siteId === s.id) {
      const next = restSites.map((x) => areasOf(restMaps, x.id)[0]).find(Boolean);
      if (next) load(next, false);
      else {
        const draft = newSite('My site');
        pendingSites.current.set(draft.id, draft);
        load(instantiate(blankTemplate(), { siteId: draft.id, name: 'Whole site', position: 0 }), false);
        setShowMaps(true);
      }
    }
    flash(`Deleted “${s.name}”`);
  };

  const addArea = (t: Template) => {
    if (!map.siteId) return;
    const taken = new Set(areas.map((a) => a.name));
    const base = t.build().name;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    setShowAddArea(false);
    load(instantiate(t, { siteId: map.siteId, name, position: nextPosition(maps, map.siteId) }), true);
  };

  /** move the area on screen one tab left (-1) or right (+1) */
  const moveArea = (dir: -1 | 1) => {
    const i = areas.findIndex((a) => a.id === map.id);
    const j = i + dir;
    if (j < 0 || j >= areas.length) return;
    const order = [...areas];
    [order[i], order[j]] = [order[j], order[i]];
    const now = Date.now();
    order.forEach((a, position) => {
      if (a.position === position) return;
      if (a.id === map.id) dispatch({ type: 'meta', patch: { position } });
      else {
        const moved = { ...a, position, updatedAt: now };
        setMaps((ms) => ms.map((x) => (x.id === a.id ? moved : x)));
        persistMap(moved);
      }
    });
  };

  const deleteArea = () => {
    const i = areas.findIndex((a) => a.id === map.id);
    const next = areas[i + 1] ?? areas[i - 1];
    if (!next) return;
    const gone = map;
    source.deleteMap(gone.id).catch((e) => flash(friendlyError(e)));
    setMaps((ms) => ms.filter((x) => x.id !== gone.id));
    setAreaMenu(false);
    load(next, false);
    flash(`Deleted the “${gone.name}” area`, () => {
      versions.current.delete(gone.id);
      load({ ...gone, updatedAt: Date.now() }, true);
    });
  };

  const find = (q: string) => {
    if (!q.trim()) return;
    const found = findInSite(areas, map.id, q);
    if (!found) return flash(`Nothing called "${q}" on this site`);
    const s = found.spot;
    const show = () => {
      setHighlight(s);
      centerOn(s);
      if (canEdit) dispatch({ type: 'select', ids: [s.itemId] });
    };
    if (found.map.id !== map.id) {
      load(found.map, false);
      // after the new area has been fitted to the screen
      requestAnimationFrame(() => requestAnimationFrame(show));
      flash(`“${s.label}” is in ${found.map.name}`);
    } else show();
    window.setTimeout(() => setHighlight((h) => (h === s ? null : h)), 4000);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (showMaps || showAddArea || !canEdit) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
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
      // always import as a new area of this site, so it can't overwrite an existing map
      load(
        { ...m, id: uid(), updatedAt: Date.now(), siteId: map.siteId, position: map.siteId ? nextPosition(maps, map.siteId) : 0, version: undefined },
        true,
      );
      flash(`Imported "${m.name}"`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not import that file');
    }
  };

  // one short line on what to do next, in plain words
  const single = selItems.length === 1 ? selItems[0] : null;
  const canvasHint =
    !canEdit || aligning || guideOn
      ? null
      : selItems.length
        ? phone
          ? 'Drag it to move it. Drag a white square to stretch it.'
          : 'Drag it to move it. Drag a white square to stretch it, or the round dot to turn it.'
        : map.items.length === 0
          ? phone
            ? 'Tap ＋ Add at the bottom to put things on your map.'
            : 'Click a picture on the left (or drag it onto the map) to add it.'
          : null;

  const findForm = (
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
        placeholder="Find: D 12, First aid…"
        aria-label="Find a space or place on this site"
        enterKeyHint="search"
      />
    </form>
  );

  return (
    <div className={`app ${canEdit ? 'mode-edit' : 'mode-view'}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">V</span>
          <span className="brand-name">Valetate</span>
        </div>
        <button className="map-name" onClick={() => setShowMaps(true)} title="Switch to another site">
          {site?.name || 'Untitled site'} <span className="caret">▾</span>
        </button>
        {(!canEdit || !phone) && findForm}
        <div className="grow" />
        {canEdit && (
          <div className="tools">
            <button className="history" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Undo your last change (Ctrl+Z)">
              <span aria-hidden>↶</span> Undo
            </button>
            <button className="history redo" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Put back what you undid (Ctrl+Shift+Z)">
              <span aria-hidden>↷</span> Redo
            </button>
          </div>
        )}
        {canEdit && (
          <span className={`save-state ${saving}`} title={source.kind === 'cloud' ? 'Saved for your whole team' : 'Saved on this device'}>
            {saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : '✓ Saved'}
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
            <button onClick={() => setShowMaps(true)}>{canEdit ? 'My sites and starting points' : 'All sites'}</button>
            {canEdit && <button onClick={() => setShowAddArea(true)}>Add an area to this site</button>}
            {canEdit && <button onClick={() => startGuide(false)}>Show me how (step by step)</button>}
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

      <nav className="area-tabs" aria-label={`Areas of ${site?.name ?? 'this site'}`}>
        {areas.map((a) => {
          const on = a.id === map.id;
          return (
            <button
              key={a.id}
              className={`area-tab ${on ? 'on' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-expanded={on && canEdit ? areaMenu : undefined}
              onClick={() => (on ? canEdit && setAreaMenu(!areaMenu) : openArea(a))}
              title={on && canEdit ? 'Rename, move or delete this area' : `Open ${a.name}`}
            >
              <span aria-hidden="true">{areaInfo(a.areaKind).icon}</span> {a.name || 'Untitled area'}
              {on && canEdit && <span className="caret"> ▾</span>}
            </button>
          );
        })}
        {canEdit && (
          <button className="area-tab add-area" onClick={() => setShowAddArea(true)}>
            ＋ Add an area
          </button>
        )}
      </nav>
      {areaMenu && canEdit && (
        <div className="area-menu" role="dialog" aria-label="Change this area">
          <label className="field">
            <span>Area name</span>
            <input
              value={map.name}
              onChange={(e) => dispatch({ type: 'meta', patch: { name: e.target.value } })}
              onKeyDown={(e) => e.key === 'Enter' && setAreaMenu(false)}
              placeholder="Front lawn, Lot B, Level 2…"
            />
          </label>
          <label className="field">
            <span>What kind of area</span>
            <select value={map.areaKind ?? 'lot'} onChange={(e) => dispatch({ type: 'meta', patch: { areaKind: e.target.value as LotMap['areaKind'] } })}>
              {AREA_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.icon} {k.name}
                </option>
              ))}
            </select>
          </label>
          {areas.length > 1 && (
            <div className="row-actions">
              <button onClick={() => moveArea(-1)} disabled={areas[0]?.id === map.id}>
                ← Move left
              </button>
              <button onClick={() => moveArea(1)} disabled={areas[areas.length - 1]?.id === map.id}>
                Move right →
              </button>
            </div>
          )}
          <div className="row-actions">
            {areas.length > 1 ? (
              <button className="danger" onClick={deleteArea}>
                🗑 Delete this area
              </button>
            ) : (
              <small className="muted">A site needs at least one area. To remove it, delete the whole site.</small>
            )}
            <div className="grow" />
            <button className="primary" onClick={() => setAreaMenu(false)}>
              ✓ Done
            </button>
          </div>
        </div>
      )}

      <main>
        {canEdit && <Palette onAdd={(a) => addAsset(a)} open={panel === 'palette'} onClose={() => setPanel('none')} />}
        <div className="stage" ref={stageRef}>
          <Canvas
            map={map}
            selected={selected}
            dispatch={dispatch}
            view={view}
            setView={setView}
            snapOn={snapOn}
            showGrid={showGrid && canEdit}
            highlight={highlight}
            onDropAsset={(name, x, y) => {
              const a = ASSETS.find((d) => d.name === name);
              if (a) addAsset(a, { x, y });
            }}
            readOnly={!canEdit}
            aligning={aligning}
          />
          {aligning && map.backdrop && (
            <AlignBar backdrop={map.backdrop} onChange={(backdrop) => dispatch({ type: 'meta', patch: { backdrop } })} onDone={() => setAlignOn(false)} />
          )}
          {map.backdrop && !map.backdrop.hidden && <div className="sat-credit">{ATTRIBUTION}</div>}
          <div className="zoom">
            <button className="zoom-step" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
              −
            </button>
            <button className="zoom-fit" onClick={fit} title={`Show the whole area (now ${Math.round(view.z * 100)}%)`}>
              Show all
            </button>
            <button className="zoom-step" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
              +
            </button>
          </div>
          {canvasHint && !toast && (
            <div className="canvas-hint" role="note">
              {canvasHint}
            </div>
          )}
          {canEdit && !selItems.length && !aligning && (
            <div className="mobile-tabs">
              <button
                className={`add-tab ${panel === 'palette' ? 'on' : ''}`}
                onClick={() => setPanel(panel === 'palette' ? 'none' : 'palette')}
              >
                ＋ Add
              </button>
              <button className={panel === 'inspector' ? 'on' : ''} onClick={() => setPanel(panel === 'inspector' ? 'none' : 'inspector')}>
                Size and photo
              </button>
            </div>
          )}
          {canEdit && phone && selItems.length > 0 && panel !== 'inspector' && !aligning && (
            <div className="select-bar" role="toolbar" aria-label="Change what you picked">
              <div className="sb-head">
                <b>{single ? itemTitle(single) : `${selItems.length} things picked`}</b>
                <button className="primary" onClick={deselect}>
                  ✓ Done
                </button>
              </div>
              {single?.kind === 'spaceRow' && (
                <Stepper
                  label="Number of spaces"
                  unit="space"
                  value={single.count ?? 1}
                  onChange={(count) => {
                    const cw = single.w / (single.count ?? 1);
                    commit(
                      map.items.map((i) => (i.id === single.id ? { ...i, count, w: cw * count } : i)),
                      { key: `${single.id}:count` },
                    );
                  }}
                />
              )}
              <div className="big-actions four">
                <button onClick={() => rotate(90)}>
                  <i aria-hidden>↻</i>Turn
                </button>
                <button onClick={duplicate}>
                  <i aria-hidden>⧉</i>Copy
                </button>
                <button className="danger" onClick={remove}>
                  <i aria-hidden>🗑</i>Delete
                </button>
                <button onClick={() => setPanel('inspector')}>
                  <i aria-hidden>⋯</i>More
                </button>
              </div>
            </div>
          )}
          {guideOn && canEdit && !aligning && (
            <Guide
              map={map}
              onPlace={(p) => {
                const b = map.backdrop;
                const next = placeBackdrop(p.lat, p.lng, map, p.name);
                dispatch({ type: 'meta', patch: { backdrop: b ? { ...next, scale: b.scale, rotation: b.rotation, opacity: b.opacity } : next } });
                setAlignOn(true);
              }}
              onAdd={(name) => {
                const a = ASSETS.find((d) => d.name === name);
                if (a) addAsset(a);
              }}
              onClose={() => setGuideOn(false)}
            />
          )}
          {role === 'admin' && account && setupKey && !setupHidden && !guideOn && (
            <GettingStarted
              company={account.companyName}
              onHide={hideSetup}
              done="Your site is drawn and your team can open it."
              steps={[
                {
                  label: 'Draw your site',
                  hint: 'Start from a ready-made site, then move things to match your real one.',
                  done: maps.length > 0,
                  action: { label: 'Pick a site', run: () => setShowMaps(true) },
                },
                {
                  label: 'Invite your team',
                  hint: 'Text them a link. They join with one tap and see your sites.',
                  done: (account.teamSize ?? 1) > 1,
                  action: account.onTeam && { label: 'Invite', run: account.onTeam },
                },
              ]}
            />
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
          {!live && source.kind === 'cloud' && (
            <div className="conn" role="status">
              Reconnecting… changes from your team may be delayed
            </div>
          )}
        </div>
        {canEdit && (
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
            onAlign={() => {
              setAlignOn(true);
              setPanel('none');
              dispatch({ type: 'select', ids: [] });
            }}
            onDone={deselect}
            showGrid={showGrid}
            onShowGrid={setShowGrid}
            snapOn={snapOn}
            onSnap={setSnapOn}
          />
        )}
      </main>

      {showMaps && (
        <SitesDialog
          sites={sites.filter((x) => !pendingSites.current.has(x.id) || x.id === map.siteId)}
          maps={areas.length ? [...maps.filter((m) => m.siteId !== map.siteId), ...areas] : maps}
          currentSiteId={map.siteId}
          onOpen={(x) => {
            const first = x.id === map.siteId ? map : areasOf(maps, x.id)[0];
            if (first) load(first, false);
            else setShowMaps(false);
          }}
          onTemplate={startSite}
          onGuide={() => startGuide('site')}
          onRename={renameSite}
          onDelete={deleteSite}
          canEdit={canEdit}
          onImport={importFile}
          onClose={() => setShowMaps(false)}
        />
      )}
      {showAddArea && (
        <AreaDialog
          siteName={site?.name ?? 'this site'}
          onPick={addArea}
          onGuide={() => startGuide('area')}
          onClose={() => setShowAddArea(false)}
        />
      )}
    </div>
  );
}
