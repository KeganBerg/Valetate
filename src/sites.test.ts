import { describe, expect, it } from 'vitest';
import { adoptOrphans, areasOf, findInSite, splitOldName } from './sites';
import { SITE_TEMPLATES, instantiateSite } from './templates';
import type { LotMap, Site } from './types';

const map = (id: string, name: string, extra: Partial<LotMap> = {}): LotMap => ({
  id,
  name,
  width: 100,
  height: 100,
  surface: '#000',
  items: [],
  updatedAt: Number(id.replace(/\D/g, '')) || 0,
  ...extra,
});

describe('moving old maps into sites', () => {
  it('splits "Site – Area" names', () => {
    expect(splitOldName('Broward Center – Front ramp')).toEqual({ site: 'Broward Center', area: 'Front ramp' });
    expect(splitOldName('WPB Marriott')).toEqual({ site: 'WPB Marriott', area: 'WPB Marriott' });
  });

  it('groups maps of the same venue and keeps the rest as their own site', () => {
    const maps = [map('m1', 'Broward Center – Front ramp'), map('m2', 'Broward Center – Back lot'), map('m3', 'Garage level 1')];
    const { sites, maps: moved } = adoptOrphans([], maps);
    expect(sites.map((s) => s.name)).toEqual(['Broward Center', 'Garage level 1']);
    const broward = sites[0].id;
    expect(areasOf(moved, broward).map((m) => m.name)).toEqual(['Front ramp', 'Back lot']);
    expect(moved.find((m) => m.id === 'm3')!.areaKind).toBe('garage');
  });

  it('leaves maps that already have a site alone and reuses a site by name', () => {
    const site: Site = { id: 's1', name: 'Broward Center', updatedAt: 0 };
    const maps = [map('m1', 'Front ramp', { siteId: 's1', position: 0 }), map('m2', 'Broward Center – Back lot')];
    const r = adoptOrphans([site], maps);
    expect(r.sites).toEqual([]);
    expect(r.maps).toHaveLength(1);
    expect(r.maps[0]).toMatchObject({ id: 'm2', siteId: 's1', name: 'Back lot', position: 1 });
  });
});

describe('site templates', () => {
  it('every site template starts with its areas in order, all in the site', () => {
    for (const t of SITE_TEMPLATES) {
      const areas = instantiateSite(t, 'site');
      expect(areas.length).toBe(t.areas.length);
      expect(areas.every((a) => a.siteId === 'site')).toBe(true);
      expect(areas.map((a) => a.position)).toEqual(areas.map((_, i) => i));
      expect(new Set(areas.map((a) => a.name)).size).toBe(areas.length);
    }
  });
});

describe('finding things on a site', () => {
  const event = SITE_TEMPLATES.find((t) => t.key === 'event')!;
  const areas = instantiateSite(event, 's');

  it('finds a numbered space in another area', () => {
    const found = findInSite(areas, areas[0].id, 'C 12');
    expect(found?.map.name).toBe('Parking lot');
    expect(found?.spot.label).toBe('C 12');
  });

  it('finds a named place, on the area on screen first', () => {
    expect(findInSite(areas, areas[1].id, 'first aid')?.map.id).toBe(areas[1].id);
    expect(findInSite(areas, areas[0].id, 'Main stage')?.map.id).toBe(areas[0].id);
    expect(findInSite(areas, areas[0].id, 'zzz')).toBeUndefined();
  });
});
