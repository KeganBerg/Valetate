import type { ParkedCar, VehicleProfile } from './types';
import { isoDay, monthlyExpired } from './guests';

/** What the stand charges. One set of rates for the whole company. */
export interface Rates {
  /** off: valets don't take payment in the app */
  mode: 'off' | 'flat' | 'hourly';
  /** flat: per visit, and again for each extra day */
  flatCents: number;
  /** hourly: per started hour */
  hourlyCents: number;
  /** hourly: most it can cost in one day (0 = no cap) */
  maxCents: number;
  /** a quick in-and-out under this many minutes is free */
  graceMin: number;
}
export const NO_RATES: Rates = { mode: 'off', flatCents: 0, hourlyCents: 0, maxCents: 0, graceMin: 0 };

export type PayMethod = 'card' | 'cash' | 'room' | 'validated' | 'comp' | 'monthly';
export const PAY_METHODS: { method: PayMethod; label: string; icon: string }[] = [
  { method: 'card', label: 'Card', icon: '💳' },
  { method: 'cash', label: 'Cash', icon: '💵' },
  { method: 'room', label: 'Room charge', icon: '🏨' },
  { method: 'validated', label: 'Validation', icon: '🎟️' },
  { method: 'comp', label: 'Comp', icon: '🎁' },
  { method: 'monthly', label: 'Monthly', icon: '📅' },
];
export const methodInfo = (m: PayMethod) => PAY_METHODS.find((x) => x.method === m) ?? PAY_METHODS[0];

/** A code a merchant or the venue hands out: "SPA" parks free, "DINNER" takes $10 off, "MOVIE" gives 3 hours free. */
export interface Validation {
  id: string;
  code: string;
  label: string;
  kind: 'free' | 'off' | 'hours';
  /** cents off, or hours free; unused for free */
  value: number;
  active: boolean;
}

/** One car's parking paid (or comped). A car has at most one that isn't voided. */
export interface Payment {
  id: string;
  carId: string;
  ticket: string;
  /** what was collected */
  amountCents: number;
  /** what the rates said before any validation or comp */
  feeCents: number;
  method: PayMethod;
  /** validation code, or room number for a room charge */
  code: string;
  /** comp reason or anything else worth knowing */
  note: string;
  takenBy: string;
  takenByName: string;
  createdAt: number;
  voided: boolean;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The fee for a stay of `ms`, in cents; null when the stand doesn't charge. */
export function feeFor(rates: Rates, ms: number): number | null {
  if (rates.mode === 'off') return null;
  ms = Math.max(0, ms);
  if (rates.graceMin > 0 && ms < rates.graceMin * 60 * 1000) return 0;
  if (rates.mode === 'flat') return rates.flatCents * Math.max(1, Math.ceil(ms / DAY));
  // hourly: each full day costs the daily max, then the started hours of the last day
  const cap = rates.maxCents > 0 ? rates.maxCents : Infinity;
  const days = Math.floor(ms / DAY);
  const rest = ms - days * DAY;
  const restHours = Math.max(days ? 0 : 1, Math.ceil(rest / HOUR));
  const full = days * (cap === Infinity ? 24 * rates.hourlyCents : cap);
  return full + Math.min(cap, restHours * rates.hourlyCents);
}

/** what's due with a validation applied */
export function validatedFee(rates: Rates, ms: number, v: Validation): number {
  const fee = feeFor(rates, ms) ?? 0;
  if (v.kind === 'free') return 0;
  if (v.kind === 'off') return Math.max(0, fee - v.value);
  // hours free: the clock starts once they're used up
  if (ms <= v.value * HOUR) return 0;
  return feeFor({ ...rates, graceMin: 0 }, ms - v.value * HOUR) ?? 0;
}

export const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const findValidation = (list: Validation[], code: string) => {
  const k = normCode(code);
  return k ? list.find((v) => v.active && normCode(v.code) === k) ?? null : null;
};

export function validationText(v: Pick<Validation, 'kind' | 'value'>): string {
  if (v.kind === 'free') return 'Parks free';
  if (v.kind === 'off') return `${dollars(v.value)} off`;
  return `${v.value} ${v.value === 1 ? 'hour' : 'hours'} free`;
}

/** "Hourly $8 · $30 daily max · first 10 min free" */
export function ratesText(r: Rates): string {
  if (r.mode === 'off') return 'No charge';
  const parts = r.mode === 'flat' ? [`${dollars(r.flatCents)} flat`] : [`${dollars(r.hourlyCents)} an hour`, r.maxCents > 0 && `${dollars(r.maxCents)} daily max`];
  if (r.graceMin > 0) parts.push(`first ${r.graceMin} min free`);
  return parts.filter(Boolean).join(' · ');
}

/** "$24", "$7.50" */
export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** A monthly whose pass is current parks at no charge. */
export const coveredByMonthly = (profile: VehicleProfile | null | undefined, now: number) =>
  !!profile && profile.type === 'monthly' && !!profile.paidUntil && !monthlyExpired(profile, isoDay(now));

/** the live payment for a car, if any */
export const paymentFor = (payments: Payment[], car: Pick<ParkedCar, 'id'>) => payments.find((p) => p.carId === car.id && !p.voided) ?? null;

export interface PaymentSummary {
  collectedCents: number;
  /** what the rates said, before validations and comps */
  feesCents: number;
  byMethod: { method: PayMethod; count: number; cents: number }[];
  validated: number;
  comped: number;
}

export function summarize(payments: Payment[], from: number, to: number): PaymentSummary {
  const live = payments.filter((p) => !p.voided && p.createdAt >= from && p.createdAt < to);
  const byMethod = PAY_METHODS.map(({ method }) => {
    const ps = live.filter((p) => p.method === method);
    return { method, count: ps.length, cents: ps.reduce((s, p) => s + p.amountCents, 0) };
  }).filter((m) => m.count > 0);
  return {
    collectedCents: live.filter((p) => p.method !== 'room').reduce((s, p) => s + p.amountCents, 0),
    feesCents: live.reduce((s, p) => s + p.feeCents, 0),
    byMethod,
    validated: live.filter((p) => p.method === 'validated').length,
    comped: live.filter((p) => p.method === 'comp').length,
  };
}

// ---------- single-device storage ----------

const RATES_KEY = 'valetate.rates.v1';
const VALIDATIONS_KEY = 'valetate.validations.v1';
const PAYMENTS_KEY = 'valetate.payments.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore: storage full or blocked
  }
}
export const loadRates = (): Rates => ({ ...NO_RATES, ...load<Partial<Rates>>(RATES_KEY, {}) });
export const saveRates = (r: Rates) => save(RATES_KEY, r);
export const loadValidations = (): Validation[] => load<Validation[]>(VALIDATIONS_KEY, []);
export const saveValidations = (list: Validation[]) => save(VALIDATIONS_KEY, list);
export const loadPayments = (): Payment[] => load<Payment[]>(PAYMENTS_KEY, []);
export const savePayments = (list: Payment[]) => save(PAYMENTS_KEY, list.slice(-5000));
