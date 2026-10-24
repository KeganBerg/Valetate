import { deleteMap, deleteSite, loadMaps, loadSites, saveMap, saveSite } from '../storage';
import type { DataSource } from './source';

/** Single-device mode: everything stays in this browser. */
export const localSource: DataSource = {
  kind: 'local',
  listSites: async () => loadSites(),
  saveSite: async (s) => saveSite(s),
  deleteSite: async (id) => deleteSite(id),
  listMaps: async () => loadMaps(),
  saveMap: async (m) => {
    saveMap(m);
    return undefined;
  },
  deleteMap: async (id) => deleteMap(id),
  subscribe: () => () => {},
};
