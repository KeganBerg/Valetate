import { describe, expect, it, vi } from 'vitest';
import { applyPending, withOutbox } from './data/outbox';
import type { DataSource } from './data/source';
import type { ParkedCar } from './types';

const car = (id: string, spotKey = 's' + id): ParkedCar => ({
  id,
  mapId: 'm',
  spotKey,
  spotLabel: spotKey,
  plate: '',
  color: '',
  make: '',
  vehicle: '',
  ownerName: '',
  ownerPhone: '',
  ticket: id,
  notes: '',
  parkedAt: 0,
});

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

/** a server that can be switched offline */
function fakeServer() {
  const state = { online: true, cars: [] as ParkedCar[], reject: null as string | null };
  const guard = () => {
    if (!state.online) throw new TypeError('Failed to fetch');
    if (state.reject) throw new Error(state.reject);
  };
  const inner = {
    kind: 'cloud',
    listCars: async () => {
      guard();
      return state.cars;
    },
    parkCar: async (c: ParkedCar) => {
      guard();
      state.cars = [...state.cars, c];
    },
    moveCar: async (id: string, spotKey: string) => {
      guard();
      state.cars = state.cars.map((c) => (c.id === id ? { ...c, spotKey } : c));
    },
    retrieveCar: async (id: string) => {
      guard();
      state.cars = state.cars.filter((c) => c.id !== id);
    },
  } as unknown as DataSource;
  return { state, inner };
}

describe('outbox', () => {
  it('applies queued changes on top of what the server has', () => {
    const cars = [car('1'), car('2')];
    const out = applyPending(cars, [
      { kind: 'parkCar', car: car('3') },
      { kind: 'retrieveCar', id: '1' },
      { kind: 'moveCar', id: '2', spotKey: 'x', spotLabel: 'X' },
    ]);
    expect(out.map((c) => c.id)).toEqual(['2', '3']);
    expect(out[0].spotKey).toBe('x');
  });

  it('keeps changes made with no signal and sends them in order later', async () => {
    const { state, inner } = fakeServer();
    const store = memoryStore();
    const src = withOutbox(inner, 'q', store, 60_000);
    state.online = false;
    await src.parkCar(car('1')); // resolves: saved on the phone
    await src.moveCar('1', 'b', 'B');
    expect(src.outbox.count()).toBe(2);
    // the lot still shows the car while it waits
    expect(await (async () => {
      state.online = true;
      return (await src.listCars()).map((c) => c.spotKey);
    })()).toEqual(['b']);
    await src.outbox.flush();
    expect(src.outbox.count()).toBe(0);
    expect(state.cars.map((c) => c.spotKey)).toEqual(['b']);
  });

  it('survives the app being closed', async () => {
    const { state, inner } = fakeServer();
    const store = memoryStore();
    state.online = false;
    await withOutbox(inner, 'q', store, 60_000).parkCar(car('1'));
    state.online = true;
    const reopened = withOutbox(inner, 'q', store, 60_000);
    await reopened.outbox.flush();
    expect(state.cars.map((c) => c.id)).toEqual(['1']);
  });

  it('rejects a change the server refuses, and reports one refused later', async () => {
    const { state, inner } = fakeServer();
    const src = withOutbox(inner, 'q', memoryStore(), 60_000);
    state.reject = 'duplicate key value violates unique constraint "parked_cars_one_per_spot"';
    await expect(src.parkCar(car('1'))).rejects.toThrow(/one_per_spot/);
    expect(src.outbox.count()).toBe(0);

    state.reject = null;
    state.online = false;
    await src.parkCar(car('2'));
    const heard = vi.fn();
    src.outbox.subscribe(heard);
    state.online = true;
    state.reject = 'permission denied';
    await src.outbox.flush();
    expect(heard).toHaveBeenCalledWith(0, expect.any(Error));
  });

  it('treats a park the server already has as sent', async () => {
    const { state, inner } = fakeServer();
    const src = withOutbox(inner, 'q', memoryStore(), 60_000);
    state.reject = 'duplicate key value violates unique constraint "parked_cars_pkey"';
    await expect(src.parkCar(car('1'))).resolves.toBeUndefined();
    expect(src.outbox.count()).toBe(0);
  });
});
