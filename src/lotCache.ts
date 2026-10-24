import type { LotMap } from './types';

/** The last maps this device saw, so the app can open with no signal. */
export interface CachedMaps {
  maps: LotMap[];
  savedAt: number;
}

export function saveCachedMaps(key: string, maps: LotMap[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ maps, savedAt: Date.now() } satisfies CachedMaps));
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
