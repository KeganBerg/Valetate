import type { LotMap, MapItem } from './types';

const HISTORY_LIMIT = 150;
const COALESCE_MS = 800;

export interface EditorState {
  map: LotMap;
  selected: string[];
  past: MapItem[][];
  future: MapItem[][];
  /** consecutive edits with the same key (typing in a field) share one undo step */
  lastEdit?: { key: string; t: number };
}

export type Action =
  | { type: 'load'; map: LotMap }
  /** replace items without touching history (live drag preview) */
  | { type: 'preview'; items: MapItem[] }
  /** record `snapshot` as the state to undo back to (end of a drag) */
  | { type: 'pushHistory'; snapshot: MapItem[] }
  /** replace items and record an undo step */
  | { type: 'commit'; items: MapItem[]; key?: string; select?: string[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'meta'; patch: Partial<Omit<LotMap, 'id' | 'items'>> };

export function initState(map: LotMap): EditorState {
  return { map, selected: [], past: [], future: [] };
}

function withItems(s: EditorState, items: MapItem[]): EditorState {
  return { ...s, map: { ...s.map, items, updatedAt: Date.now() } };
}

function push(past: MapItem[][], snapshot: MapItem[]) {
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
      return withItems(s, a.items);
    case 'pushHistory':
      return { ...s, past: push(s.past, a.snapshot), future: [], lastEdit: undefined };
    case 'commit': {
      const now = Date.now();
      const coalesce = a.key && s.lastEdit?.key === a.key && now - s.lastEdit.t < COALESCE_MS;
      const next = withItems(s, a.items);
      return {
        ...next,
        past: coalesce ? s.past : push(s.past, s.map.items),
        future: [],
        selected: keepExisting(a.select ?? s.selected, a.items),
        lastEdit: a.key ? { key: a.key, t: now } : undefined,
      };
    }
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        ...withItems(s, prev),
        past: s.past.slice(0, -1),
        future: [s.map.items, ...s.future],
        selected: keepExisting(s.selected, prev),
        lastEdit: undefined,
      };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return {
        ...withItems(s, next),
        past: push(s.past, s.map.items),
        future: rest,
        selected: keepExisting(s.selected, next),
        lastEdit: undefined,
      };
    }
    case 'select':
      return { ...s, selected: a.ids };
    case 'meta':
      return { ...s, map: { ...s.map, ...a.patch, updatedAt: Date.now() } };
  }
}
