import { findSpot, listSpots, uid } from './geometry';
import { assetFor } from './assets';
import type { AreaKind, LotMap, MapItem, Site, Spot } from './types';

export const AREA_KINDS: { kind: AreaKind; name: string; icon: string; hint: string }[] = [
  { kind: 'overview', name: 'Whole site', icon: '🗺️', hint: 'Roads, buildings, gates and where everything is' },
  { kind: 'outdoor', name: 'Outdoor area', icon: '🌳', hint: 'A lawn, a plaza, a yard or an event space' },
  { kind: 'lot', name: 'Parking lot', icon: '🅿️', hint: 'Rows of numbered spaces' },
  { kind: 'garage', name: 'Garage level', icon: '🏢', hint: 'One floor of a parking garage' },
  { kind: 'floor', name: 'Building floor', icon: '🚪', hint: 'Rooms, halls and exits inside a building' },
];

export const areaInfo = (k: AreaKind | undefined) => AREA_KINDS.find((a) => a.kind === k) ?? AREA_KINDS[2];

/** The areas of a site, in tab order. */
export function areasOf(maps: LotMap[], siteId: string): LotMap[] {
  return maps
    .filter((m) => m.siteId === siteId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.updatedAt - b.updatedAt);
}

export const nextPosition = (maps: LotMap[], siteId: string) =>
  areasOf(maps, siteId).reduce((n, m) => Math.max(n, (m.position ?? 0) + 1), 0);

export function newSite(name: string): Site {
  return { id: uid(), name: name.trim() || 'New site', updatedAt: Date.now() };
}

/** "Broward Center – Front ramp" → site "Broward Center", area "Front ramp" (same rule as the database move). */
export function splitOldName(name: string): { site: string; area: string } {
  const i = name.indexOf(' – ');
  if (i > 0) return { site: name.slice(0, i).trim(), area: name.slice(i + 3).trim() };
  return { site: name.trim() || 'My site', area: name };
}

/**
 * Maps saved before sites existed (in this browser, or by an older app) are
 * put into sites, so nothing is lost. Returns only what changed.
 */
export function adoptOrphans(sites: Site[], maps: LotMap[]): { sites: Site[]; maps: LotMap[] } {
  const known = new Set(sites.map((s) => s.id));
  const all = [...sites];
  const newSites: Site[] = [];
  const moved: LotMap[] = [];
  const sorted = [...maps].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const m of sorted) {
    if (m.siteId && known.has(m.siteId)) continue;
    const { site, area } = splitOldName(m.name);
    let s = all.find((x) => x.name === site);
    if (!s) {
      s = { ...newSite(site), updatedAt: m.updatedAt };
      all.push(s);
      newSites.push(s);
      known.add(s.id);
    }
    const sid = s.id;
    const position = [...maps.filter((x) => x.siteId === sid), ...moved.filter((x) => x.siteId === sid)].length;
    const kind: AreaKind = m.areaKind ?? (/garage|level/i.test(m.name) ? 'garage' : 'lot');
    moved.push({ ...m, siteId: sid, name: area, areaKind: kind, position });
  }
  return { sites: newSites, maps: moved };
}

export interface Found {
  map: LotMap;
  spot: Spot;
}

/** The place a label or icon marks: "First aid", "Gate 3", "Main stage". */
function findLabeled(items: MapItem[], query: string): Spot | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return undefined;
  const name = (it: MapItem) => (it.label || (it.kind === 'label' ? '' : assetFor(it)?.name) || '').toLowerCase();
  const hit = items.find((it) => name(it) === q) ?? items.find((it) => name(it).includes(q));
  if (!hit) return undefined;
  return {
    key: hit.id,
    label: hit.label || assetFor(hit)?.name || '',
    itemId: hit.id,
    index: 0,
    cx: hit.x + hit.w / 2,
    cy: hit.y + hit.h / 2,
    w: hit.w,
    h: hit.h,
    rotation: hit.rotation,
  };
}

/**
 * Find a numbered space ("D 12") or a named place ("First aid") anywhere on
 * the site: the area on screen first, then the others in tab order.
 */
export function findInSite(areas: LotMap[], currentId: string, query: string): Found | undefined {
  const order = [...areas.filter((m) => m.id === currentId), ...areas.filter((m) => m.id !== currentId)];
  for (const map of order) {
    const spot = findSpot(map.items, query);
    if (spot) return { map, spot };
  }
  for (const map of order) {
    const spot = findLabeled(map.items, query);
    if (spot) return { map, spot };
  }
  return undefined;
}

export const spotCount = (maps: LotMap[]) => maps.reduce((n, m) => n + listSpots(m.items).length, 0);
