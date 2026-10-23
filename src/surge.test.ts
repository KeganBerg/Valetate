import { describe, expect, it } from 'vitest';
import { almostFull, clock, isPre, nearestOpen, nextTime, pace, stagingList, standPoint } from './surge';
import type { CarRequest, MapItem, ParkedCar, Spot } from './types';

const spot = (key: string, cx: number, cy: number): Spot => ({ key, label: key, itemId: 'r', index: 0, cx, cy, w: 30, h: 60, rotation: 0 });

describe('surge', () => {
  it('formats the countdown', () => {
    expect(clock(18 * 60_000 + 32_000)).toBe('18:32');
    expect(clock(3_849_000)).toBe('1:04:09');
    expect(clock(-65_000)).toBe('1:05');
  });

  it('picks tonight, or tomorrow once the time is well past', () => {
    const now = new Date(2026, 9, 23, 20, 0).getTime();
    expect(nextTime('22:15', now)).toBe(new Date(2026, 9, 23, 22, 15).getTime());
    expect(nextTime('19:30', now)).toBe(new Date(2026, 9, 23, 19, 30).getTime());
    expect(nextTime('8:00', now)).toBe(new Date(2026, 9, 24, 8, 0).getTime());
    expect(nextTime('soon', now)).toBeNull();
  });

  it('works out the pace once there is enough to go on', () => {
    expect(pace(0, 0, 10 * 60_000, 50).minsLeft).toBeNull();
    expect(pace(5, 0, 60_000, 50).minsLeft).toBeNull();
    const p = pace(30, 0, 10 * 60_000, 60);
    expect(p.perMin).toBe(3);
    expect(p.minsLeft).toBe(20);
  });

  it('tells pre-requests from requests due now', () => {
    expect(isPre({ status: 'open', dueAt: 2000 }, 1000)).toBe(true);
    expect(isPre({ status: 'open', dueAt: 500 }, 1000)).toBe(false);
    expect(isPre({ status: 'claimed', dueAt: 2000 }, 1000)).toBe(false);
    expect(isPre({ status: 'open', dueAt: null }, 1000)).toBe(false);
  });

  it('stages the farthest pre-requested cars first, into the open spots nearest the booth', () => {
    const items = [{ id: 'b', kind: 'booth', x: -23, y: -23, w: 46, h: 46, rotation: 0 }] as MapItem[];
    const stand = standPoint(items, { x: 999, y: 999 });
    expect(stand).toEqual({ x: 0, y: 0 });
    const spots = [spot('near', 40, 0), spot('mid', 200, 0), spot('far', 600, 0), spot('open1', 60, 0), spot('open2', 500, 0)];
    const cars = [
      { id: 'a', spotKey: 'mid' },
      { id: 'b', spotKey: 'far' },
      { id: 'c', spotKey: 'near' },
    ] as ParkedCar[];
    const pre = [{ carId: 'a' }, { carId: 'b' }] as CarRequest[];
    expect(stagingList(cars, spots, pre, stand).map((c) => c.id)).toEqual(['b', 'a']);
    const taken = new Set(cars.map((c) => c.spotKey));
    expect(nearestOpen(spots, taken, stand, 1).map((s) => s.key)).toEqual(['open1']);
  });

  it('calls a lot almost full at 5% or 3 spots', () => {
    expect(almostFull(3, 40)).toBe(true);
    expect(almostFull(4, 40)).toBe(false);
    expect(almostFull(10, 200)).toBe(true);
    expect(almostFull(11, 200)).toBe(false);
    expect(almostFull(0, 0)).toBe(false);
  });
});
