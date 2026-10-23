import type { MapItem, Spot } from './types';

export const GRID = 6;

export function snap(v: number, on = true, grid = GRID): number {
  return on ? Math.round(v / grid) * grid : v;
}

export function rotatePt(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function center(it: Pick<MapItem, 'x' | 'y' | 'w' | 'h'>) {
  return { x: it.x + it.w / 2, y: it.y + it.h / 2 };
}

/** World point -> item-local point (origin at the item center, unrotated). */
export function toLocal(it: MapItem, wx: number, wy: number) {
  const c = center(it);
  return rotatePt(wx - c.x, wy - c.y, -it.rotation);
}

/** Item-local point -> world point. */
export function toWorld(it: MapItem, lx: number, ly: number) {
  const c = center(it);
  const p = rotatePt(lx, ly, it.rotation);
  return { x: c.x + p.x, y: c.y + p.y };
}

export function itemBounds(it: MapItem) {
  const pts = [
    toWorld(it, -it.w / 2, -it.h / 2),
    toWorld(it, it.w / 2, -it.h / 2),
    toWorld(it, it.w / 2, it.h / 2),
    toWorld(it, -it.w / 2, it.h / 2),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function unionBounds(items: MapItem[]) {
  if (!items.length) return null;
  const bs = items.map(itemBounds);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w));
  const btm = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

export function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return Math.round(a * 100) / 100;
}

/** Spot numbers in a row, in left-to-right (local) order. */
export function rowNumbers(it: Pick<MapItem, 'start' | 'count' | 'reverse'>): number[] {
  const start = it.start ?? 1;
  const count = Math.max(1, Math.floor(it.count ?? 1));
  return Array.from({ length: count }, (_, i) => (it.reverse ? start + count - 1 - i : start + i));
}

export function spotLabel(prefix: string | undefined, n: number): string {
  const p = (prefix ?? '').trim();
  return p ? `${p} ${n}` : String(n);
}

/** All parkable spots on a map, with their world position. */
export function listSpots(items: MapItem[]): Spot[] {
  const spots: Spot[] = [];
  for (const it of items) {
    if (it.kind === 'space') {
      const c = center(it);
      spots.push({
        key: it.id,
        label: (it.label ?? '').trim(),
        itemId: it.id,
        index: 0,
        cx: c.x,
        cy: c.y,
        w: it.w,
        h: it.h,
        rotation: it.rotation,
      });
    } else if (it.kind === 'spaceRow') {
      const nums = rowNumbers(it);
      const cw = it.w / nums.length;
      nums.forEach((n, i) => {
        const p = toWorld(it, -it.w / 2 + (i + 0.5) * cw, 0);
        spots.push({
          key: `${it.id}#${n}`,
          label: spotLabel(it.prefix, n),
          itemId: it.id,
          index: i,
          cx: p.x,
          cy: p.y,
          w: cw,
          h: it.h,
          rotation: it.rotation,
        });
      });
    }
  }
  return spots;
}

export function normalizeSpot(s: string): string {
  return s.toUpperCase().replace(/[\s\-#_.]/g, '');
}

/** Find a spot by what a valet would type: "d12", "D 12", "R3"... */
export function findSpot(items: MapItem[], query: string): Spot | undefined {
  const q = normalizeSpot(query);
  if (!q) return undefined;
  return listSpots(items).find((s) => s.label && normalizeSpot(s.label) === q);
}

/** Labels that appear on more than one spot, so the editor can warn about them. */
export function duplicateSpotLabels(items: MapItem[]): string[] {
  const seen = new Map<string, number>();
  for (const s of listSpots(items)) {
    if (!s.label) continue;
    const k = normalizeSpot(s.label);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes: string[] = [];
  for (const s of listSpots(items)) {
    const k = normalizeSpot(s.label);
    if (s.label && (seen.get(k) ?? 0) > 1 && !dupes.includes(s.label)) dupes.push(s.label);
  }
  return dupes;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 shape, so ids also work as database uuids
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The spot under a world point, topmost first. */
export function spotAt(items: MapItem[], wx: number, wy: number): Spot | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== 'space' && it.kind !== 'spaceRow') continue;
    const l = toLocal(it, wx, wy);
    if (Math.abs(l.x) > it.w / 2 || Math.abs(l.y) > it.h / 2) continue;
    const spots = listSpots([it]);
    if (it.kind === 'space') return spots[0];
    const idx = Math.min(spots.length - 1, Math.floor(((l.x + it.w / 2) / it.w) * spots.length));
    return spots[idx];
  }
  return undefined;
}
