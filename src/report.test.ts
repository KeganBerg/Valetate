import { describe, expect, it } from 'vitest';
import { buildReport, hourText, valetCsv, waitOf, waitText, type CarVisit, type RequestVisit } from './report';
import type { Shift, Tip } from './types';

const M = 60 * 1000;
const H = 60 * M;
const base = new Date(2026, 9, 23, 0, 0).getTime();
const at = (h: number, m = 0) => base + h * H + m * M;

const car = (id: string, parkedAt: number, retrievedAt: number | null, by = 'a', outBy = ''): CarVisit => ({
  id,
  mapId: 'm',
  parkedAt,
  retrievedAt,
  parkedBy: by,
  retrievedBy: outBy,
});
const req = (id: string, createdAt: number, readyAt: number | null, claimedBy = 'b', extra: Partial<RequestVisit> = {}): RequestVisit => ({
  id,
  carId: id,
  createdAt,
  claimedAt: createdAt + M,
  readyAt,
  closedAt: readyAt,
  claimedBy,
  claimedByName: claimedBy.toUpperCase(),
  status: readyAt ? 'done' : 'open',
  source: 'staff',
  dueAt: null,
  ...extra,
});

describe('manager report', () => {
  it('measures the wait from the request to the car at the stand', () => {
    expect(waitOf(req('1', at(20), at(20, 6)))).toBe(6 * M);
    expect(waitOf(req('1', at(20), null))).toBeNull();
    // asked for ahead of a let-out: the clock starts at the let-out
    expect(waitOf(req('1', at(19), at(22, 4), 'b', { dueAt: at(22) }))).toBe(4 * M);
  });

  it('adds up a night', () => {
    const data = {
      cars: [car('1', at(18), at(21)), car('2', at(18, 30), at(22), 'b'), car('3', at(19), null), car('old', at(-30), at(-29))],
      requests: [
        req('1', at(20, 55), at(21)),
        req('2', at(21, 50), at(22), 'a', { source: 'guest' }),
        req('x', at(21), null, '', { status: 'cancelled' }),
      ],
      tips: [{ id: 't', amountCents: 2000, method: 'cash', carId: null, loggedBy: 'a', loggedByName: 'A', createdAt: at(21) }] as Tip[],
      shifts: [
        { id: 's1', userId: 'a', userName: 'A', startedAt: at(17), endedAt: at(23), handoffNote: '' },
        { id: 's2', userId: 'b', userName: 'B', startedAt: at(20), endedAt: at(23), handoffNote: '' },
      ] as Shift[],
      people: { a: 'Ana', b: 'Ben' },
    };
    const r = buildReport(data, at(0), at(24), at(24));
    expect(r.carsIn).toBe(3);
    expect(r.carsOut).toBe(2);
    expect(r.requests).toBe(2);
    expect(r.avgWait).toBe(7.5 * M);
    expect(r.guestShare).toBe(0.5);
    expect(r.byHour.carsIn[18]).toBe(2);
    expect(r.peakHour).toBe(20);
    expect(r.tipsPerShift).toBe(1000);
    const ana = r.valets.find((v) => v.userId === 'a')!;
    expect(ana).toMatchObject({ name: 'Ana', parked: 2, broughtUp: 1, minutesOn: 360 });
    expect(ana.tipsCents + r.valets.find((v) => v.userId === 'b')!.tipsCents).toBe(2000);
    expect(valetCsv(r).split('\n')[0]).toContain('Avg wait');
  });

  it('gives one row per day for longer ranges', () => {
    const r = buildReport({ cars: [car('1', at(10), null)], requests: [], tips: [], shifts: [], people: {} }, at(-6 * 24), at(24), at(24));
    expect(r.byDay).toHaveLength(7);
    expect(r.byDay[6].carsIn).toBe(1);
    expect(r.peakHour).toBe(10);
  });

  it('formats waits and hours', () => {
    expect(waitText(45000)).toBe('45s');
    expect(waitText(4.5 * M)).toBe('4m 30s');
    expect(waitText(75 * M)).toBe('1h 15m');
    expect(waitText(null)).toBe('–');
    expect(hourText(0)).toBe('12 AM');
    expect(hourText(21)).toBe('9 PM');
  });
});
