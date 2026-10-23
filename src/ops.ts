import type { ParkedCar } from './types';

const CARS_KEY = 'valetate.cars.v1';

export function loadCars(): ParkedCar[] {
  try {
    const raw = localStorage.getItem(CARS_KEY);
    const cars = raw ? JSON.parse(raw) : [];
    return Array.isArray(cars) ? cars : [];
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
