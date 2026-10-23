import { describe, expect, it } from 'vitest';
import { matchPlate, pickPlate, plateKey } from './plates';

describe('pickPlate', () => {
  it('finds the number among state names and slogans', () => {
    expect(pickPlate('FLORIDA\nABC 1234\nSUNSHINE STATE')).toBe('ABC1234');
    expect(pickPlate('California\n7-ABC-123\ndmv.ca.gov')).toBe('7ABC123');
    expect(pickPlate('NEW YORK\nKGT-4471\nEMPIRE STATE')).toBe('KGT4471');
  });

  it('keeps vanity plates of letters only when nothing better is there', () => {
    expect(pickPlate('FLORIDA\nVALET\n')).toBe('VALET');
  });

  it('gives nothing for noise', () => {
    expect(pickPlate('')).toBe('');
    expect(pickPlate('- . ,')).toBe('');
    expect(pickPlate('FLORIDA')).toBe('');
  });
});

describe('matchPlate', () => {
  const cars = [
    { id: 'a', plate: 'ABC1234' },
    { id: 'b', plate: 'XYZ 987' },
    { id: 'c', plate: '' },
  ];

  it('matches regardless of spacing and lookalike letters', () => {
    expect(matchPlate(cars, 'abc-1234')?.id).toBe('a');
    expect(matchPlate(cars, 'A8C1234')?.id).toBe('a');
    expect(plateKey('BOS')).toBe(plateKey('805'));
  });

  it('allows one misread character on a longer plate', () => {
    expect(matchPlate(cars, 'ABC1284')?.id).toBe('a');
    expect(matchPlate(cars, 'XYZ98')?.id).toBe('b');
  });

  it('does not guess', () => {
    expect(matchPlate(cars, 'QQQ9999')).toBeUndefined();
    expect(matchPlate(cars, '')).toBeUndefined();
    expect(matchPlate([{ plate: 'ABC1234' }, { plate: 'ABC1235' }], 'ABC1236')).toBeUndefined();
  });
});
