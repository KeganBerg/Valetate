import type { LotMap } from '../types';

export type Role = 'admin' | 'manager' | 'valet';

export const ROLE_INFO: Record<Role, { name: string; can: string }> = {
  admin: { name: 'Admin', can: 'Manages the team and builds maps' },
  manager: { name: 'Manager', can: 'Builds and edits maps' },
  valet: { name: 'Viewer', can: 'Sees the maps' },
};

export const canEditMaps = (r: Role) => r === 'admin' || r === 'manager';

/**
 * Where maps live. `local` keeps them in this browser;
 * `cloud` is a company's shared Supabase data.
 */
export interface DataSource {
  kind: 'local' | 'cloud';
  listMaps(): Promise<LotMap[]>;
  /**
   * Saves over `baseVersion` (the version this device last saw; none for a new
   * map) and returns the new version. Throws MapConflict if someone else saved
   * in between, so their work isn't silently overwritten.
   */
  saveMap(map: LotMap, baseVersion?: number): Promise<number | undefined>;
  deleteMap(id: string): Promise<void>;
  /**
   * called when another device changes a map; `live` reports whether
   * changes are arriving (false while the connection is down)
   */
  subscribe(on: { maps: () => void; live?: (live: boolean) => void }): () => void;
}

/** Someone else saved (or deleted) the map since this device last saw it. */
export class MapConflict extends Error {
  /** their version, or null if the map was deleted */
  constructor(readonly theirs: LotMap | null) {
    super(theirs ? 'Someone else changed this map' : 'This map was deleted');
  }
}
