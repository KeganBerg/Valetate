import { minutesOn, splitPool } from './shifts';
import type { Shift, Tip } from './types';

const HISTORY_KEY = 'valetate.history.v1';

/** One car's visit: when it came in and (once it has) when it left. */
export interface CarVisit {
  id: string;
  mapId: string;
  parkedAt: number;
  retrievedAt: number | null;
  parkedBy: string;
  retrievedBy: string;
  /** single-device history only, for spotting repeat guests */
  plate?: string;
}

/** One retrieval request, start to finish. */
export interface RequestVisit {
  id: string;
  carId: string;
  createdAt: number;
  claimedAt: number | null;
  readyAt: number | null;
  closedAt: number | null;
  claimedBy: string;
  claimedByName: string;
  status: 'open' | 'claimed' | 'ready' | 'done' | 'cancelled';
  source: 'staff' | 'guest' | 'sms';
  /** asked for ahead (an event let-out): the wait starts here, not at createdAt */
  dueAt: number | null;
}

export interface ReportData {
  cars: CarVisit[];
  requests: RequestVisit[];
  tips: Tip[];
  shifts: Shift[];
  /** user id → name, for everyone who shows up in the data */
  people: Record<string, string>;
}

// ---------- single-device history ----------

export function loadHistory(): { cars: CarVisit[]; requests: RequestVisit[] } {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    return { cars: Array.isArray(h.cars) ? h.cars : [], requests: Array.isArray(h.requests) ? h.requests : [] };
  } catch {
    return { cars: [], requests: [] };
  }
}

/** keep finished cars and requests on this device so the dashboard has something to show */
export function logHistory(add: { cars?: CarVisit[]; requests?: RequestVisit[] }) {
  try {
    const h = loadHistory();
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ cars: [...h.cars, ...(add.cars ?? [])].slice(-5000), requests: [...h.requests, ...(add.requests ?? [])].slice(-5000) }),
    );
  } catch {
    // ignore: storage full or blocked
  }
}

// ---------- the numbers ----------

export interface ValetRow {
  userId: string;
  name: string;
  parked: number;
  /** requests this person brought up */
  broughtUp: number;
  /** their average wait (request to car at the stand), ms; null with no data */
  avgWait: number | null;
  minutesOn: number;
  tipsCents: number;
}

export interface Report {
  carsIn: number;
  carsOut: number;
  requests: number;
  /** of finished requests that reached the stand */
  timed: number;
  avgWait: number | null;
  medianWait: number | null;
  p90Wait: number | null;
  /** share of timed requests that took over 10 minutes */
  slowShare: number;
  /** share of requests guests made from their link */
  guestShare: number;
  /** cars in and requests made per hour of the day (0–23), for peak hours */
  byHour: { carsIn: number[]; requests: number[] };
  /** busiest hour by requests, or by cars in if nothing was requested */
  peakHour: number | null;
  /** one entry per day in the range (oldest first), for 7 and 30 days */
  byDay: { day: number; carsIn: number; carsOut: number }[];
  valets: ValetRow[];
  tipsCents: number;
  cashCents: number;
  shifts: number;
  /** tips per shift worked, cents */
  tipsPerShift: number | null;
}

/** when the guest started waiting: when they asked, or the let-out for a car asked for ahead */
export const waitStart = (r: Pick<RequestVisit, 'createdAt' | 'dueAt'>) => Math.max(r.createdAt, r.dueAt ?? 0);

/** how long the guest waited, or null if the car never got to the stand */
export function waitOf(r: RequestVisit): number | null {
  const end = r.readyAt ?? (r.status === 'done' ? r.closedAt : null);
  if (end == null) return null;
  const w = end - waitStart(r);
  return w >= 0 && w < 3 * 60 * 60 * 1000 ? w : null;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

const DAY = 24 * 60 * 60 * 1000;
const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Everything the dashboard shows for the window [from, to). */
export function buildReport(data: ReportData, from: number, to: number, now: number): Report {
  const inRange = (t: number | null) => t != null && t >= from && t < to;
  const cars = data.cars.filter((c) => inRange(c.parkedAt));
  const out = data.cars.filter((c) => inRange(c.retrievedAt));
  const reqs = data.requests.filter((r) => inRange(r.createdAt) && r.status !== 'cancelled');

  const waits: number[] = [];
  const byValet = new Map<string, number[]>();
  for (const r of reqs) {
    const w = waitOf(r);
    if (w == null) continue;
    waits.push(w);
    if (r.claimedBy) byValet.set(r.claimedBy, [...(byValet.get(r.claimedBy) ?? []), w]);
  }
  waits.sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  const byHour = { carsIn: Array(24).fill(0) as number[], requests: Array(24).fill(0) as number[] };
  for (const c of cars) byHour.carsIn[new Date(c.parkedAt).getHours()]++;
  for (const r of reqs) byHour.requests[new Date(waitStart(r)).getHours()]++;
  const peakOf = (xs: number[]) => (Math.max(...xs) > 0 ? xs.indexOf(Math.max(...xs)) : null);
  const peakHour = peakOf(byHour.requests) ?? peakOf(byHour.carsIn);

  const byDay: Report['byDay'] = [];
  if (to - from > 1.5 * DAY) {
    for (let d = midnight(from); d < to; d = midnight(d + DAY + 2 * 60 * 60 * 1000)) {
      const next = midnight(d + DAY + 2 * 60 * 60 * 1000);
      byDay.push({
        day: d,
        carsIn: cars.filter((c) => c.parkedAt >= d && c.parkedAt < next).length,
        carsOut: out.filter((c) => c.retrievedAt! >= d && c.retrievedAt! < next).length,
      });
    }
  }

  // people: everyone who parked, brought a car up, or clocked in
  const shifts = data.shifts.filter((s) => minutesOn(s, from, to, now) > 0);
  const tips = data.tips.filter((t) => !t.voided && inRange(t.createdAt));
  const { shares } = splitPool(tips, shifts, from, to, now);
  const rows = new Map<string, ValetRow>();
  const row = (id: string, name?: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { userId: id, name: data.people[id] || name || 'Valet', parked: 0, broughtUp: 0, avgWait: null, minutesOn: 0, tipsCents: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const c of cars) if (c.parkedBy) row(c.parkedBy).parked++;
  for (const r of reqs) if (r.claimedBy && (r.readyAt || r.status === 'done')) row(r.claimedBy, r.claimedByName).broughtUp++;
  for (const [id, ws] of byValet) row(id).avgWait = avg(ws);
  for (const s of shares) {
    const r = row(s.userId, s.name);
    r.minutesOn = s.minutes;
    r.tipsCents = s.cents;
  }
  const valets = [...rows.values()].sort((a, b) => b.parked + b.broughtUp - (a.parked + a.broughtUp) || b.minutesOn - a.minutesOn);

  const tipsCents = tips.reduce((s, t) => s + t.amountCents, 0);
  return {
    carsIn: cars.length,
    carsOut: out.length,
    requests: reqs.length,
    timed: waits.length,
    avgWait: avg(waits),
    medianWait: quantile(waits, 0.5),
    p90Wait: quantile(waits, 0.9),
    slowShare: waits.length ? waits.filter((w) => w > 10 * 60 * 1000).length / waits.length : 0,
    guestShare: reqs.length ? reqs.filter((r) => r.source !== 'staff').length / reqs.length : 0,
    byHour,
    peakHour,
    byDay,
    valets,
    tipsCents,
    cashCents: tips.filter((t) => t.method === 'cash').reduce((s, t) => s + t.amountCents, 0),
    shifts: shifts.length,
    tipsPerShift: shifts.length ? Math.round(tipsCents / shifts.length) : null,
  };
}

/** "4m 30s", "12m", "1h 05m" */
export function waitText(ms: number | null): string {
  if (ms == null) return '–';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 10) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "9 PM", "12 AM" */
export const hourText = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** A CSV of the valet table, for payroll or the boss. */
export function valetCsv(r: Report): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['Valet', 'Cars parked', 'Cars brought up', 'Avg wait (min)', 'Hours on', 'Tips ($)'].join(',')];
  for (const v of r.valets)
    lines.push(
      [
        q(v.name),
        v.parked,
        v.broughtUp,
        v.avgWait == null ? '' : (v.avgWait / 60000).toFixed(1),
        (v.minutesOn / 60).toFixed(2),
        (v.tipsCents / 100).toFixed(2),
      ].join(','),
    );
  return lines.join('\n');
}
