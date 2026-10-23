import { plateKey } from './plates';
import type { GuestType, PlateHistory, VehicleProfile } from './types';

const KEY = 'valetate.vehicles.v1';

export const GUEST_TYPES: { type: GuestType; label: string; unitLabel: string }[] = [
  { type: '', label: 'Guest', unitLabel: '' },
  { type: 'monthly', label: 'Monthly', unitLabel: 'Unit' },
  { type: 'hotel', label: 'Hotel guest', unitLabel: 'Room' },
  { type: 'vip', label: 'VIP', unitLabel: '' },
];
export const guestType = (t: GuestType) => GUEST_TYPES.find((x) => x.type === t) ?? GUEST_TYPES[0];

export const emptyProfile = (plate: string): VehicleProfile => ({
  plate,
  ownerName: '',
  ownerPhone: '',
  color: '',
  make: '',
  vehicle: '',
  type: '',
  unit: '',
  paidUntil: '',
  prefs: '',
});

/** a plate worth looking up: long enough not to match half the lot */
export const lookupKey = (plate: string) => {
  const k = plateKey(plate);
  return k.length >= 4 ? k : '';
};

/** "Monthly · Unit 4B · paid through Nov 30" */
export function badgeText(p: VehicleProfile, today: string): string {
  const t = guestType(p.type);
  if (!p.type) return '';
  const parts = [t.label];
  if (p.unit && t.unitLabel) parts.push(`${t.unitLabel} ${p.unit}`);
  if (p.type === 'monthly' && p.paidUntil) parts.push(`${p.paidUntil < today ? 'expired' : 'paid through'} ${shortDate(p.paidUntil)}`);
  return parts.join(' · ');
}

export const monthlyExpired = (p: VehicleProfile | null, today: string) => !!p && p.type === 'monthly' && !!p.paidUntil && p.paidUntil < today;

export const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** "Visit 7 · last here Oct 12" or "" for someone new */
export function visitsText(h: PlateHistory): string {
  if (!h.pastVisits) return '';
  const last = h.lastVisit ? ` · last here ${new Date(h.lastVisit).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : '';
  return `Visit ${h.pastVisits + 1}${last}`;
}

/** the details a known plate can fill in, only where the valet hasn't typed anything */
export function fillFrom<T extends Partial<Record<'ownerName' | 'ownerPhone' | 'color' | 'make' | 'vehicle', string>>>(form: T, p: VehicleProfile): Partial<T> {
  const out: Partial<T> = {};
  for (const k of ['ownerName', 'ownerPhone', 'color', 'make', 'vehicle'] as const) {
    if (!form[k]?.trim() && p[k]) (out as Record<string, string>)[k] = p[k];
  }
  return out;
}

// ---------- single-device storage ----------

export function loadVehicles(): Record<string, VehicleProfile> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
export function saveVehicle(p: VehicleProfile) {
  const k = plateKey(p.plate);
  if (k.length < 2) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadVehicles(), [k]: p }));
  } catch {
    // ignore: storage full or blocked
  }
}
/** what a check-in teaches the profile; a blank field never wipes a known one */
export function learnVehicle(car: Pick<VehicleProfile, 'plate' | 'ownerName' | 'ownerPhone' | 'color' | 'make' | 'vehicle'>) {
  const k = plateKey(car.plate);
  if (k.length < 2) return;
  const old = loadVehicles()[k] ?? emptyProfile(car.plate);
  const merged = { ...old, plate: car.plate.toUpperCase() };
  for (const f of ['ownerName', 'ownerPhone', 'color', 'make', 'vehicle'] as const) if (car[f]?.trim()) merged[f] = car[f];
  saveVehicle(merged);
}
