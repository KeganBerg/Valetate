import { describe, expect, it } from 'vitest';
import { carLabel, recentIncidents, sortIncidents } from './incidents';
import type { Incident, ParkedCar } from './types';

const D = 24 * 60 * 60 * 1000;
const inc = (id: string, createdAt: number, resolvedAt: number | null = null): Incident => ({
  id,
  kind: 'damage',
  status: resolvedAt ? 'resolved' : 'open',
  carId: null,
  carLabel: '',
  details: 'x',
  guestName: '',
  guestPhone: '',
  photos: [],
  reportedBy: 'a',
  reportedByName: 'A',
  createdAt,
  resolvedAt,
  resolvedByName: '',
  resolution: '',
});

describe('incidents', () => {
  it('lists open ones first, oldest first, then resolved newest first', () => {
    const list = [inc('r1', 1, 5), inc('o2', 3), inc('r2', 2, 9), inc('o1', 2)];
    expect(sortIncidents(list).map((i) => i.id)).toEqual(['o1', 'o2', 'r2', 'r1']);
  });

  it('keeps every open one but only a month of resolved ones', () => {
    const now = 100 * D;
    const list = [inc('old-open', 0), inc('old-done', 0, 60 * D), inc('new-done', 90 * D, 95 * D)];
    expect(recentIncidents(list, now).map((i) => i.id)).toEqual(['old-open', 'new-done']);
  });

  it('names the car the way the stand knows it', () => {
    const car = { ticket: '14', color: 'Black', make: 'BMW', vehicle: 'X5', plate: 'ABC123', spotLabel: 'A3' } as ParkedCar;
    expect(carLabel(car)).toBe('#14 · Black BMW X5 · ABC123 · Spot A3');
  });
});
