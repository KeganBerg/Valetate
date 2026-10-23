import type { LotMap, MapItem } from './types';

const HISTORY_LIMIT = 150;
const COALESCE_MS = 800;

/** what undo/redo restores: the objects plus the lot's size */
export interface Snapshot {
  items: MapItem[];
  width: number;
  height: number;
}

export interface EditorState {
  map: LotMap;
  selected: string[];
  past: Snapshot[];
  future: Snapshot[];
  /** consecutive edits with the same key (typing in a field) share one undo step */
  lastEdit?: { key: string; t: number };
}

export type Action =
  | { type: 'load'; map: LotMap }
  /** replace items (and optionally the lot size) without touching history (live drag preview) */
  | { type: 'preview'; items: MapItem[]; size?: { width: number; height: number } }
  /** record `snapshot` as the state to undo back to (end of a drag) */
  | { type: 'pushHistory'; snapshot: Snapshot }
  /** replace items and record an undo step */
  | { type: 'commit'; items: MapItem[]; key?: string; select?: string[]; size?: { width: number; height: number } }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'meta'; patch: Partial<Omit<LotMap, 'id' | 'items'>> };

export function initState(map: LotMap): EditorState {
  return { map, selected: [], past: [], future: [] };
}

export const snapshotOf = (m: LotMap): Snapshot => ({ items: m.items, width: m.width, height: m.height });

function withItems(s: EditorState, items: MapItem[], size?: { width: number; height: number }): EditorState {
  return { ...s, map: { ...s.map, ...size, items, updatedAt: Date.now() } };
}

function restore(s: EditorState, snap: Snapshot): EditorState {
  return withItems(s, snap.items, { width: snap.width, height: snap.height });
}

function push(past: Snapshot[], snapshot: Snapshot) {
  const next = [...past, snapshot];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function keepExisting(selected: string[], items: MapItem[]) {
  const ids = new Set(items.map((i) => i.id));
  return selected.filter((id) => ids.has(id));
}

export function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case 'load':
      return initState(a.map);
    case 'preview':
      return withItems(s, a.items, a.size);
    case 'pushHistory':
      return { ...s, past: push(s.past, a.snapshot), future: [], lastEdit: undefined };
    case 'commit': {
      const now = Date.now();
      const coalesce = a.key && s.lastEdit?.key === a.key && now - s.lastEdit.t < COALESCE_MS;
      const next = withItems(s, a.items, a.size);
      return {
        ...next,
        past: coalesce ? s.past : push(s.past, snapshotOf(s.map)),
        future: [],
        selected: keepExisting(a.select ?? s.selected, a.items),
        lastEdit: a.key ? { key: a.key, t: now } : undefined,
      };
    }
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        ...restore(s, prev),
        past: s.past.slice(0, -1),
        future: [snapshotOf(s.map), ...s.future],
        selected: keepExisting(s.selected, prev.items),
        lastEdit: undefined,
      };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return {
        ...restore(s, next),
        past: push(s.past, snapshotOf(s.map)),
        future: rest,
        selected: keepExisting(s.selected, next.items),
        lastEdit: undefined,
      };
    }
    case 'select':
      return { ...s, selected: a.ids };
    case 'meta': {
      // resizing the lot is undoable; typing in the size fields is one step
      const sized = ('width' in a.patch && a.patch.width !== s.map.width) || ('height' in a.patch && a.patch.height !== s.map.height);
      const now = Date.now();
      const coalesce = s.lastEdit?.key === 'lot-size' && now - s.lastEdit.t < COALESCE_MS;
      const map = { ...s.map, ...a.patch, updatedAt: now };
      if (!sized) return { ...s, map };
      return {
        ...s,
        map,
        past: coalesce ? s.past : push(s.past, snapshotOf(s.map)),
        future: [],
        lastEdit: { key: 'lot-size', t: now },
      };
    }
  }
}
