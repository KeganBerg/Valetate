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
