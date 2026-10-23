import type { CarPhoto, CarRequest, LotMap, ParkedCar, PhotoSide } from '../types';

export type CarDetails = Partial<
  Pick<ParkedCar, 'plate' | 'color' | 'make' | 'vehicle' | 'ownerName' | 'ownerPhone' | 'ticket' | 'notes'>
>;

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
  /** fill in details after a fast check-in */
  updateCar(id: string, patch: CarDetails): Promise<void>;
  /** the car left the lot; any request for it is finished too */
  retrieveCar(id: string): Promise<void>;
  /** who is using this device, for claiming requests */
  me: { id: string; name: string };
  /** requests that are open, claimed or ready */
  listRequests(): Promise<CarRequest[]>;
  createRequest(r: CarRequest): Promise<void>;
  /** fails if someone else claimed it first */
  claimRequest(id: string): Promise<void>;
  unclaimRequest(id: string): Promise<void>;
  /** the car is at the stand; the guest's page says so */
  markReady(id: string): Promise<void>;
  cancelRequest(id: string): Promise<void>;
  /** walkaround photos for a car, oldest first */
  listPhotos(carId: string): Promise<CarPhoto[]>;
  /** store an already-shrunk JPEG; `id` is chosen by the caller so a retry can't duplicate it */
  addPhoto(photo: { id: string; car: ParkedCar; side: PhotoSide; blob: Blob; takenAt: number }): Promise<CarPhoto>;
  setPhotoDamage(id: string, damage: boolean): Promise<void>;
  /** put a car marked retrieved by mistake back on its spot */
  unretrieveCar(car: ParkedCar): Promise<void>;
  /**
   * called when another device changes maps, cars or requests; `live` reports whether
   * changes are arriving (false while the connection is down)
   */
  subscribe(on: { maps: () => void; cars: () => void; requests?: () => void; live?: (live: boolean) => void }): () => void;
}
