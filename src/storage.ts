import type { LotMap, Site } from './types';

const MAPS_KEY = 'valetate.maps.v1';
const CURRENT_KEY = 'valetate.currentMap.v1';
const SITES_KEY = 'valetate.sites.v1';

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

export function setCurrentMapId(id: string) {
  write(CURRENT_KEY, id);
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

export function loadSites(): Site[] {
  const sites = read<Site[]>(SITES_KEY, []);
  return Array.isArray(sites) ? sites.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string') : [];
}

export function saveSite(site: Site) {
  write(SITES_KEY, [site, ...loadSites().filter((s) => s.id !== site.id)]);
}

/** removes the site and its areas */
export function deleteSite(id: string) {
  write(
    SITES_KEY,
    loadSites().filter((s) => s.id !== id),
  );
  write(
    MAPS_KEY,
    loadMaps().filter((m) => m.siteId !== id),
  );
}
