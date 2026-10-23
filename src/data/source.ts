import type { LotMap, ParkedCar } from '../types';

export type Role = 'admin' | 'manager' | 'valet';

export const ROLE_INFO: Record<Role, { name: string; can: string }> = {
  admin: { name: 'Admin', can: 'Manages the team, builds maps, parks cars' },
  manager: { name: 'Manager', can: 'Builds and edits maps, parks cars' },
  valet: { name: 'Valet', can: 'Sees the live lot, parks and retrieves cars' },
};

export const canEditMaps = (r: Role) => r === 'admin' || r === 'manager';

/**
 * Where maps and cars live. `local` keeps everything in this browser;
 * `cloud` is a company's shared Supabase data.
 */
export interface DataSource {
  kind: 'local' | 'cloud';
  listMaps(): Promise<LotMap[]>;
  saveMap(map: LotMap): Promise<void>;
  deleteMap(id: string): Promise<void>;
  /** cars currently parked */
  listCars(): Promise<ParkedCar[]>;
  parkCar(car: ParkedCar): Promise<void>;
  moveCar(id: string, spotKey: string, spotLabel: string): Promise<void>;
  retrieveCar(id: string): Promise<void>;
  /** called when another device changes maps or cars */
  subscribe(on: { maps: () => void; cars: () => void }): () => void;
}
