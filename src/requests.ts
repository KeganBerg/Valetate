import { formatElapsed } from './ops';
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

const ORDER: Record<CarRequest['status'], number> = { open: 0, claimed: 1, ready: 2 };

/**
 * nobody's-got-it first, then cars on their way, then cars already at the stand,
 * then cars asked for ahead of an event's let-out; oldest first within each
 */
export function sortQueue(list: CarRequest[], now = Date.now()): CarRequest[] {
  const rank = (r: CarRequest) => (r.status === 'open' && r.dueAt && r.dueAt > now ? 3 : ORDER[r.status]);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
}

/** drop requests for cars that are gone (retrieved on another device, map deleted) */
export function liveRequests(list: CarRequest[], carIds: Set<string>): CarRequest[] {
  return list.filter((r) => carIds.has(r.carId));
}

/** 20 hex characters (80 random bits) for a guest's link */
export function newGuestToken(): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** "just now", "4m", "1h 05m" */
export function waited(ms: number): string {
  return ms < 60000 ? 'just now' : formatElapsed(ms);
}
