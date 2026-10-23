import { loadCars, saveCars } from '../ops';
import { deleteMap, loadMaps, saveMap } from '../storage';
import type { DataSource } from './source';

/** Single-device mode: everything stays in this browser. */
export const localSource: DataSource = {
  kind: 'local',
  listMaps: async () => loadMaps(),
  saveMap: async (m) => saveMap(m),
  deleteMap: async (id) => {
    deleteMap(id);
    saveCars(loadCars().filter((c) => c.mapId !== id));
  },
  listCars: async () => loadCars(),
  parkCar: async (car) => saveCars([...loadCars(), car]),
  moveCar: async (id, spotKey, spotLabel) =>
    saveCars(loadCars().map((c) => (c.id === id ? { ...c, spotKey, spotLabel } : c))),
  retrieveCar: async (id) => saveCars(loadCars().filter((c) => c.id !== id)),
  subscribe(on) {
    // other tabs on this device
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('valetate.maps')) on.maps();
      if (e.key?.startsWith('valetate.cars')) on.cars();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};
