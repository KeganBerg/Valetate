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
  | 'label'
  // site pieces
  | 'entrance'
  | 'exit'
  | 'gate'
  | 'fence'
  | 'stage'
  | 'tent'
  | 'toilets'
  | 'firstAid'
  | 'assembly'
  | 'info'
  | 'loadingDock'
  | 'extinguisher'
  | 'north';

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

/** What kind of place an area is; picks its starting template and icon. */
export type AreaKind = 'overview' | 'outdoor' | 'lot' | 'garage' | 'floor';

/**
 * One property or grounds: a venue, an event, a campus, a garage.
 * Its areas are the maps whose `siteId` is the site's id.
 */
export interface Site {
  id: string;
  name: string;
  /** street address, shown under the name */
  address?: string;
  updatedAt: number;
}

/** One area of a site: an overview, an outdoor area, a lot, a garage level or a floor. */
export interface LotMap {
  id: string;
  name: string;
  /** the site this area belongs to (absent only on maps from before sites) */
  siteId?: string;
  areaKind?: AreaKind;
  /** order of the area's tab inside its site */
  position?: number;
  width: number;
  height: number;
  /** ground color of the lot (asphalt, concrete...) */
  surface: string;
  items: MapItem[];
  updatedAt: number;
  /** goes up on every shared save; absent until the map is saved to a company */
  version?: number;
  /** a satellite photo of the real lot under the drawing, to trace over */
  backdrop?: MapBackdrop;
}

/**
 * Where the real world sits under a map: the point (lat, lng) is drawn at map
 * point (x, y), `scale` map units make a meter, and the photo is turned
 * `rotation` degrees so the real rows line up with the drawn ones.
 */
export interface MapBackdrop {
  lat: number;
  lng: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** 0–1 */
  opacity: number;
  hidden?: boolean;
  /** what was searched for, shown back in the panel */
  place?: string;
}

/**
 * A parkable spot. `key` is stable while the space exists (renumbering a row
 * keeps keys of numbers that still exist), so labels stay put when a row is edited.
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
