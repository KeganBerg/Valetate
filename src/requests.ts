import type { CarRequest } from './types';

const KEY = 'valetate.requests.v1';

export function loadRequests(): CarRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRequests(list: CarRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore: storage full or blocked
  }
}

/** after this long a waiting guest is a problem, so the request turns red */
export const LATE_MS = 5 * 60 * 1000;

/** oldest first, but a request someone is already on goes below the ones nobody has taken */
export function sortQueue(list: CarRequest[]): CarRequest[] {
  return [...list].sort((a, b) => (a.status === b.status ? a.createdAt - b.createdAt : a.status === 'open' ? -1 : 1));
}

/** drop requests for cars that are gone (retrieved on another device, map deleted) */
export function liveRequests(list: CarRequest[], carIds: Set<string>): CarRequest[] {
  return list.filter((r) => carIds.has(r.carId));
}
