import type { CarRequest, LotEvent, MapItem, ParkedCar, Spot } from './types';

const EVENT_KEY = 'valetate.event.v1';
const OUT_KEY = 'valetate.retrievals.v1';

// ---------- single-device storage ----------

export function loadEvent(): LotEvent | null {
  try {
    const raw = localStorage.getItem(EVENT_KEY);
    return raw ? (JSON.parse(raw) as LotEvent) : null;
  } catch {
    return null;
  }
}

export function saveEvent(e: LotEvent | null) {
  try {
    if (e) localStorage.setItem(EVENT_KEY, JSON.stringify(e));
    else localStorage.removeItem(EVENT_KEY);
  } catch {
    // ignore: storage full or blocked
  }
}

/** times cars left, so single-device mode can show a let-out pace too */
export function logRetrieval(at: number) {
  try {
    const list: number[] = JSON.parse(localStorage.getItem(OUT_KEY) || '[]');
    list.push(at);
    localStorage.setItem(OUT_KEY, JSON.stringify(list.slice(-2000)));
  } catch {
    // ignore
  }
}

export function retrievalsSince(since: number): number {
  try {
    const list: number[] = JSON.parse(localStorage.getItem(OUT_KEY) || '[]');
    return list.filter((t) => t >= since).length;
  } catch {
    return 0;
  }
}

// ---------- the countdown ----------

/** "18:32", "1:04:09"; a let-out time already passed counts up the same way */
export function clock(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The next time `hhmm` ("22:15") comes around after `now`: tonight, or
 * tomorrow if that time already passed more than an hour ago (a show that
 * started late is still tonight).
 */
export function nextTime(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() < now - 60 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** cars per minute since the let-out, and minutes until the lot is empty at that pace */
export function pace(out: number, since: number, now: number, left: number): { perMin: number; minsLeft: number | null } {
  const mins = (now - since) / 60000;
  // the first couple of minutes say nothing about the pace
  if (mins < 2 || out === 0) return { perMin: 0, minsLeft: null };
  const perMin = out / mins;
  return { perMin, minsLeft: Math.ceil(left / perMin) };
}

// ---------- pre-requests ----------

/** asked for ahead of time and not due yet */
export const isPre = (r: Pick<CarRequest, 'dueAt' | 'status'>, now: number) => r.status === 'open' && !!r.dueAt && r.dueAt > now;

// ---------- staging ----------

/** where the stand is: the valet booth on the map, else the middle of the lot */
export function standPoint(items: MapItem[], fallback: { x: number; y: number }): { x: number; y: number } {
  const booth = items.find((i) => i.kind === 'booth');
  return booth ? { x: booth.x + booth.w / 2, y: booth.y + booth.h / 2 } : fallback;
}

const dist = (s: Spot, p: { x: number; y: number }) => Math.hypot(s.cx - p.x, s.cy - p.y);

/**
 * Cars to bring closer before the let-out: the ones asked for ahead, farthest
 * from the stand first since they take longest.
 */
export function stagingList<C extends ParkedCar>(cars: C[], spots: Spot[], pre: CarRequest[], stand: { x: number; y: number }): C[] {
  const wanted = new Set(pre.map((r) => r.carId));
  const bySpot = new Map(spots.map((s) => [s.key, s]));
  const far = (c: C) => {
    const s = bySpot.get(c.spotKey);
    return s ? dist(s, stand) : 0;
  };
  return cars.filter((c) => wanted.has(c.id)).sort((a, b) => far(b) - far(a));
}

/** open spots nearest the stand: where staged cars should go */
export function nearestOpen(spots: Spot[], taken: Set<string>, stand: { x: number; y: number }, n = 3): Spot[] {
  return spots
    .filter((s) => !taken.has(s.key))
    .sort((a, b) => dist(a, stand) - dist(b, stand))
    .slice(0, n);
}

// ---------- lot full ----------

/** few enough open spots that the stand should start sending cars elsewhere */
export const almostFull = (open: number, total: number) => total > 0 && open <= Math.max(3, Math.ceil(total * 0.05));
