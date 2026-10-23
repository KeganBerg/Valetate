import { describe, expect, it } from 'vitest';
import { dayStart, duration, latestHandoff, minutesOn, money, parseCents, splitPool, validTipUrl } from './shifts';
import type { Shift, Tip } from './types';

const H = 60 * 60 * 1000;
const shift = (userId: string, startedAt: number, endedAt: number | null, note = ''): Shift => ({
  id: `${userId}-${startedAt}`,
  userId,
  userName: userId.toUpperCase(),
  startedAt,
  endedAt,
  handoffNote: note,
});
const tip = (cents: number, at: number, voided = false): Tip => ({
  id: `${cents}-${at}`,
  amountCents: cents,
  method: 'cash',
  carId: null,
  loggedBy: 'a',
  loggedByName: 'A',
  createdAt: at,
  voided,
});

describe('shifts and tips', () => {
  it('starts the working day at 5 AM, so a 1 AM tip counts toward the night before', () => {
    expect(dayStart(new Date(2026, 9, 23, 22, 0).getTime())).toBe(new Date(2026, 9, 23, 5, 0).getTime());
    expect(dayStart(new Date(2026, 9, 24, 1, 0).getTime())).toBe(new Date(2026, 9, 23, 5, 0).getTime());
  });

  it('counts only the part of a shift inside the window', () => {
    expect(minutesOn({ startedAt: 0, endedAt: 2 * H }, H, 10 * H, 0)).toBe(60);
    expect(minutesOn({ startedAt: H, endedAt: null }, 0, 10 * H, 3 * H)).toBe(120);
    expect(minutesOn({ startedAt: 5 * H, endedAt: 6 * H }, 0, 2 * H, 0)).toBe(0);
  });

  it('splits the pool by time on the clock, to the cent', () => {
    const shifts = [shift('a', 0, 6 * H), shift('b', 3 * H, 6 * H)];
    const tips = [tip(1000, H), tip(500, 4 * H), tip(9999, 2 * H, true)];
    const { total, shares } = splitPool(tips, shifts, 0, 24 * H, 7 * H);
    expect(total).toBe(1500);
    expect(shares.map((s) => [s.userId, s.cents])).toEqual([
      ['a', 1000],
      ['b', 500],
    ]);
    const odd = splitPool([tip(100, H)], [shift('a', 0, H), shift('b', 0, H), shift('c', 0, H)], 0, 24 * H, 2 * H);
    expect(odd.shares.reduce((s, r) => s + r.cents, 0)).toBe(100);
  });

  it('leaves the pool unsplit when nobody clocked in', () => {
    expect(splitPool([tip(500, H)], [], 0, 24 * H, 2 * H)).toEqual({ total: 500, shares: [] });
  });

  it('formats money and time', () => {
    expect(money(1200)).toBe('$12');
    expect(money(1250)).toBe('$12.50');
    expect(duration(3 * H + 5 * 60000)).toBe('3h 05m');
    expect(duration(45 * 60000)).toBe('45m');
  });

  it('reads typed amounts', () => {
    expect(parseCents('5')).toBe(500);
    expect(parseCents('$7.5')).toBe(750);
    expect(parseCents('12.25')).toBe(1225);
    expect(parseCents('0')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('99999')).toBeNull();
  });

  it('finds the newest handoff note from the last day', () => {
    const shifts = [shift('a', 0, H, 'old'), shift('b', 0, 3 * H, 'Keys box 4 is stuck'), shift('c', 0, 4 * H)];
    expect(latestHandoff(shifts, 5 * H)?.handoffNote).toBe('Keys box 4 is stuck');
    expect(latestHandoff(shifts, 30 * H)).toBeUndefined();
  });

  it('only accepts https tip links', () => {
    expect(validTipUrl('https://venmo.com/u/stand')).toBe(true);
    expect(validTipUrl('')).toBe(true);
    expect(validTipUrl('javascript:alert(1)')).toBe(false);
    expect(validTipUrl('http://x.com')).toBe(false);
  });
});
