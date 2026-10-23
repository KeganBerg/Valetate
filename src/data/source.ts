import type { CarPhoto, CarRequest, LotEvent, LotMap, ParkedCar, PhotoSide } from '../types';
import type { Outbox } from './outbox';

export type CarDetails = Partial<
  Pick<ParkedCar, 'plate' | 'color' | 'make' | 'vehicle' | 'ownerName' | 'ownerPhone' | 'ticket' | 'notes' | 'keySlot'>
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
  /** car changes waiting for signal (cloud only) */
  outbox?: Outbox;
  listMaps(): Promise<LotMap[]>;
  /**
   * Saves over `baseVersion` (the version this device last saw; none for a new
   * map) and returns the new version. Throws MapConflict if someone else saved
   * in between, so their work isn't silently overwritten.
   */
  saveMap(map: LotMap, baseVersion?: number): Promise<number | undefined>;
  deleteMap(id: string): Promise<void>;
  /** cars currently parked */
  listCars(): Promise<ParkedCar[]>;
  parkCar(car: ParkedCar): Promise<void>;
  moveCar(id: string, spotKey: string, spotLabel: string): Promise<void>;
  /** fill in details after a fast check-in */
  updateCar(id: string, patch: CarDetails): Promise<void>;
  /** take a car's keys off the board (they're with me now), or hang them back */
  setKeys(id: string, out: boolean): Promise<void>;
  /** which parked cars this one blocks in */
  setBlocks(id: string, blocks: string[]): Promise<void>;
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
  /** the event running now, if any */
  getEvent(): Promise<LotEvent | null>;
  startEvent(e: LotEvent): Promise<void>;
  updateEvent(id: string, patch: Pick<LotEvent, 'name' | 'letOutAt'>): Promise<void>;
  endEvent(id: string): Promise<void>;
  /** cars that left the lot since `since`, for the let-out pace */
  carsOutSince(since: number): Promise<number>;
  /** put a car marked retrieved by mistake back on its spot */
  unretrieveCar(car: ParkedCar): Promise<void>;
  /**
   * called when another device changes maps, cars or requests; `live` reports whether
   * changes are arriving (false while the connection is down)
   */
  subscribe(on: { maps: () => void; cars: () => void; requests?: () => void; event?: () => void; live?: (live: boolean) => void }): () => void;
}

/** Someone else saved (or deleted) the map since this device last saw it. */
export class MapConflict extends Error {
  /** their version, or null if the map was deleted */
  constructor(readonly theirs: LotMap | null) {
    super(theirs ? 'Someone else changed this map' : 'This map was deleted');
  }
}
