import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ASSETS, type AssetDef } from './assets';
import { Canvas, MAX_Z, MIN_Z, type View } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { LivePanel } from './components/LivePanel';
import { MapsDialog } from './components/MapsDialog';
import { Palette } from './components/Palette';
import { exportJson, exportPng, exportSvg, parseMapFile } from './export';
import { GRID, duplicateSpotLabels, findSpot, listSpots, lotAround, snap, uid, unionBounds } from './geometry';
import { canEditMaps, ROLE_INFO, type DataSource, type Role } from './data/source';
import { carMatches, nextOpenSpot, nextTag } from './ops';
import { currentMapId, setCurrentMapId } from './storage';
import { initState, reducer } from './store';
import { TEMPLATES, instantiate, type Template } from './templates';
import { liveRequests } from './requests';
import type { CarRequest, LotMap, MapItem, ParkedCar, Spot } from './types';

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

const LAST_TAG_KEY = 'valetate.lastTag.';
function readLastTag(mapId: string): string {
  try {
    return localStorage.getItem(LAST_TAG_KEY + mapId) ?? '';
  } catch {
    return '';
  }
}
function writeLastTag(mapId: string, tag: string) {
  try {
    localStorage.setItem(LAST_TAG_KEY + mapId, tag);
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
  const [toast, setToast] = useState<string | null>(null);
  const [cars, setCars] = useState<ParkedCar[]>(initialCars);
  const [activeSpotKey, setActiveSpotKey] = useState<string | null>(null);
  const [moving, setMoving] = useState<ParkedCar | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastTag, setLastTagState] = useState<string>(() => readLastTag(init.map.id));
  const setLastTag = (t: string) => {
    setLastTagState(t);
    writeLastTag(map.id, t);
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const clipboard = useRef<MapItem[]>([]);
  const loadedRef = useRef<LotMap>(init.map);

  const spots = useMemo(() => listSpots(map.items), [map.items]);
  const duplicates = useMemo(() => duplicateSpotLabels(map.items), [map.items]);
  const mapCars = useMemo(() => cars.filter((c) => c.mapId === map.id), [cars, map.id]);
  const occupied = useMemo(() => new Map(mapCars.map((c) => [c.spotKey, c])), [mapCars]);
  const activeSpot = spots.find((s) => s.key === activeSpotKey) ?? null;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const upsertMapInList = (m: LotMap) => setMaps((ms) => [m, ...ms.filter((x) => x.id !== m.id)]);

  const persistMap = useCallback(
    async (m: LotMap) => {
      setSaving('saving');
      try {
        await source.saveMap(m);
        setSaving('saved');
      } catch (e) {
        setSaving('error');
        flash(`Couldn't save: ${e instanceof Error ? e.message : e}`);
      }
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
    setLastTagState(readLastTag(map.id));
  }, [map.id]);

  // retrieval requests, and a heads-up when a new one comes in from another device
  const [requests, setRequests] = useState<CarRequest[]>([]);
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
  useEffect(() => {
    refreshRequests();
  }, [refreshRequests]);
  const mapRequests = useMemo(
    () => liveRequests(requests, new Set(mapCars.map((c) => c.id))),
    [requests, mapCars],
  );
  const requestedSpots = useMemo(() => {
    const byCar = new Map(mapCars.map((c) => [c.id, c.spotKey]));
    return new Map(mapRequests.map((r) => [byCar.get(r.carId)!, r.status]));
  }, [mapRequests, mapCars]);
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
        maps: async () => {
          const ms = await source.listMaps().catch(() => null);
          if (!ms) return;
          setMaps(ms);
          // someone else changed the map we're looking at: follow along unless we're editing it
          const cur = ms.find((m) => m.id === mapRef.current.id);
          if (cur && cur.updatedAt > mapRef.current.updatedAt && modeRef.current === 'live') {
            loadedRef.current = cur;
            dispatch({ type: 'load', map: cur });
          }
        },
      }),
    [source, refreshCars, refreshRequests],
  );

  const run = (p: Promise<unknown>, undo?: () => void) =>
    p.catch((e) => {
      flash(e instanceof Error ? e.message : String(e));
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

  const centerOn = (s: Spot) => {
    const r = stageRef.current!.getBoundingClientRect();
    const z = Math.max(view.z, 1.2);
    // on phones the bottom sheet covers the lower half, so aim higher
    const cy = r.width <= 820 ? r.height * 0.28 : r.height / 2;
    setView({ z, x: r.width / 2 - s.cx * z, y: cy - s.cy * z });
  };

  const find = (q: string) => {
    let s = findSpot(map.items, q);
    // in the live lot, "104" most often means tag 104, so check cars first
    const car = mapCars.find((c) => carMatches(c, q) && q.trim());
    if (car && (mode === 'live' || !s)) s = spots.find((sp) => sp.key === car.spotKey) ?? s;
    if (!s) {
      flash(`Nothing called "${q}"`);
      return;
    }
    setHighlight(s);
    centerOn(s);
    if (mode === 'edit') dispatch({ type: 'select', ids: [s.itemId] });
    else {
      setActiveSpotKey(s.key);
      setPanel('inspector');
    }
    window.setTimeout(() => setHighlight((h) => (h === s ? null : h)), 4000);
  };

  const onSpotClick = (s: Spot | null) => {
    if (moving && s) {
      if (occupied.has(s.key)) return flash(`Spot ${s.label} is taken`);
      setCars((cs) => cs.map((c) => (c.id === moving.id ? { ...c, spotKey: s.key, spotLabel: s.label } : c)));
      run(source.moveCar(moving.id, s.key, s.label));
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find spot: D 12" aria-label="Find a spot" />
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
        <div className="stage" ref={stageRef}>
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
              {mode === 'live' && mapRequests.some((r) => r.status === 'open') && (
                <span className="tab-badge">{mapRequests.filter((r) => r.status === 'open').length}</span>
              )}
            </button>
          </div>
          {toast && <div className="toast">{toast}</div>}
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
            active={activeSpot}
            now={now}
            moving={moving}
            suggestedTag={nextTag(mapCars, lastTag)}
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
            onRetrieve={(car) => {
              setCars((cs) => cs.filter((c) => c.id !== car.id));
              setRequests((rs) => rs.filter((r) => r.carId !== car.id));
              run(source.retrieveCar(car.id));
              flash(`${carName(car)} retrieved from ${car.spotLabel}`);
            }}
            requests={mapRequests}
            me={source.me.id}
            onRequest={(car) => {
              const r: CarRequest = {
                id: uid(),
                carId: car.id,
                mapId: car.mapId,
                status: 'open',
                note: '',
                createdAt: Date.now(),
                createdByName: source.me.name,
                claimedBy: '',
                claimedByName: '',
                claimedAt: null,
              };
              seenRequests.current?.add(r.id);
              setRequests((rs) => [...rs, r]);
              run(source.createRequest(r), () => setRequests((rs) => rs.filter((x) => x.id !== r.id))).then(refreshRequests);
              setNow(Date.now());
              flash(`${carName(car)} requested`);
            }}
            onClaim={(r) => {
              patchRequest(r.id, { status: 'claimed', claimedBy: source.me.id, claimedByName: source.me.name, claimedAt: Date.now() });
              run(source.claimRequest(r.id)).then(refreshRequests);
            }}
            onUnclaim={(r) => {
              patchRequest(r.id, { status: 'open', claimedBy: '', claimedByName: '', claimedAt: null });
              run(source.unclaimRequest(r.id)).then(refreshRequests);
            }}
            onCancel={(r) => {
              setRequests((rs) => rs.filter((x) => x.id !== r.id));
              run(source.cancelRequest(r.id)).then(refreshRequests);
            }}
            onDone={(r, car) => {
              setCars((cs) => cs.filter((c) => c.id !== car.id));
              setRequests((rs) => rs.filter((x) => x.id !== r.id));
              run(source.retrieveCar(car.id)).then(refreshRequests);
              flash(`${carName(car)} delivered`);
            }}
            onStartMove={setMoving}
            onFocus={(s) => {
              setActiveSpotKey(s.key);
              centerOn(s);
            }}
          />
        )}
      </main>

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
