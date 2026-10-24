import type { LotMap, MapBackdrop, MapItem } from './types';

const HISTORY_LIMIT = 150;
const COALESCE_MS = 800;

/** what undo/redo restores: the objects plus the lot's size */
export interface Snapshot {
  items: MapItem[];
  width: number;
  height: number;
  /** the satellite photo moves with the objects when the lot grows up or left */
  backdrop?: MapBackdrop;
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
  | { type: 'preview'; items: MapItem[]; size?: { width: number; height: number }; backdrop?: MapBackdrop }
  /** record `snapshot` as the state to undo back to (end of a drag) */
  | { type: 'pushHistory'; snapshot: Snapshot }
  /** replace items and record an undo step */
  | { type: 'commit'; items: MapItem[]; key?: string; select?: string[]; size?: { width: number; height: number }; backdrop?: MapBackdrop }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'meta'; patch: Partial<Omit<LotMap, 'id' | 'items'>> };

export function initState(map: LotMap): EditorState {
  return { map, selected: [], past: [], future: [] };
}

export const snapshotOf = (m: LotMap): Snapshot => ({ items: m.items, width: m.width, height: m.height, backdrop: m.backdrop });

function withItems(s: EditorState, items: MapItem[], size?: { width: number; height: number }, backdrop?: MapBackdrop): EditorState {
  return { ...s, map: { ...s.map, ...size, ...(backdrop && { backdrop }), items, updatedAt: Date.now() } };
}

function restore(s: EditorState, snap: Snapshot): EditorState {
  const next = withItems(s, snap.items, { width: snap.width, height: snap.height });
  return { ...next, map: { ...next.map, backdrop: snap.backdrop } };
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
      return withItems(s, a.items, a.size, a.backdrop);
    case 'pushHistory':
      return { ...s, past: push(s.past, a.snapshot), future: [], lastEdit: undefined };
    case 'commit': {
      const now = Date.now();
      const coalesce = a.key && s.lastEdit?.key === a.key && now - s.lastEdit.t < COALESCE_MS;
      const next = withItems(s, a.items, a.size, a.backdrop);
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
      // resizing the lot and lining up the photo are undoable; typing in the size fields (or dragging a slider) is one step
      const sized = ('width' in a.patch && a.patch.width !== s.map.width) || ('height' in a.patch && a.patch.height !== s.map.height);
      const photo = 'backdrop' in a.patch && a.patch.backdrop !== s.map.backdrop;
      const now = Date.now();
      const key = sized ? 'lot-size' : 'backdrop';
      const coalesce = s.lastEdit?.key === key && now - s.lastEdit.t < COALESCE_MS;
      const map = { ...s.map, ...a.patch, updatedAt: now };
      if (!sized && !photo) return { ...s, map };
      return {
        ...s,
        map,
        past: coalesce ? s.past : push(s.past, snapshotOf(s.map)),
        future: [],
        lastEdit: { key, t: now },
      };
    }
  }
}
