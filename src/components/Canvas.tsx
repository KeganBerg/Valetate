import { useEffect, useRef, useState, type Dispatch } from 'react';
import { GRID, LOT_MIN, center, itemBounds, listSpots, lotAround, normalizeAngle, rotatePt, snap, spotAt, toLocal } from '../geometry';
import { isLight } from '../assets';
import { colorHex, formatElapsed } from '../ops';
import type { Action, Snapshot } from '../store';
import type { LotMap, MapItem, ParkedCar, Spot } from '../types';
import { FONT, MapItems } from './MapSvg';

export interface View {
  x: number;
  y: number;
  z: number;
}

export const MIN_Z = 0.05;
export const MAX_Z = 6;
const MIN_SIZE = 6;

type Drag =
  | { mode: 'pan'; sx: number; sy: number; view: View }
  | { mode: 'move'; wx: number; wy: number; snapshot: MapItem[]; ids: Set<string>; moved: boolean }
  | { mode: 'resize'; id: string; cx: -1 | 0 | 1; cy: -1 | 0 | 1; snapshot: MapItem[]; orig: MapItem }
  | { mode: 'rotate'; id: string; snapshot: MapItem[]; orig: MapItem }
  | { mode: 'marquee'; wx: number; wy: number; cur: { x: number; y: number }; additive: string[] }
  | { mode: 'pinch'; d0: number; z0: number; world: { x: number; y: number } }
  /** dragging an edge or corner of the lot itself */
  | { mode: 'lot'; sx: -1 | 0 | 1; sy: -1 | 0 | 1; snapshot: Snapshot; view: View };

type Side = -1 | 0 | 1;
const LOT_HANDLES: [Side, Side][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
const LOT_CURSOR: Record<string, string> = {
  '-1,-1': 'nwse-resize',
  '1,1': 'nwse-resize',
  '1,-1': 'nesw-resize',
  '-1,1': 'nesw-resize',
  '0,-1': 'ns-resize',
  '0,1': 'ns-resize',
  '-1,0': 'ew-resize',
  '1,0': 'ew-resize',
};

interface Props {
  map: LotMap;
  selected: string[];
  dispatch: Dispatch<Action>;
  view: View;
  setView: (v: View | ((v: View) => View)) => void;
  snapOn: boolean;
  showGrid: boolean;
  highlight: Spot | null;
  onDropAsset: (assetName: string, wx: number, wy: number) => void;
  mode: 'edit' | 'live';
  /** live mode: cars by Spot.key */
  occupied: Map<string, ParkedCar>;
  now: number;
  activeSpot: string | null;
  /** live mode: spots whose car has been asked for, by Spot.key */
  requested?: Map<string, 'open' | 'claimed' | 'ready' | 'pre'>;
  /** live mode: spots whose car must move before a requested car can get out */
  mustMove?: Set<string>;
  onSpotClick: (spot: Spot | null) => void;
}

const REQ_COLOR = { open: '#ffb020', claimed: '#4da3ff', ready: '#34c759', pre: '#b18cff' } as const;

const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

export function Canvas({
  map,
  selected,
  dispatch,
  view,
  setView,
  snapOn,
  showGrid,
  highlight,
  onDropAsset,
  mode,
  occupied,
  now,
  activeSpot,
  requested,
  mustMove,
  onSpotClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tapSpot = useRef<Spot | null | undefined>(undefined);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [lotDrag, setLotDrag] = useState(false);
  const items = map.items;
  const snapshotNow = (): Snapshot => ({ items, width: map.width, height: map.height });

  const screen = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorldPt = (sx: number, sy: number, v = view) => ({ x: (sx - v.x) / v.z, y: (sy - v.y) / v.z });

  // wheel zoom around the cursor (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => {
        const z = clampZ(v.z * factor);
        const wx = (sx - v.x) / v.z;
        const wy = (sy - v.y) / v.z;
        return { z, x: sx - wx * z, y: sy - wy * z };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // a pinch cancels whatever one finger started
    const d = drag.current;
    if (d && (d.mode === 'move' || d.mode === 'resize' || d.mode === 'rotate')) {
      dispatch({ type: 'preview', items: d.snapshot });
    }
    if (d?.mode === 'lot') {
      dispatch({ type: 'preview', items: d.snapshot.items, size: d.snapshot });
      setLotDrag(false);
    }
    setMarquee(null);
    drag.current = { mode: 'pinch', d0, z0: view.z, world: toWorldPt(mid.x, mid.y) };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = screen(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) return startPinch();
    if (pointers.current.size > 2) return;

    const w = toWorldPt(p.x, p.y);
    if (mode === 'live') {
      // a tap (not a drag) on a spot opens it; dragging pans
      drag.current = { mode: 'pan', sx: p.x, sy: p.y, view };
      tapSpot.current = spotAt(items, w.x, w.y) ?? null;
      return;
    }
    const target = e.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    if (handle && selected.length === 1) {
      const orig = items.find((i) => i.id === selected[0])!;
      if (handle === 'rotate') {
        drag.current = { mode: 'rotate', id: orig.id, snapshot: items, orig };
      } else {
        const [cx, cy] = handle.split(',').map(Number) as [-1 | 0 | 1, -1 | 0 | 1];
        drag.current = { mode: 'resize', id: orig.id, cx, cy, snapshot: items, orig };
      }
      return;
    }
    const lot = target.closest('[data-lot]')?.getAttribute('data-lot');
    if (lot) {
      const [sx, sy] = lot.split(',').map(Number) as [Side, Side];
      drag.current = { mode: 'lot', sx, sy, snapshot: snapshotNow(), view };
      setLotDrag(true);
      return;
    }

    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (id && e.button === 0) {
      let ids = selected;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        ids = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
      } else if (!selected.includes(id)) {
        ids = [id];
      }
      dispatch({ type: 'select', ids });
      if (ids.includes(id)) {
        drag.current = { mode: 'move', wx: w.x, wy: w.y, snapshot: items, ids: new Set(ids), moved: false };
      }
      return;
    }

    if (e.shiftKey && e.button === 0) {
      drag.current = { mode: 'marquee', wx: w.x, wy: w.y, cur: w, additive: selected };
      return;
    }
    if (selected.length) dispatch({ type: 'select', ids: [] });
    drag.current = { mode: 'pan', sx: p.x, sy: p.y, view };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = screen(e);
    pointers.current.set(e.pointerId, p);
    const d = drag.current;
    if (!d) return;

    if (d.mode === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clampZ((d.z0 * dist) / d.d0);
      setView({ z, x: mid.x - d.world.x * z, y: mid.y - d.world.y * z });
      return;
    }
    if (d.mode === 'pan') {
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 6) tapSpot.current = undefined;
      setView({ ...d.view, x: d.view.x + p.x - d.sx, y: d.view.y + p.y - d.sy });
      return;
    }

    if (d.mode === 'lot') {
      // work in the coordinates the drag started in, since the view shifts as the lot grows up/left
      const o = d.snapshot;
      const w0 = toWorldPt(p.x, p.y, d.view);
      const useSnap = !e.altKey;
      let width = o.width;
      let height = o.height;
      let dx = 0;
      let dy = 0;
      if (d.sx === 1) width = Math.max(LOT_MIN, snap(w0.x, useSnap));
      if (d.sy === 1) height = Math.max(LOT_MIN, snap(w0.y, useSnap));
      if (d.sx === -1) {
        const left = Math.min(o.width - LOT_MIN, snap(w0.x, useSnap));
        width = o.width - left;
        dx = -left;
      }
      if (d.sy === -1) {
        const top = Math.min(o.height - LOT_MIN, snap(w0.y, useSnap));
        height = o.height - top;
        dy = -top;
      }
      dispatch({
        type: 'preview',
        items: dx || dy ? o.items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy })) : o.items,
        size: { width, height },
      });
      setView({ ...d.view, x: d.view.x - dx * d.view.z, y: d.view.y - dy * d.view.z });
      return;
    }

    const w = toWorldPt(p.x, p.y);
    if (d.mode === 'move') {
      const dx = w.x - d.wx;
      const dy = w.y - d.wy;
      if (!d.moved && Math.hypot(dx, dy) * view.z < 3) return;
      d.moved = true;
      // snap the drag distance (not each item) so items keep their relative layout
      const sdx = snap(dx, snapOn && !e.altKey);
      const sdy = snap(dy, snapOn && !e.altKey);
      dispatch({
        type: 'preview',
        items: d.snapshot.map((it) => (d.ids.has(it.id) ? { ...it, x: it.x + sdx, y: it.y + sdy } : it)),
      });
    } else if (d.mode === 'resize') {
      const o = d.orig;
      const local = toLocal(o, w.x, w.y);
      // the opposite edge/corner stays put
      const fixed = { x: (-d.cx * o.w) / 2, y: (-d.cy * o.h) / 2 };
      const useSnap = snapOn && !e.altKey;
      let nw = o.w;
      let nh = o.h;
      if (d.cx) nw = Math.max(MIN_SIZE, snap(Math.abs(local.x - fixed.x), useSnap));
      if (d.cy) nh = Math.max(MIN_SIZE, snap(Math.abs(local.y - fixed.y), useSnap));
      const lc = { x: d.cx ? fixed.x + (d.cx * nw) / 2 : 0, y: d.cy ? fixed.y + (d.cy * nh) / 2 : 0 };
      const off = rotatePt(lc.x, lc.y, o.rotation);
      const c = center(o);
      const next = { ...o, w: nw, h: nh, x: c.x + off.x - nw / 2, y: c.y + off.y - nh / 2 };
      dispatch({ type: 'preview', items: d.snapshot.map((it) => (it.id === d.id ? next : it)) });
    } else if (d.mode === 'rotate') {
      const c = center(d.orig);
      let a = (Math.atan2(w.y - c.y, w.x - c.x) * 180) / Math.PI + 90;
      a = e.altKey || e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15;
      dispatch({
        type: 'preview',
        items: d.snapshot.map((it) => (it.id === d.id ? { ...it, rotation: normalizeAngle(a) } : it)),
      });
    } else if (d.mode === 'marquee') {
      d.cur = w;
      setMarquee({
        x: Math.min(d.wx, w.x),
        y: Math.min(d.wy, w.y),
        w: Math.abs(w.x - d.wx),
        h: Math.abs(w.y - d.wy),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pinch') {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    drag.current = null;
    if (d.mode === 'pan' && mode === 'live' && tapSpot.current !== undefined) {
      onSpotClick(tapSpot.current);
      tapSpot.current = undefined;
      return;
    }
    if (d.mode === 'lot') {
      setLotDrag(false);
      if (map.width !== d.snapshot.width || map.height !== d.snapshot.height) dispatch({ type: 'pushHistory', snapshot: d.snapshot });
    } else if ((d.mode === 'move' && d.moved) || d.mode === 'resize' || d.mode === 'rotate') {
      if (d.snapshot !== items) {
        // the lot grows to keep whatever was dragged past its edge
        const grown = lotAround(items, map.width, map.height);
        if (grown) {
          dispatch({ type: 'preview', items: grown.items, size: grown });
          setView((v) => ({ ...v, x: v.x - grown.dx * v.z, y: v.y - grown.dy * v.z }));
        }
        dispatch({ type: 'pushHistory', snapshot: { items: d.snapshot, width: map.width, height: map.height } });
      }
    } else if (d.mode === 'marquee') {
      const m = { x: Math.min(d.wx, d.cur.x), y: Math.min(d.wy, d.cur.y), r: Math.max(d.wx, d.cur.x), b: Math.max(d.wy, d.cur.y) };
      const hit = items
        .filter((it) => {
          const b = itemBounds(it);
          return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.r && b.y + b.h <= m.b;
        })
        .map((it) => it.id);
      dispatch({ type: 'select', ids: [...new Set([...d.additive, ...hit])] });
      setMarquee(null);
    }
  };

  const onDrop = (e: React.DragEvent<SVGSVGElement>) => {
    const name = e.dataTransfer.getData('application/x-valetate-asset');
    if (!name || mode !== 'edit') return;
    e.preventDefault();
    const p = screen(e);
    const w = toWorldPt(p.x, p.y);
    onDropAsset(name, w.x, w.y);
  };

  const sel = mode === 'edit' ? items.filter((it) => selected.includes(it.id)) : [];
  const liveSpots = mode === 'live' ? listSpots(items) : [];
  const single = sel.length === 1 ? sel[0] : null;
  const hs = 10 / view.z;
  const stroke = 1.5 / view.z;

  return (
    <svg
      ref={svgRef}
      className="canvas"
      fontFamily={FONT}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="grid-minor" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={1} />
        </pattern>
        <pattern id="grid-major" width={GRID * 20} height={GRID * 20} patternUnits="userSpaceOnUse">
          <rect width={GRID * 20} height={GRID * 20} fill="url(#grid-minor)" />
          <path d={`M ${GRID * 20} 0 L 0 0 0 ${GRID * 20}`} fill="none" stroke="#fff" strokeOpacity={0.16} strokeWidth={1} />
        </pattern>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
        <rect
          x={-6}
          y={-6}
          width={map.width + 12}
          height={map.height + 12}
          rx={8}
          fill="#000"
          opacity={0.35}
          pointerEvents="none"
        />
        <rect width={map.width} height={map.height} fill={map.surface} />
        {showGrid && <rect width={map.width} height={map.height} fill="url(#grid-major)" pointerEvents="none" />}
        <MapItems items={items} />

        {mode === 'edit' && (
          <g className="lot-frame">
            <rect
              width={map.width}
              height={map.height}
              fill="none"
              stroke="#ffb020"
              strokeOpacity={lotDrag ? 0.9 : 0.35}
              strokeWidth={stroke * (lotDrag ? 2 : 1)}
              strokeDasharray={lotDrag ? undefined : `${8 / view.z} ${6 / view.z}`}
              pointerEvents="none"
            />
            {LOT_HANDLES.map(([sx, sy]) => {
              const k = `${sx},${sy}`;
              // sit just outside the lot so they don't cover objects along its edge
              const x = ((sx + 1) / 2) * map.width + (sx * 10) / view.z;
              const y = ((sy + 1) / 2) * map.height + (sy * 10) / view.z;
              const corner = sx !== 0 && sy !== 0;
              const len = 34 / view.z;
              const thick = 9 / view.z;
              return (
                <g key={k} data-lot={k} className="lot-handle" style={{ cursor: LOT_CURSOR[k] }}>
                  <title>Drag to resize the lot</title>
                  {/* a big invisible target so fingers can grab it */}
                  <circle cx={x} cy={y} r={22 / view.z} fill="transparent" />
                  {corner ? (
                    <circle cx={x} cy={y} r={7 / view.z} fill="#ffb020" stroke="#0b0d10" strokeWidth={stroke * 1.5} />
                  ) : (
                    <rect
                      x={x - (sx ? thick : len) / 2}
                      y={y - (sy ? thick : len) / 2}
                      width={sx ? thick : len}
                      height={sy ? thick : len}
                      rx={thick / 2}
                      fill="#ffb020"
                      stroke="#0b0d10"
                      strokeWidth={stroke * 1.5}
                    />
                  )}
                </g>
              );
            })}
            {lotDrag && (
              <g transform={`translate(${map.width / 2} ${map.height / 2}) scale(${1 / view.z})`} pointerEvents="none">
                <rect x={-62} y={-17} width={124} height={34} rx={17} fill="#0b0d10" fillOpacity={0.85} />
                <text textAnchor="middle" y={6} fontSize={16} fontWeight={700} fill="#fff">
                  {Math.round(map.width)} × {Math.round(map.height)}
                </text>
              </g>
            )}
          </g>
        )}

        {sel.map((it) => {
          const c = center(it);
          return (
            <g key={it.id} transform={`translate(${c.x} ${c.y}) rotate(${it.rotation})`} pointerEvents="none">
              <rect
                x={-it.w / 2}
                y={-it.h / 2}
                width={it.w}
                height={it.h}
                fill="none"
                stroke="#4da3ff"
                strokeWidth={stroke * 1.5}
                strokeDasharray={`${6 / view.z} ${4 / view.z}`}
              />
            </g>
          );
        })}

        {single && (
          <g transform={`translate(${center(single).x} ${center(single).y}) rotate(${single.rotation})`}>
            <line x1={0} y1={-single.h / 2} x2={0} y2={-single.h / 2 - 28 / view.z} stroke="#4da3ff" strokeWidth={stroke} />
            <circle
              data-handle="rotate"
              className="handle handle-rotate"
              cx={0}
              cy={-single.h / 2 - 28 / view.z}
              r={hs * 0.75}
              fill="#fff"
              stroke="#4da3ff"
              strokeWidth={stroke * 1.5}
            />
            {(
              [
                [-1, -1],
                [0, -1],
                [1, -1],
                [1, 0],
                [1, 1],
                [0, 1],
                [-1, 1],
                [-1, 0],
              ] as const
            ).map(([cx, cy]) => (
              <rect
                key={`${cx},${cy}`}
                data-handle={`${cx},${cy}`}
                className="handle"
                x={(cx * single.w) / 2 - hs / 2}
                y={(cy * single.h) / 2 - hs / 2}
                width={hs}
                height={hs}
                fill="#fff"
                stroke="#4da3ff"
                strokeWidth={stroke * 1.5}
              />
            ))}
          </g>
        )}

        {liveSpots.map((sp) => {
          const car = occupied.get(sp.key);
          const active = sp.key === activeSpot;
          if (!car && !active) return null;
          const upright = Math.abs(Math.sin((sp.rotation * Math.PI) / 180)) > Math.abs(Math.cos((sp.rotation * Math.PI) / 180));
          const bw = upright ? sp.h : sp.w;
          const bh = upright ? sp.w : sp.h;
          const fill = car ? (colorHex(car.color) ?? '#d6343a') : '#4da3ff';
          const ink = car && isLight(fill) ? '#111' : '#fff';
          const tag = car ? (car.ticket ? `#${car.ticket}` : car.plate) : '';
          const fs = Math.max(5, Math.min(13, (bw * 0.9) / Math.max(3, tag.length * 0.62), bh / 2.8));
          return (
            <g key={sp.key} pointerEvents="none">
              <g transform={`translate(${sp.cx} ${sp.cy}) rotate(${sp.rotation})`}>
                <rect
                  x={-sp.w / 2 + 1.5}
                  y={-sp.h / 2 + 1.5}
                  width={sp.w - 3}
                  height={sp.h - 3}
                  rx={Math.min(sp.w, sp.h) * 0.18}
                  fill={fill}
                  fillOpacity={car ? 1 : 0.35}
                  stroke={active ? '#4da3ff' : '#0b0d10'}
                  strokeWidth={active ? 3.5 : 1.5}
                />
              </g>
              {car && (
                <g transform={`translate(${sp.cx} ${sp.cy})`}>
                  <text textAnchor="middle" y={-fs * 0.5} fontSize={fs} fontWeight={800} fill={ink}>
                    {tag}
                  </text>
                  <text textAnchor="middle" y={fs * 0.75} fontSize={fs * 0.85} fontWeight={600} fill={ink} opacity={0.85}>
                    {formatElapsed(now - car.parkedAt)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {liveSpots.map((sp) => {
          const st = requested?.get(sp.key);
          if (!st) return null;
          const pad = 5;
          return (
            <g key={`req-${sp.key}`} transform={`translate(${sp.cx} ${sp.cy}) rotate(${sp.rotation})`} pointerEvents="none">
              <rect
                className={`req-ring ${st}`}
                x={-sp.w / 2 - pad}
                y={-sp.h / 2 - pad}
                width={sp.w + pad * 2}
                height={sp.h + pad * 2}
                rx={6}
                fill="none"
                stroke={REQ_COLOR[st]}
                strokeWidth={Math.max(3, 3 / view.z)}
              />
            </g>
          );
        })}

        {mustMove &&
          liveSpots
            .filter((sp) => mustMove.has(sp.key))
            .map((sp) => (
              <g key={`move-${sp.key}`} transform={`translate(${sp.cx} ${sp.cy}) rotate(${sp.rotation})`} pointerEvents="none">
                <rect
                  className="move-ring"
                  x={-sp.w / 2 - 5}
                  y={-sp.h / 2 - 5}
                  width={sp.w + 10}
                  height={sp.h + 10}
                  rx={6}
                  fill="none"
                  stroke="#ff7a45"
                  strokeWidth={Math.max(3, 3 / view.z)}
                  strokeDasharray={`${Math.max(6, 6 / view.z)} ${Math.max(4, 4 / view.z)}`}
                />
              </g>
            ))}

        {highlight && (
          <g transform={`translate(${highlight.cx} ${highlight.cy}) rotate(${highlight.rotation})`} pointerEvents="none">
            <rect
              className="spot-pulse"
              x={-highlight.w / 2 - 4}
              y={-highlight.h / 2 - 4}
              width={highlight.w + 8}
              height={highlight.h + 8}
              rx={4}
              fill="#ff3b30"
              fillOpacity={0.25}
              stroke="#ff3b30"
              strokeWidth={4 / view.z + 2}
            />
          </g>
        )}

        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.w}
            height={marquee.h}
            fill="#4da3ff"
            fillOpacity={0.12}
            stroke="#4da3ff"
            strokeWidth={stroke}
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}
