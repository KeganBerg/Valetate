import type { LotMap } from './types';

const MAPS_KEY = 'valetate.maps.v1';
const CURRENT_KEY = 'valetate.currentMap.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the editor keeps working, the map just isn't persisted
  }
}

export function loadMaps(): LotMap[] {
  const maps = read<LotMap[]>(MAPS_KEY, []);
  return Array.isArray(maps) ? maps.filter(isLotMap) : [];
}

export function saveMap(map: LotMap) {
  const maps = loadMaps().filter((m) => m.id !== map.id);
  write(MAPS_KEY, [map, ...maps]);
  write(CURRENT_KEY, map.id);
}

export function deleteMap(id: string) {
  write(
    MAPS_KEY,
    loadMaps().filter((m) => m.id !== id),
  );
}

export function currentMapId(): string | null {
  return read<string | null>(CURRENT_KEY, null);
}

export function isLotMap(v: unknown): v is LotMap {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<LotMap>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.width === 'number' &&
    typeof m.height === 'number' &&
    Array.isArray(m.items)
  );
}
