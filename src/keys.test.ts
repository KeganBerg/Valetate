import { describe, expect, it } from 'vitest';
import { carsWithKeysOut, hookTaken, keyHook } from './keys';
import type { ParkedCar } from './types';

const car = (id: string, p: Partial<ParkedCar> = {}): ParkedCar => ({
  id,
  mapId: 'm',
  spotKey: id,
  spotLabel: id,
  plate: '',
  color: '',
  make: '',
  vehicle: '',
  ownerName: '',
  ownerPhone: '',
  ticket: '',
  notes: '',
  parkedAt: 0,
  ...p,
});

describe('keys', () => {
  it('hangs keys on the tag number unless a slot is set', () => {
    expect(keyHook(car('a', { ticket: '12' }))).toBe('12');
    expect(keyHook(car('a', { ticket: '12', keySlot: ' B4 ' }))).toBe('B4');
  });

  it('lists keys out, longest out first', () => {
    const cars = [car('a', { keysWith: 'u1', keysOutAt: 200 }), car('b'), car('c', { keysWith: 'u2', keysOutAt: 100 })];
    expect(carsWithKeysOut(cars).map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('finds a hook already in use, ignoring the car itself', () => {
    const cars = [car('a', { ticket: '12' }), car('b', { ticket: '13', keySlot: 'b4' })];
    expect(hookTaken(cars, 'B4')?.id).toBe('b');
    expect(hookTaken(cars, '12', 'a')).toBeUndefined();
    expect(hookTaken(cars, '')).toBeUndefined();
  });
});
