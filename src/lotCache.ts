import type { LotMap, ParkedCar } from './types';

/**
 * The last maps and cars this phone saw, so the app can open with no signal
 * and still show the lot (changes made then wait in the outbox).
 */
export interface CachedLot {
  maps: LotMap[];
  cars: ParkedCar[];
  savedAt: number;
}

export function saveLot(key: string, maps: LotMap[], cars: ParkedCar[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ maps, cars, savedAt: Date.now() } satisfies CachedLot));
  } catch {
    // storage full or blocked: the app still works online
  }
}

export function loadLot(key: string): CachedLot | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && Array.isArray(v.maps) && Array.isArray(v.cars) ? v : null;
  } catch {
    return null;
  }
}
