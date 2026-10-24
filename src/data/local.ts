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
  deleteMap: async (id) => deleteMap(id),
  subscribe: () => () => {},
};
