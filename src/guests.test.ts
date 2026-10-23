import { describe, expect, it } from 'vitest';
import { badgeText, emptyProfile, fillFrom, lookupKey, monthlyExpired, visitsText } from './guests';

describe('repeat guests', () => {
  it('looks up only plates long enough to mean one car, lookalikes folded', () => {
    expect(lookupKey('AB1')).toBe('');
    expect(lookupKey('tst-8o5')).toBe(lookupKey('TSTB05'));
  });

  it('describes monthlies, hotel guests and VIPs', () => {
    const m = { ...emptyProfile('ABC123'), type: 'monthly' as const, unit: '4B', paidUntil: '2026-11-30' };
    expect(badgeText(m, '2026-10-23')).toMatch(/^Monthly · Unit 4B · paid through Nov 30$/);
    expect(badgeText(m, '2026-12-01')).toMatch(/expired/);
    expect(monthlyExpired(m, '2026-12-01')).toBe(true);
    expect(badgeText({ ...emptyProfile('X'), type: 'hotel', unit: '1204' }, '2026-10-23')).toBe('Hotel guest · Room 1204');
    expect(badgeText(emptyProfile('X'), '2026-10-23')).toBe('');
  });

  it('counts this visit after the past ones', () => {
    const h = { profile: null, pastVisits: 6, lastVisit: new Date(2026, 9, 12).getTime(), damageVisits: 0, incidents: 0, lastIncident: '' };
    expect(visitsText(h)).toBe('Visit 7 · last here Oct 12');
    expect(visitsText({ ...h, pastVisits: 0 })).toBe('');
  });

  it('fills in only what the valet left blank', () => {
    const p = { ...emptyProfile('ABC123'), ownerName: 'Dana', color: 'Black', make: 'BMW' };
    expect(fillFrom({ ownerName: '', color: 'White', make: '' }, p)).toEqual({ ownerName: 'Dana', make: 'BMW' });
  });
});
