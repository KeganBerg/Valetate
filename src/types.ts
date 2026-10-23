export type AssetKind =
  | 'space'
  | 'spaceRow'
  | 'ramp'
  | 'booth'
  | 'car'
  | 'wall'
  | 'pole'
  | 'stairs'
  | 'elevator'
  | 'building'
  | 'tree'
  | 'palm'
  | 'bush'
  | 'island'
  | 'arrow'
  | 'crosswalk'
  | 'laneLine'
  | 'curb'
  | 'zone'
  | 'label';

/**
 * Every object on a map is an axis-aligned box (x, y, w, h) rotated by
 * `rotation` degrees around its center. Kind-specific fields are optional.
 */
export interface MapItem {
  id: string;
  kind: AssetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  color?: string;
  /** label */
  fontSize?: number;
  /** space */
  accessible?: boolean;
  /** spaceRow: row letter(s), e.g. "D" makes spots "D 1", "D 2"... */
  prefix?: string;
  /** spaceRow: number of the first spot */
  start?: number;
  /** spaceRow: number of spots in the row */
  count?: number;
  /** spaceRow: count from the right/bottom end instead of the left/top */
  reverse?: boolean;
}

export interface LotMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** ground color of the lot (asphalt, concrete...) */
  surface: string;
  items: MapItem[];
  updatedAt: number;
  /** goes up on every shared save; absent until the map is saved to a company */
  version?: number;
}

/**
 * A parkable spot. `key` is stable while the space exists (renumbering a row
 * keeps keys of numbers that still exist), so tickets and requests can point at it.
 */
export interface Spot {
  key: string;
  label: string;
  itemId: string;
  /** index inside a row (0 for single spaces) */
  index: number;
  /** world center of the spot */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** A car currently parked on a spot (live lot). */
export interface ParkedCar {
  id: string;
  mapId: string;
  /** Spot.key, so the car follows its space if the map is rearranged */
  spotKey: string;
  /** label at the time of parking, shown if the spot is later removed */
  spotLabel: string;
  plate: string;
  /** car color name, e.g. "Black" (see CAR_COLORS) */
  color: string;
  make: string;
  /** model or anything else about the car */
  vehicle: string;
  ownerName: string;
  ownerPhone: string;
  /** key tag / ticket number: the one thing a valet must enter at rush */
  ticket: string;
  /** secret for the guest's request link; cloud only */
  guestToken?: string;
  notes: string;
  parkedAt: number;
}

/** Someone asked for a parked car; a valet claims it and brings it up. */
export interface CarRequest {
  id: string;
  carId: string;
  mapId: string;
  /** open: nobody has it · claimed: a valet is getting it · ready: it's at the stand */
  status: 'open' | 'claimed' | 'ready';
  /** who asked: the stand, or the guest from their link */
  source: 'staff' | 'guest' | 'sms';
  note: string;
  createdAt: number;
  createdByName: string;
  claimedBy: string;
  claimedByName: string;
  claimedAt: number | null;
  readyAt: number | null;
}

export type PhotoSide = 'front' | 'driver' | 'back' | 'passenger' | 'closeup';

/** One walkaround picture: proof of how the car looked when we took it. */
export interface CarPhoto {
  id: string;
  carId: string;
  side: PhotoSide;
  /** something the browser can show (signed URL or object URL) */
  url: string;
  damage: boolean;
  note: string;
  takenAt: number;
  takenByName: string;
}
