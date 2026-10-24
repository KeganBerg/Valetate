import type { MapBackdrop } from './types';

/**
 * Satellite photos under a lot map. Tiles come from Esri World Imagery, which
 * needs no key; place search is OpenStreetMap's Nominatim.
 */

/** templates draw a 9 ft wide space 40 units wide, so a real-size lot is about this many units per meter */
export const UNITS_PER_METER = 40 / (9 * 0.3048);
export const TILE = 256;
export const MAX_TILE_Z = 19;
export const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';
const EARTH = 156543.03392; // meters per pixel at zoom 0 on the equator
/** keep the browser from asking for hundreds of tiles when zoomed far out */
const MAX_TILES = 120;

export const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** web mercator pixel of a place at tile zoom z */
export function project(lat: number, lng: number, z: number) {
  const size = TILE * 2 ** z;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

export const metersPerPixel = (lat: number, z: number) => (EARTH * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** the tile zoom whose pixels are about the size of a screen pixel at this view zoom */
export function tileZoom(b: MapBackdrop, viewZ: number, dpr = 1) {
  const want = EARTH * Math.cos((b.lat * Math.PI) / 180) * b.scale * viewZ * Math.min(2, dpr);
  return Math.max(1, Math.min(MAX_TILE_Z, Math.round(Math.log2(want))));
}

export interface TileLayer {
  z: number;
  /** map units per tile pixel */
  k: number;
  /** the anchor's tile pixel */
  ax: number;
  ay: number;
  tiles: { key: string; url: string; x: number; y: number }[];
}

/** tiles covering a rectangle of the map (in map units) at tile zoom z */
export function tilesFor(b: MapBackdrop, z: number, area: { x: number; y: number; w: number; h: number }): TileLayer {
  const k = b.scale * metersPerPixel(b.lat, z);
  const a = project(b.lat, b.lng, z);
  const r = (-b.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [wx, wy] of [
    [area.x, area.y],
    [area.x + area.w, area.y],
    [area.x, area.y + area.h],
    [area.x + area.w, area.y + area.h],
  ]) {
    const dx = (wx - b.x) / k;
    const dy = (wy - b.y) / k;
    const px = a.x + dx * cos - dy * sin;
    const py = a.y + dx * sin + dy * cos;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const n = 2 ** z;
  const x0 = Math.floor(minX / TILE);
  const x1 = Math.floor(maxX / TILE);
  const y0 = Math.max(0, Math.floor(minY / TILE));
  const y1 = Math.min(n - 1, Math.floor(maxY / TILE));
  const tiles: TileLayer['tiles'] = [];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n;
        tiles.push({ key: `${z}/${tx}/${ty}`, url: tileUrl(z, wrapped, ty), x: tx * TILE, y: ty * TILE });
      }
    }
  }
  return { z, k, ax: a.x, ay: a.y, tiles };
}

/** a new photo centered on the lot, drawn at real size */
export function placeBackdrop(lat: number, lng: number, lot: { width: number; height: number }, place?: string): MapBackdrop {
  return { lat, lng, x: lot.width / 2, y: lot.height / 2, scale: UNITS_PER_METER, rotation: 0, opacity: 0.85, place };
}

/** move the photo with the objects when the lot grows up or left */
export const shiftBackdrop = (b: MapBackdrop | undefined, dx: number, dy: number) =>
  b && (dx || dy) ? { ...b, x: b.x + dx, y: b.y + dy } : b;

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address search is not answering. Try again in a minute.');
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}
