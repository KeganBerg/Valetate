import type { Shift, Tip } from './types';

const SHIFTS_KEY = 'valetate.shifts.v1';
const TIPS_KEY = 'valetate.tips.v1';
const TIP_URL_KEY = 'valetate.tipurl.v1';

// ---------- single-device storage ----------

function load<T>(key: string): T[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage full or blocked
  }
}

export const loadShifts = () => load<Shift>(SHIFTS_KEY);
export const saveShifts = (s: Shift[]) => save(SHIFTS_KEY, s.slice(-500));
export const loadTips = () => load<Tip>(TIPS_KEY);
export const saveTips = (t: Tip[]) => save(TIPS_KEY, t.slice(-2000));
export const loadTipUrl = () => {
  try {
    return localStorage.getItem(TIP_URL_KEY) || '';
  } catch {
    return '';
  }
};
export const saveTipUrl = (url: string) => {
  try {
    localStorage.setItem(TIP_URL_KEY, url);
  } catch {
    // ignore
  }
};

// ---------- the working day ----------

/** valet nights run past midnight, so "today" starts at 5 AM */
export function dayStart(now: number): number {
  const d = new Date(now);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}

/** minutes of `shift` that fall between `from` and `to` (an open shift runs until `now`) */
export function minutesOn(shift: Pick<Shift, 'startedAt' | 'endedAt'>, from: number, to: number, now: number): number {
  const start = Math.max(shift.startedAt, from);
  const end = Math.min(shift.endedAt ?? now, to);
  return Math.max(0, (end - start) / 60000);
}

export interface PoolShare {
  userId: string;
  name: string;
  minutes: number;
  cents: number;
}

/**
 * Split the day's tips by time on the clock: someone on for 6 hours gets
 * twice the share of someone on for 3. Cents are handed out so the shares
 * always add up to the total exactly.
 */
export function splitPool(tips: Tip[], shifts: Shift[], from: number, to: number, now: number): { total: number; shares: PoolShare[] } {
  const total = tips.filter((t) => !t.voided && t.createdAt >= from && t.createdAt < to).reduce((s, t) => s + t.amountCents, 0);
  const byUser = new Map<string, PoolShare>();
  for (const s of shifts) {
    const m = minutesOn(s, from, to, now);
    if (m <= 0) continue;
    const row = byUser.get(s.userId) ?? { userId: s.userId, name: s.userName, minutes: 0, cents: 0 };
    row.minutes += m;
    byUser.set(s.userId, row);
  }
  const shares = [...byUser.values()].sort((a, b) => b.minutes - a.minutes);
  const minutes = shares.reduce((s, r) => s + r.minutes, 0);
  if (!minutes) return { total, shares };
  let given = 0;
  for (const r of shares) {
    r.cents = Math.floor((total * r.minutes) / minutes);
    given += r.cents;
  }
  // the leftover cents go to whoever worked longest
  for (let i = 0; given < total; i = (i + 1) % shares.length, given++) shares[i].cents++;
  return { total, shares };
}

/** "$12", "$12.50" */
export function money(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

/** "3h 05m", "45m" */
export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** what the last crew left for this one: the newest handoff note from the past day */
export function latestHandoff(shifts: Shift[], now: number): Shift | undefined {
  return shifts
    .filter((s) => s.endedAt && s.handoffNote.trim() && now - s.endedAt < 24 * 60 * 60 * 1000)
    .sort((a, b) => b.endedAt! - a.endedAt!)[0];
}

/** "$5", "5", "5.50" → cents; anything else is null */
export function parseCents(s: string): number | null {
  const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return cents > 0 && cents <= 100000 ? cents : null;
}

/** a tip link a guest can safely be sent to */
export const validTipUrl = (u: string) => u === '' || /^https:\/\/\S+$/.test(u.trim());
