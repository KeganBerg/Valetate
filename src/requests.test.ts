import { describe, expect, it } from 'vitest';
import { liveRequests, newGuestToken, sortQueue } from './requests';
import type { CarRequest } from './types';

const req = (id: string, status: CarRequest['status'], createdAt: number, carId = id): CarRequest => ({
  id,
  carId,
  mapId: 'm',
  status,
  source: 'staff',
  note: '',
  createdAt,
  createdByName: '',
  claimedBy: '',
  claimedByName: '',
  claimedAt: null,
  readyAt: null,
});

describe('request queue', () => {
  it('puts untaken requests first, oldest first, then claimed, then cars already up', () => {
    const q = sortQueue([req('c', 'claimed', 1), req('r', 'ready', 0), req('b', 'open', 5), req('a', 'open', 2)]);
    expect(q.map((r) => r.id)).toEqual(['a', 'b', 'c', 'r']);
  });

  it('drops requests for cars that are no longer parked', () => {
    expect(liveRequests([req('a', 'open', 1, 'car1'), req('b', 'open', 1, 'gone')], new Set(['car1'])).map((r) => r.id)).toEqual(['a']);
  });

  it('makes long, unguessable guest tokens', () => {
    const a = newGuestToken();
    expect(a).toMatch(/^[0-9a-f]{20}$/);
    expect(newGuestToken()).not.toBe(a);
  });
});
