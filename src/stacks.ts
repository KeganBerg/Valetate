import type { ParkedCar, Spot } from './types';

/**
 * Cars that have to move before `carId` can get out, outermost first: if A
 * blocks B and B blocks the car, the answer is [A, B].
 */
export function blockersOf<C extends Pick<ParkedCar, 'id' | 'blocks'>>(cars: C[], carId: string): C[] {
  const levels = new Map<string, number>();
  let frontier = [carId];
  for (let depth = 1; frontier.length && depth <= cars.length; depth++) {
    const next: string[] = [];
    for (const c of cars) {
      if (levels.has(c.id) || c.id === carId) continue;
      if (c.blocks?.some((b) => frontier.includes(b))) {
        levels.set(c.id, depth);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return cars.filter((c) => levels.has(c.id)).sort((a, b) => levels.get(b.id)! - levels.get(a.id)!);
}

/** the parked cars a car blocks, ignoring ones that have left */
export function blockedBy<C extends Pick<ParkedCar, 'id'>>(cars: C[], car: Pick<ParkedCar, 'blocks'>): C[] {
  const ids = new Set(car.blocks ?? []);
  return cars.filter((c) => ids.has(c.id));
}

/**
 * Parked cars close enough to `spot` that a car parked there could block them
 * (a tandem space, the next car up a ramp), nearest first.
 */
export function carsNear<C extends Pick<ParkedCar, 'id' | 'spotKey'>>(spots: Spot[], cars: C[], spot: Spot, limit = 4): C[] {
  const bySpot = new Map(spots.map((s) => [s.key, s]));
  const reach = Math.max(spot.w, spot.h) * 1.6;
  return cars
    .map((c) => {
      const s = bySpot.get(c.spotKey);
      return { c, d: s && s.key !== spot.key ? Math.hypot(s.cx - spot.cx, s.cy - spot.cy) : Infinity };
    })
    .filter((x) => x.d <= reach)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.c);
}

/** after `movedId` changes spot, nothing it blocked or was blocked by still holds */
export function blocksAfterMove<C extends Pick<ParkedCar, 'id' | 'blocks'>>(cars: C[], movedId: string): { id: string; blocks: string[] }[] {
  const changes: { id: string; blocks: string[] }[] = [];
  for (const c of cars) {
    if (c.id === movedId) {
      if (c.blocks?.length) changes.push({ id: c.id, blocks: [] });
    } else if (c.blocks?.includes(movedId)) changes.push({ id: c.id, blocks: c.blocks.filter((b) => b !== movedId) });
  }
  return changes;
}
