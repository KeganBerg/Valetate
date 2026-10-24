import type { LotMap, Site } from './types';

/** The last sites and maps this device saw, so the app can open with no signal. */
export interface CachedMaps {
  maps: LotMap[];
  sites?: Site[];
  savedAt: number;
}

export function saveCachedMaps(key: string, maps: LotMap[], sites: Site[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ maps, sites, savedAt: Date.now() } satisfies CachedMaps));
  } catch {
    // storage full or blocked: the app still works online
  }
}

export function loadCachedMaps(key: string): CachedMaps | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && Array.isArray(v.maps) ? v : null;
  } catch {
    return null;
  }
}
