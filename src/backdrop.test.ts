import { describe, expect, it } from 'vitest';
import { UNITS_PER_METER, metersPerPixel, placeBackdrop, project, shiftBackdrop, tileZoom, tilesFor } from './backdrop';

const wpb = placeBackdrop(26.7069, -80.0636, { width: 1000, height: 800 });

describe('satellite backdrop', () => {
  it('projects to web mercator', () => {
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const p = project(0, 180, 1);
    expect(p.x).toBeCloseTo(512);
  });

  it('starts centered on the lot at real size', () => {
    expect(wpb).toMatchObject({ x: 500, y: 400, rotation: 0, scale: UNITS_PER_METER });
  });

  it('picks tiles about one screen pixel each', () => {
    const viewZ = 0.2;
    const z = tileZoom(wpb, viewZ);
    const tilePxOnScreen = metersPerPixel(wpb.lat, z) * wpb.scale * viewZ;
    expect(tilePxOnScreen).toBeGreaterThan(0.7);
    expect(tilePxOnScreen).toBeLessThan(1.42);
    // closer than the photos go, the sharpest tiles are stretched
    expect(tileZoom(wpb, 4)).toBe(19);
  });

  it('covers the asked area and puts the place at the anchor', () => {
    const z = 18;
    const layer = tilesFor(wpb, z, { x: 0, y: 0, w: 1000, h: 800 });
    expect(layer.tiles.length).toBeGreaterThan(0);
    const xs = layer.tiles.map((t) => t.x);
    const ys = layer.tiles.map((t) => t.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(layer.ax);
    expect(Math.max(...xs) + 256).toBeGreaterThan(layer.ax);
    expect(Math.min(...ys)).toBeLessThanOrEqual(layer.ay);
    expect(Math.max(...ys) + 256).toBeGreaterThan(layer.ay);
  });

  it('gives up instead of asking for too many tiles', () => {
    expect(tilesFor(wpb, 19, { x: -1e5, y: -1e5, w: 2e5, h: 2e5 }).tiles).toHaveLength(0);
  });

  it('moves with the objects when the lot grows up or left', () => {
    expect(shiftBackdrop(wpb, 30, 12)).toMatchObject({ x: 530, y: 412 });
    expect(shiftBackdrop(wpb, 0, 0)).toBe(wpb);
    expect(shiftBackdrop(undefined, 5, 5)).toBeUndefined();
  });
});

describe('satellite photo in the editor history', () => {
  it('undoes lining up the photo, and keeps it with the objects on undo of a lot change', async () => {
    const { initState, reducer } = await import('./store');
    const map = { id: 'm', name: 'm', width: 1000, height: 800, surface: '#000', items: [], updatedAt: 0 };
    let s = initState(map);
    s = reducer(s, { type: 'meta', patch: { backdrop: wpb } });
    expect(s.map.backdrop).toBe(wpb);
    s = reducer(s, { type: 'commit', items: [], size: { width: 1100, height: 800 }, backdrop: shiftBackdrop(wpb, 100, 0) });
    expect(s.map.backdrop?.x).toBe(600);
    s = reducer(s, { type: 'undo' });
    expect(s.map.backdrop).toBe(wpb);
    s = reducer(s, { type: 'undo' });
    expect(s.map.backdrop).toBeUndefined();
  });
});
