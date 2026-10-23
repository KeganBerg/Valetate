import { loadCars, saveCars } from '../ops';
import { loadRequests, saveRequests } from '../requests';
import { loadEvent, logRetrieval, retrievalsSince, saveEvent } from '../surge';
import { loadShifts, loadTips, loadTipUrl, saveShifts, saveTips, saveTipUrl } from '../shifts';
import { localPhotos } from './photoStore';
import { deleteMap, loadMaps, saveMap } from '../storage';
import type { DataSource } from './source';
import { loadHistory, logHistory, type RequestVisit } from '../report';
import { loadIncidents, recentIncidents, saveIncidents } from '../incidents';
import { learnVehicle, loadVehicles, lookupKey, saveVehicle } from '../guests';
import { plateKey } from '../plates';
import type { CarRequest } from '../types';

const visitOf = (r: CarRequest, status: RequestVisit['status']): RequestVisit => ({
  id: r.id,
  carId: r.carId,
  createdAt: r.createdAt,
  claimedAt: r.claimedAt,
  readyAt: r.readyAt,
  closedAt: Date.now(),
  claimedBy: r.claimedBy,
  claimedByName: r.claimedByName,
  status,
  source: r.source,
  dueAt: r.dueAt ?? null,
});

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
  parkCar: async (car) => {
    saveCars([...loadCars(), car]);
    learnVehicle(car);
  },
  moveCar: async (id, spotKey, spotLabel) =>
    saveCars(loadCars().map((c) => (c.id === id ? { ...c, spotKey, spotLabel } : c))),
  updateCar: async (id, patch) => {
    saveCars(loadCars().map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const car = loadCars().find((c) => c.id === id);
    if (car) learnVehicle(car);
  },
  setKeys: async (id, out) =>
    saveCars(
      loadCars().map((c) =>
        c.id === id ? { ...c, ...(out ? { keysWith: 'local', keysWithName: 'You', keysOutAt: Date.now() } : { keysWith: '', keysWithName: '', keysOutAt: null }) } : c,
      ),
    ),
  setBlocks: async (id, blocks) => saveCars(loadCars().map((c) => (c.id === id ? { ...c, blocks } : c))),
  retrieveCar: async (id) => {
    logRetrieval(Date.now());
    const car = loadCars().find((c) => c.id === id);
    if (car)
      logHistory({
        cars: [{ id, mapId: car.mapId, parkedAt: car.parkedAt, retrievedAt: Date.now(), parkedBy: 'local', retrievedBy: 'local', plate: car.plate }],
        requests: loadRequests()
          .filter((r) => r.carId === id)
          .map((r) => visitOf(r, 'done')),
      });
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
  cancelRequest: async (id) => {
    const r = loadRequests().find((x) => x.id === id);
    if (r) logHistory({ requests: [visitOf(r, 'cancelled')] });
    saveRequests(loadRequests().filter((x) => x.id !== id));
  },
  lookupPlate: async (plate) => {
    const k = lookupKey(plate);
    if (!k) return null;
    const past = loadHistory().cars.filter((c) => c.plate && plateKey(c.plate) === k);
    const ids = new Set(past.map((c) => c.id));
    const incs = loadIncidents()
      .filter((i) => i.carId && ids.has(i.carId))
      .sort((a, b) => b.createdAt - a.createdAt);
    return {
      profile: loadVehicles()[k] ?? null,
      pastVisits: past.length,
      lastVisit: past.length ? Math.max(...past.map((c) => c.parkedAt)) : null,
      damageVisits: 0,
      incidents: incs.length,
      lastIncident: incs[0] ? `${incs[0].kind}: ${incs[0].details.slice(0, 140)}` : '',
    };
  },
  saveVehicle: async (p) => saveVehicle(p),
  listIncidents: async () => recentIncidents(loadIncidents(), Date.now()),
  reportIncident: async (inc, photos) => {
    for (const ph of photos)
      await localPhotos.put({ id: ph.id, carId: `incident:${inc.id}`, side: 'closeup', blob: ph.blob, takenAt: inc.createdAt, damage: false, note: '', takenByName: 'You' });
    saveIncidents([...loadIncidents(), { ...inc, photos: photos.map((p) => p.id) }]);
  },
  resolveIncident: async (id, resolution, reopen) =>
    saveIncidents(
      loadIncidents().map((i) =>
        i.id === id
          ? reopen
            ? { ...i, status: 'open', resolvedAt: null, resolvedByName: '', resolution }
            : { ...i, status: 'resolved', resolvedAt: Date.now(), resolvedByName: 'You', resolution }
          : i,
      ),
    ),
  incidentPhotos: async (inc) => (await localPhotos.list(`incident:${inc.id}`)).map((p) => p.url),
  reportData: async (since) => {
    const h = loadHistory();
    return {
      cars: [
        ...h.cars.filter((c) => c.parkedAt >= since || (c.retrievedAt ?? 0) >= since),
        ...loadCars()
          .filter((c) => c.parkedAt >= since)
          .map((c) => ({ id: c.id, mapId: c.mapId, parkedAt: c.parkedAt, retrievedAt: null, parkedBy: 'local', retrievedBy: '' })),
      ],
      requests: [...h.requests, ...loadRequests().map((r) => visitOf(r, r.status))].filter((r) => r.createdAt >= since),
      tips: loadTips().filter((t) => !t.voided && t.createdAt >= since),
      shifts: loadShifts().filter((s) => !s.endedAt || s.endedAt >= since),
      people: { local: 'You' },
    };
  },
  getEvent: async () => loadEvent(),
  startEvent: async (e) => saveEvent(e),
  updateEvent: async (id, patch) => {
    const e = loadEvent();
    if (e?.id === id) saveEvent({ ...e, ...patch });
  },
  endEvent: async () => saveEvent(null),
  carsOutSince: async (since) => retrievalsSince(since),
  listShifts: async (since) => loadShifts().filter((s) => !s.endedAt || s.endedAt >= since),
  clockIn: async (shift) => {
    if (loadShifts().some((s) => !s.endedAt && s.userId === shift.userId)) throw new Error("You're already clocked in");
    saveShifts([...loadShifts(), shift]);
  },
  clockOut: async (id, handoffNote) =>
    saveShifts(loadShifts().map((s) => (s.id === id ? { ...s, endedAt: Date.now(), handoffNote } : s))),
  listTips: async (since) => loadTips().filter((t) => !t.voided && t.createdAt >= since),
  addTip: async (tip) => saveTips([...loadTips(), tip]),
  voidTip: async (id) => saveTips(loadTips().map((t) => (t.id === id ? { ...t, voided: true } : t))),
  getTipUrl: async () => loadTipUrl(),
  setTipUrl: async (url) => saveTipUrl(url),
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
      if (e.key?.startsWith('valetate.shifts') || e.key?.startsWith('valetate.tips')) on.team?.();
      if (e.key?.startsWith('valetate.incidents')) on.incidents?.();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};
