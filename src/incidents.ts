import type { Incident, IncidentKind, ParkedCar } from './types';

const KEY = 'valetate.incidents.v1';

export const INCIDENT_KINDS: { kind: IncidentKind; label: string; icon: string; hint: string }[] = [
  { kind: 'damage', label: 'Damage claim', icon: '🚗', hint: 'A guest says their car was damaged' },
  { kind: 'accident', label: 'Accident', icon: '💥', hint: 'A car was hit or hit something' },
  { kind: 'complaint', label: 'Complaint', icon: '💬', hint: 'A guest was unhappy with the service' },
  { kind: 'lost_found', label: 'Lost and found', icon: '🧳', hint: 'Something left in a car or at the stand' },
  { kind: 'other', label: 'Other', icon: '📝', hint: 'Anything else the manager should know' },
];
export const kindInfo = (k: IncidentKind) => INCIDENT_KINDS.find((x) => x.kind === k) ?? INCIDENT_KINDS[4];

/** how the car is named on the report, so it still reads right after the car leaves */
export const carLabel = (c: ParkedCar) =>
  [c.ticket ? `#${c.ticket}` : '', [c.color, c.make, c.vehicle].filter(Boolean).join(' '), c.plate, c.spotLabel && `Spot ${c.spotLabel}`].filter(Boolean).join(' · ');

/** open first (oldest first, since they've waited longest), then resolved, newest first */
export function sortIncidents(list: Incident[]): Incident[] {
  const open = list.filter((i) => i.status === 'open').sort((a, b) => a.createdAt - b.createdAt);
  const done = list.filter((i) => i.status !== 'open').sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
  return [...open, ...done];
}

/** the ones worth showing: everything open, and anything resolved in the last 30 days */
export const recentIncidents = (list: Incident[], now: number) =>
  list.filter((i) => i.status === 'open' || (i.resolvedAt ?? i.createdAt) > now - 30 * 24 * 60 * 60 * 1000);

// ---------- single-device storage ----------

export function loadIncidents(): Incident[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export function saveIncidents(list: Incident[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-1000)));
  } catch {
    // ignore: storage full or blocked
  }
}
