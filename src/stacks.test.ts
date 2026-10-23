import { describe, expect, it } from 'vitest';
import { blockersOf, blocksAfterMove, carsNear } from './stacks';
import type { Spot } from './types';

const spot = (key: string, cx: number, cy: number): Spot => ({ key, label: key, itemId: 'r', index: 0, cx, cy, w: 30, h: 60, rotation: 0 });

describe('stacks', () => {
  it('lists blockers outermost first, through chains', () => {
    const cars = [
      { id: 'x' },
      { id: 'b', blocks: ['x'] },
      { id: 'a', blocks: ['b'] },
      { id: 'other', blocks: ['nobody'] },
    ];
    expect(blockersOf(cars, 'x').map((c) => c.id)).toEqual(['a', 'b']);
    expect(blockersOf(cars, 'a')).toEqual([]);
  });

  it('survives a loop someone marked by mistake', () => {
    const cars = [
      { id: 'a', blocks: ['b'] },
      { id: 'b', blocks: ['a'] },
    ];
    expect(blockersOf(cars, 'a').map((c) => c.id)).toEqual(['b']);
  });

  it('finds cars in the neighbouring spaces only', () => {
    const spots = [spot('1', 0, 0), spot('2', 0, 62), spot('3', 32, 0), spot('far', 400, 0)];
    const cars = [
      { id: 'in2', spotKey: '2' },
      { id: 'in3', spotKey: '3' },
      { id: 'far', spotKey: 'far' },
    ];
    expect(carsNear(spots, cars, spots[0]).map((c) => c.id)).toEqual(['in3', 'in2']);
  });

  it('clears both sides of a stack when a car moves', () => {
    const cars = [{ id: 'a', blocks: ['b'] }, { id: 'b', blocks: ['c'] }, { id: 'c' }];
    expect(blocksAfterMove(cars, 'b')).toEqual([
      { id: 'a', blocks: [] },
      { id: 'b', blocks: [] },
    ]);
  });
});
