import { loadCars, saveCars } from '../ops';
import { loadRequests, saveRequests } from '../requests';
import { loadEvent, logRetrieval, retrievalsSince, saveEvent } from '../surge';
import { localPhotos } from './photoStore';
import { deleteMap, loadMaps, saveMap } from '../storage';
import type { DataSource } from './source';

/** Single-device mode: everything stays in this browser. */
export const localSource: DataSource = {
  kind: 'local',
  listMaps: async () => loadMaps(),
  saveMap: async (m) => {
    saveMap(m);
    return undefined;
  },
  deleteMap: async (id) => {
    deleteMap(id);
    saveCars(loadCars().filter((c) => c.mapId !== id));
    saveRequests(loadRequests().filter((r) => r.mapId !== id));
  },
  listCars: async () => loadCars(),
  parkCar: async (car) => saveCars([...loadCars(), car]),
  moveCar: async (id, spotKey, spotLabel) =>
    saveCars(loadCars().map((c) => (c.id === id ? { ...c, spotKey, spotLabel } : c))),
  updateCar: async (id, patch) => saveCars(loadCars().map((c) => (c.id === id ? { ...c, ...patch } : c))),
  setKeys: async (id, out) =>
    saveCars(
      loadCars().map((c) =>
        c.id === id ? { ...c, ...(out ? { keysWith: 'local', keysWithName: 'You', keysOutAt: Date.now() } : { keysWith: '', keysWithName: '', keysOutAt: null }) } : c,
      ),
    ),
  setBlocks: async (id, blocks) => saveCars(loadCars().map((c) => (c.id === id ? { ...c, blocks } : c))),
  retrieveCar: async (id) => {
    logRetrieval(Date.now());
    saveCars(loadCars().filter((c) => c.id !== id));
    saveRequests(loadRequests().filter((r) => r.carId !== id));
  },
  me: { id: 'local', name: 'You' },
  listRequests: async () => loadRequests(),
  createRequest: async (r) => {
    const list = loadRequests();
    if (list.some((x) => x.carId === r.carId)) throw new Error('That car is already requested');
    saveRequests([...list, r]);
  },
  claimRequest: async (id) => {
    const list = loadRequests();
    const r = list.find((x) => x.id === id);
    if (!r) throw new Error('That request is gone');
    if (r.status !== 'open') throw new Error(`${r.claimedByName || 'Someone'} already has it`);
    saveRequests(list.map((x) => (x.id === id ? { ...x, status: 'claimed', claimedBy: 'local', claimedByName: 'You', claimedAt: Date.now() } : x)));
  },
  unclaimRequest: async (id) =>
    saveRequests(
      loadRequests().map((x) => (x.id === id ? { ...x, status: 'open', claimedBy: '', claimedByName: '', claimedAt: null } : x)),
    ),
  markReady: async (id) =>
    saveRequests(loadRequests().map((x) => (x.id === id ? { ...x, status: 'ready', readyAt: Date.now() } : x))),
  cancelRequest: async (id) => saveRequests(loadRequests().filter((x) => x.id !== id)),
  getEvent: async () => loadEvent(),
  startEvent: async (e) => saveEvent(e),
  updateEvent: async (id, patch) => {
    const e = loadEvent();
    if (e?.id === id) saveEvent({ ...e, ...patch });
  },
  endEvent: async () => saveEvent(null),
  carsOutSince: async (since) => retrievalsSince(since),
  unretrieveCar: async (car) => saveCars([...loadCars().filter((c) => c.id !== car.id), car]),
  listPhotos: (carId) => localPhotos.list(carId),
  addPhoto: ({ id, car, side, blob, takenAt }) =>
    localPhotos.put({ id, carId: car.id, side, blob, takenAt, damage: false, note: '', takenByName: 'You' }),
  setPhotoDamage: (id, damage) => localPhotos.setDamage(id, damage),
  subscribe(on) {
    // other tabs on this device
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('valetate.maps')) on.maps();
      if (e.key?.startsWith('valetate.cars')) on.cars();
      if (e.key?.startsWith('valetate.requests')) on.requests?.();
      if (e.key?.startsWith('valetate.event')) on.event?.();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};
