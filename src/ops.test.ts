import { describe, expect, it } from 'vitest';
import { carMatches, colorHex, nextOpenSpot, nextTag } from './ops';

const car = (ticket: string, extra = {}) => ({ ticket, plate: '', ownerName: '', make: '', color: '', ...extra });

describe('fast check-in helpers', () => {
  it('suggests the tag after the highest one handed out', () => {
    expect(nextTag([])).toBe('1');
    expect(nextTag([car('101'), car('099'), car('A7')])).toBe('102');
    // remembers tags of cars already retrieved
    expect(nextTag([car('5')], '240')).toBe('241');
  });

  it('suggests the closest open spot to the one just used', () => {
    const spots = [
      { key: 'a', cx: 0, cy: 0 },
      { key: 'b', cx: 0, cy: 30 },
      { key: 'c', cx: 60, cy: 0 },
      { key: 'd', cx: 0, cy: 60 },
    ];
    expect(nextOpenSpot(spots, new Set(['a']), 'a')?.key).toBe('b');
    expect(nextOpenSpot(spots, new Set(['a', 'b']), 'b')?.key).toBe('d');
  });

  it('falls back to map order without positions, wrapping around', () => {
    const spots = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    expect(nextOpenSpot(spots, new Set(['b']), 'a')?.key).toBe('c');
    expect(nextOpenSpot(spots, new Set(['a']), 'c')?.key).toBe('b');
    expect(nextOpenSpot(spots, new Set(['a', 'b', 'c']), 'a')).toBeUndefined();
  });

  it('matches cars by tag, plate, owner or color and make', () => {
    const c = car('104', { plate: 'ABC 123', ownerName: 'Jane Doe', make: 'Tesla', color: 'White' });
    expect(carMatches(c, '104')).toBe(true);
    expect(carMatches(c, 'abc1')).toBe(true);
    expect(carMatches(c, 'jane')).toBe(true);
    expect(carMatches(c, 'white tesla')).toBe(true);
    expect(carMatches(c, '105')).toBe(false);
  });

  it('knows car color swatches', () => {
    expect(colorHex('black')).toBe('#1d1f22');
    expect(colorHex('')).toBeUndefined();
    expect(colorHex(undefined)).toBeUndefined();
  });
});
