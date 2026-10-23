import { describe, expect, it } from 'vitest';
import { feeFor, findValidation, ratesText, summarize, validatedFee, NO_RATES, type Payment, type Rates, type Validation } from './payments';

const M = 60 * 1000;
const H = 60 * M;
const hourly: Rates = { ...NO_RATES, mode: 'hourly', hourlyCents: 800, maxCents: 3000, graceMin: 10 };
const flat: Rates = { ...NO_RATES, mode: 'flat', flatCents: 2000 };
const v = (kind: Validation['kind'], value: number, code = 'SPA'): Validation => ({ id: code, code, label: '', kind, value, active: true });

describe('parking fees', () => {
  it('charges nothing when the stand has no rates', () => {
    expect(feeFor(NO_RATES, 5 * H)).toBeNull();
  });
  it('charges by the started hour up to the daily max, after a grace period', () => {
    expect(feeFor(hourly, 5 * M)).toBe(0);
    expect(feeFor(hourly, 15 * M)).toBe(800);
    expect(feeFor(hourly, 2 * H + M)).toBe(2400);
    expect(feeFor(hourly, 6 * H)).toBe(3000);
    // overnight: a full day at the max, then hours again
    expect(feeFor(hourly, 25 * H)).toBe(3800);
  });
  it('charges a flat fee per day', () => {
    expect(feeFor(flat, 3 * H)).toBe(2000);
    expect(feeFor(flat, 30 * H)).toBe(4000);
  });
  it('applies validations', () => {
    expect(validatedFee(hourly, 3 * H, v('free', 0))).toBe(0);
    expect(validatedFee(hourly, 3 * H, v('off', 1000))).toBe(1400);
    expect(validatedFee(hourly, 3 * H, v('off', 5000))).toBe(0);
    expect(validatedFee(hourly, 2 * H, v('hours', 3))).toBe(0);
    expect(validatedFee(hourly, 4 * H + 5 * M, v('hours', 3))).toBe(1600);
    expect(findValidation([v('free', 0, 'Spa-2'), { ...v('free', 0, 'OLD'), active: false }], ' spa 2 ')?.code).toBe('Spa-2');
    expect(findValidation([{ ...v('free', 0, 'OLD'), active: false }], 'old')).toBeNull();
  });
  it('describes the rates', () => {
    expect(ratesText(hourly)).toBe('$8 an hour · $30 daily max · first 10 min free');
    expect(ratesText({ ...flat, flatCents: 1250 })).toBe('$12.50 flat');
  });
  it('adds up what was collected, leaving out room charges and voids', () => {
    const p = (method: Payment['method'], amountCents: number, voided = false): Payment => ({
      id: method + amountCents,
      carId: 'c',
      ticket: '',
      amountCents,
      feeCents: 2400,
      method,
      code: '',
      note: '',
      takenBy: '',
      takenByName: '',
      createdAt: 5,
      voided,
    });
    const s = summarize([p('card', 2400), p('cash', 2000), p('room', 2400), p('comp', 0), p('card', 999, true)], 0, 10);
    expect(s.collectedCents).toBe(4400);
    expect(s.comped).toBe(1);
    expect(s.byMethod.map((m) => m.method)).toEqual(['card', 'cash', 'room', 'comp']);
  });
});
