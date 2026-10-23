import { describe, expect, it } from 'vitest';
import { lotAround } from './geometry';
import { initState, reducer } from './store';
import type { LotMap, MapItem } from './types';

const box = (x: number, y: number, w = 60, h = 30): MapItem => ({ id: `${x},${y}`, kind: 'space', x, y, w, h, rotation: 0 });
const lot = (items: MapItem[], width = 600, height = 400): LotMap => ({
  id: 'm',
  name: 'Lot',
  width,
  height,
  surface: '#5d6168',
  items,
  updatedAt: 0,
});

describe('lotAround', () => {
  it('leaves a lot alone when everything is on it', () => {
    expect(lotAround([box(10, 10)], 600, 400)).toBeNull();
  });

  it('grows right and down to hold an object past the edge', () => {
    const g = lotAround([box(580, 390)], 600, 400)!;
    expect(g.width).toBeGreaterThanOrEqual(640);
    expect(g.height).toBeGreaterThanOrEqual(420);
    expect(g.dx).toBe(0);
    expect(g.items[0].x).toBe(580);
  });

  it('grows up and left by moving everything so the lot still starts at 0,0', () => {
    const g = lotAround([box(-30, -12), box(100, 100)], 600, 400)!;
    expect(g.dx).toBeGreaterThan(30);
    expect(g.dy).toBeGreaterThan(12);
    expect(g.items[0].x).toBeGreaterThanOrEqual(0);
    expect(g.items[1].x).toBe(100 + g.dx);
    expect(g.width).toBe(600 + g.dx);
  });

  it('trims to the objects when asked', () => {
    const g = lotAround([box(300, 204, 60, 30)], 2000, 1500, { shrink: true, pad: 24 })!;
    expect(g.items[0].x).toBe(24);
    expect(g.items[0].y).toBe(24);
    expect(g.width).toBe(108);
    expect(g.height).toBe(100); // never smaller than the minimum
  });
});

describe('lot size history', () => {
  it('undoes a resize from the size fields as one step', () => {
    let s = initState(lot([]));
    s = reducer(s, { type: 'meta', patch: { width: 7 } });
    s = reducer(s, { type: 'meta', patch: { width: 70 } });
    s = reducer(s, { type: 'meta', patch: { width: 700 } });
    expect(s.past).toHaveLength(1);
    s = reducer(s, { type: 'undo' });
    expect(s.map.width).toBe(600);
    s = reducer(s, { type: 'redo' });
    expect(s.map.width).toBe(700);
  });

  it('undoes a grow together with the objects it moved', () => {
    let s = initState(lot([box(10, 10)]));
    const before = { items: s.map.items, width: s.map.width, height: s.map.height };
    s = reducer(s, { type: 'preview', items: [box(110, 10)], size: { width: 800, height: 400 } });
    s = reducer(s, { type: 'pushHistory', snapshot: before });
    s = reducer(s, { type: 'undo' });
    expect(s.map.width).toBe(600);
    expect(s.map.items[0].x).toBe(10);
  });

  it('does not add undo steps for renames or ground changes', () => {
    let s = initState(lot([]));
    s = reducer(s, { type: 'meta', patch: { name: 'Front' } });
    s = reducer(s, { type: 'meta', patch: { surface: '#b8bbc0' } });
    expect(s.past).toHaveLength(0);
  });
});
