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
  /** hook or box the keys hang on; empty means the same number as the tag */
  keySlot?: string;
  /** who has the keys off the board (user id); empty when they're on the board */
  keysWith?: string;
  keysWithName?: string;
  keysOutAt?: number | null;
  /** ids of parked cars this one is blocking in (tandem spaces, ramp stacks) */
  blocks?: string[];
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
  /** a pre-request: bring it up at this time (an event's let-out), not now */
  dueAt?: number | null;
}

/** Someone's time on the clock, and what they left for the next crew. */
export interface Shift {
  id: string;
  userId: string;
  userName: string;
  startedAt: number;
  endedAt: number | null;
  handoffNote: string;
}

/** A tip logged at the stand; the day's tips are pooled by time on shift. */
export interface Tip {
  id: string;
  amountCents: number;
  method: 'cash' | 'digital';
  carId: string | null;
  loggedBy: string;
  loggedByName: string;
  createdAt: number;
  voided?: boolean;
}

/** A show or game letting out at a known time: the whole crew counts down to it. */
export interface LotEvent {
  id: string;
  name: string;
  letOutAt: number;
  createdAt: number;
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

export type IncidentKind = 'damage' | 'accident' | 'complaint' | 'lost_found' | 'other';

/** A damage claim, accident, complaint or found item: one record for insurance and HR. */
export interface Incident {
  id: string;
  kind: IncidentKind;
  status: 'open' | 'resolved';
  carId: string | null;
  /** what the car was at the time, e.g. "#14 · Black BMW · A3" */
  carLabel: string;
  details: string;
  guestName: string;
  guestPhone: string;
  /** storage paths (cloud) or local photo ids */
  photos: string[];
  reportedBy: string;
  reportedByName: string;
  createdAt: number;
  resolvedAt: number | null;
  resolvedByName: string;
  resolution: string;
}
