import type { ParkedCar } from './types';

/** keys off the board this long without the car being on its way out get flagged */
export const KEYS_LATE_MS = 15 * 60 * 1000;

/** the hook or box a car's keys go back to: its own slot, or the tag number */
export const keyHook = (c: Pick<ParkedCar, 'keySlot' | 'ticket'>) => (c.keySlot ?? '').trim() || c.ticket.trim();

export const keysOut = (c: Pick<ParkedCar, 'keysWith'>) => !!c.keysWith;

/** cars whose keys are off the board, longest out first */
export function carsWithKeysOut<C extends ParkedCar>(cars: C[]): C[] {
  return cars.filter(keysOut).sort((a, b) => (a.keysOutAt ?? 0) - (b.keysOutAt ?? 0));
}

/** two parked cars hanging on the same hook is how keys get handed to the wrong guest */
export function hookTaken<C extends ParkedCar>(cars: C[], hook: string, exceptId?: string): C | undefined {
  const h = hook.trim().toUpperCase();
  if (!h) return undefined;
  return cars.find((c) => c.id !== exceptId && keyHook(c).toUpperCase() === h);
}
