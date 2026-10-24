import { describe, expect, it } from 'vitest';
import { findSpot, itemBounds, listSpots, rowNumbers, spotAt, toLocal, toWorld } from './geometry';
import { reducer, initState } from './store';
import { TEMPLATES } from './templates';
import type { LotMap, MapItem } from './types';

const row = (extra: Partial<MapItem> = {}): MapItem => ({
  id: 'r',
  kind: 'spaceRow',
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  rotation: 0,
  prefix: 'D',
  start: 1,
  count: 10,
  ...extra,
});

describe('row numbering', () => {
  it('counts up from the left', () => {
    expect(rowNumbers({ start: 5, count: 3 })).toEqual([5, 6, 7]);
  });
  it('counts from the other end when reversed', () => {
    expect(rowNumbers({ start: 1, count: 4, reverse: true })).toEqual([4, 3, 2, 1]);
  });
});

describe('spots', () => {
  it('labels row spots with the row letter and keeps keys tied to numbers', () => {
    const spots = listSpots([row()]);
    expect(spots.map((s) => s.label).slice(0, 3)).toEqual(['D 1', 'D 2', 'D 3']);
    expect(spots[2].key).toBe('r#3');
    expect(listSpots([row({ reverse: true })]).find((s) => s.label === 'D 3')!.key).toBe('r#3');
  });

  it('finds spots the way a valet types them', () => {
    const items = [row()];
    expect(findSpot(items, 'd12')).toBeUndefined();
    expect(findSpot(items, 'd7')?.label).toBe('D 7');
    expect(findSpot(items, ' D-7 ')?.label).toBe('D 7');
  });

  it('hit-tests rotated rows', () => {
    const r = row({ rotation: 90 });
    // rotated 90° clockwise, the first spot is at the top
    const top = toWorld(r, -45, 0);
    expect(spotAt([r], top.x, top.y)?.label).toBe('D 1');
    const bottom = toWorld(r, 45, 0);
    expect(spotAt([r], bottom.x, bottom.y)?.label).toBe('D 10');
    expect(spotAt([r], -500, -500)).toBeUndefined();
  });

  it('round-trips local and world coordinates', () => {
    const r = row({ rotation: 37, x: 20, y: 30 });
    const w = toWorld(r, 12, -7);
    const l = toLocal(r, w.x, w.y);
    expect(l.x).toBeCloseTo(12);
    expect(l.y).toBeCloseTo(-7);
  });
});

type Box = { x: number; y: number; w: number; h: number };

describe('templates', () => {
  const build = (key: string) => TEMPLATES.find((t) => t.key === key)!.build();

  it('garage level has spaces 1 to 120', () => {
    const labels = listSpots(build('garage').items).map((s) => Number(s.label));
    expect(labels.sort((a, b) => a - b)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });

  it.each(['surface', 'garage'])('%s: nothing sits on a parking space, and spaces never overlap', (key) => {
    const map = build(key);
    const spots = listSpots(map.items).map((s) => ({ label: s.label, x: s.cx - s.w / 2, y: s.cy - s.h / 2, w: s.w, h: s.h }));
    const others = map.items
      .filter((it) => it.kind !== 'space' && it.kind !== 'spaceRow')
      .map((it) => ({ kind: it.kind, ...itemBounds(it) }));
    const hit = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
    const clashes = [
      ...spots.flatMap((s) => others.filter((o) => hit(s, o)).map((o) => `${o.kind} on space ${s.label}`)),
      ...spots.flatMap((a, i) => spots.slice(i + 1).filter((b) => hit(a, b)).map((b) => `space ${a.label} on ${b.label}`)),
    ];
    expect(clashes).toEqual([]);
    for (const b of [...spots, ...others]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(map.width);
      expect(b.y + b.h).toBeLessThanOrEqual(map.height);
    }
  });

  it('Marriott matches the posted map, including ramp spots R1–R4', () => {
    const spots = listSpots(build('marriott-wpb').items);
    const nums = spots.map((s) => s.label).filter((l) => /^\d+$/.test(l)).map(Number);
    expect(new Set(nums).size).toBe(nums.length);
    expect(Math.max(...nums)).toBe(72);
    expect(findSpot(build('marriott-wpb').items, 'R3')).toBeDefined();
    expect(findSpot(build('marriott-wpb').items, '1')!.cx).toBeGreaterThan(findSpot(build('marriott-wpb').items, '17')!.cx);
  });

  it('Broward back lot has rows A–J with unique spot labels', () => {
    const spots = listSpots(build('broward-back').items);
    const labels = spots.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of ['A 20', 'C 25', 'D 25', 'E 30', 'G 25', 'H 25', 'I 30', 'J 20']) expect(labels).toContain(l);
  });
});

describe('undo history', () => {
  const map: LotMap = { id: 'm', name: 'm', width: 10, height: 10, surface: '#000', items: [], updatedAt: 0 };

  it('undoes and redoes commits', () => {
    let s = initState(map);
    s = reducer(s, { type: 'commit', items: [row()] });
    s = reducer(s, { type: 'commit', items: [] });
    s = reducer(s, { type: 'undo' });
    expect(s.map.items).toHaveLength(1);
    s = reducer(s, { type: 'redo' });
    expect(s.map.items).toHaveLength(0);
  });

  it('merges rapid edits of the same field into one undo step', () => {
    let s = initState(map);
    s = reducer(s, { type: 'commit', items: [row({ prefix: 'A' })], key: 'prefix' });
    s = reducer(s, { type: 'commit', items: [row({ prefix: 'AB' })], key: 'prefix' });
    expect(s.past).toHaveLength(1);
  });
});
