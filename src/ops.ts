import type { ParkedCar } from './types';

const CARS_KEY = 'valetate.cars.v1';

export function loadCars(): ParkedCar[] {
  try {
    const raw = localStorage.getItem(CARS_KEY);
    const cars = raw ? JSON.parse(raw) : [];
    // cars saved before color/make existed get empty values
    return Array.isArray(cars) ? cars.map((c) => ({ color: '', make: '', ticket: '', plate: '', ...c })) : [];
  } catch {
    return [];
  }
}

export function saveCars(cars: ParkedCar[]) {
  try {
    localStorage.setItem(CARS_KEY, JSON.stringify(cars));
  } catch {
    // ignore: storage full or blocked
  }
}

/** "4m", "1h 05m", "2d 3h" */
export function formatElapsed(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const CAR_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1d1f22' },
  { name: 'White', hex: '#f4f4f2' },
  { name: 'Silver', hex: '#bfc4c9' },
  { name: 'Gray', hex: '#6b7078' },
  { name: 'Blue', hex: '#1e5bc6' },
  { name: 'Red', hex: '#c62828' },
  { name: 'Green', hex: '#2e7d32' },
  { name: 'Brown', hex: '#6d4c41' },
  { name: 'Beige', hex: '#d8c8a8' },
  { name: 'Gold', hex: '#c9a227' },
  { name: 'Yellow', hex: '#f2c94c' },
  { name: 'Orange', hex: '#ef6c00' },
];

export const CAR_MAKES = [
  'Toyota',
  'Honda',
  'Tesla',
  'Ford',
  'Chevy',
  'Nissan',
  'BMW',
  'Mercedes',
  'Lexus',
  'Jeep',
  'Hyundai',
  'Kia',
  'Audi',
  'Subaru',
  'VW',
  'Porsche',
];

export function colorHex(name: string | undefined): string | undefined {
  const n = (name ?? '').trim().toLowerCase();
  return n ? CAR_COLORS.find((c) => c.name.toLowerCase() === n)?.hex : undefined;
}

/**
 * The tag number to suggest next: one more than the highest numeric tag
 * seen, so valets handing out tickets in order never have to type it.
 */
export function nextTag(cars: { ticket: string }[], lastUsed?: string): string {
  const nums = [...cars.map((c) => c.ticket), lastUsed ?? '']
    .map((t) => /^\d+$/.test(t.trim()) ? parseInt(t, 10) : NaN)
    .filter(Number.isFinite);
  return nums.length ? String(Math.max(...nums) + 1) : '1';
}

/**
 * The open spot a valet would walk to next: the closest one to `from`
 * (falls back to map order when spots have no position).
 */
export function nextOpenSpot<S extends { key: string; cx?: number; cy?: number }>(
  spots: S[],
  taken: Set<string>,
  fromKey?: string,
): S | undefined {
  const open = spots.filter((s) => !taken.has(s.key) && s.key !== fromKey);
  const from = spots.find((s) => s.key === fromKey);
  if (!from || from.cx === undefined || from.cy === undefined) {
    const start = from ? spots.indexOf(from) + 1 : 0;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[(start + i) % spots.length];
      if (!taken.has(s.key) && s.key !== fromKey) return s;
    }
    return undefined;
  }
  let best: S | undefined;
  let bestD = Infinity;
  for (const s of open) {
    const d = Math.hypot((s.cx ?? 0) - from.cx, (s.cy ?? 0) - from.cy);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Match what a valet types into search against a car: tag, plate, owner or make. */
export function carMatches(c: { ticket: string; plate: string; ownerName: string; make: string; color: string }, q: string) {
  const n = normalizePlate(q);
  if (!n) return true;
  return (
    normalizePlate(c.ticket) === n ||
    normalizePlate(c.ticket).startsWith(n) ||
    normalizePlate(c.plate).includes(n) ||
    normalizePlate(c.ownerName).includes(n) ||
    normalizePlate(`${c.color}${c.make}`).includes(n)
  );
}
