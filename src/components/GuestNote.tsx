import { useEffect, useState } from 'react';
import { badgeText, emptyProfile, GUEST_TYPES, guestType, isoDay, lookupKey, monthlyExpired, visitsText } from '../guests';
import { useDialog } from '../dialog';
import type { PlateHistory, VehicleProfile } from '../types';

type Lookup = (plate: string) => Promise<PlateHistory | null>;

// a short memory so flipping between cars doesn't refetch; saving a profile clears it
const cache = new Map<string, { at: number; value: PlateHistory | null }>();
let version = 0;
const listeners = new Set<() => void>();
export function forgetPlate(plate: string) {
  cache.delete(lookupKey(plate));
  version++;
  listeners.forEach((f) => f());
}

/** what the stand knows about `plate`, looked up a moment after typing stops */
export function usePlateHistory(lookup: Lookup, plate: string): PlateHistory | null {
  const key = lookupKey(plate);
  const [state, setState] = useState<{ key: string; value: PlateHistory | null }>({ key: '', value: null });
  const [v, setV] = useState(version);
  useEffect(() => {
    const f = () => setV(version);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) {
      setState({ key, value: hit.value });
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      lookup(plate)
        .then((value) => {
          cache.set(key, { at: Date.now(), value });
          if (live) setState({ key, value });
        })
        .catch(() => {
          // offline: no note is better than a wrong one
        });
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lookup, v]);
  return key && state.key === key ? state.value : null;
}

/** "Welcome back" for a known plate: who they are, how often they come, and anything to watch for. */
export function GuestNote({ history, onFill, onEdit }: { history: PlateHistory | null; onFill?: () => void; onEdit?: () => void }) {
  if (!history) return null;
  const p = history.profile;
  const today = isoDay(Date.now());
  // the type itself is on the badge; the line carries the rest (unit, paid through)
  const badge = p ? badgeText(p, today).split(' · ').slice(1).join(' · ') : '';
  const visits = visitsText(history);
  const expired = monthlyExpired(p, today);
  const fillable = !!onFill && !!p && !!(p.ownerName || p.ownerPhone || p.color || p.make || p.vehicle);
  if (!badge && !visits && !p?.prefs && !history.damageVisits && !history.incidents && !fillable) return null;
  return (
    <div className={`guest-note ${p?.type ? `type-${p.type}` : ''}`} role="status">
      <div className="guest-note-head">
        {p?.type ? <span className={`guest-badge ${expired ? 'expired' : ''}`}>{guestType(p.type).label}</span> : <span aria-hidden>👋</span>}
        <b>{p?.ownerName || (visits ? 'Welcome back' : 'Known plate')}</b>
        {onEdit && (
          <button type="button" className="link" onClick={onEdit}>
            {p?.type || p?.prefs ? 'Edit' : 'Add to profile'}
          </button>
        )}
      </div>
      {(badge || visits) && <p className={expired ? 'warn-text' : ''}>{[badge, visits].filter(Boolean).join(' · ')}</p>}
      {p?.prefs && <p className="guest-prefs">“{p.prefs}”</p>}
      {(history.damageVisits > 0 || history.incidents > 0) && (
        <p className="warn-text">
          ⚠️{' '}
          {[
            history.damageVisits ? `Damage photographed on ${history.damageVisits} past ${history.damageVisits === 1 ? 'visit' : 'visits'}` : '',
            history.incidents ? `${history.incidents} past ${history.incidents === 1 ? 'incident' : 'incidents'}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          {history.lastIncident && <span className="muted"> (last: {history.lastIncident.replace(/^(\w+):/, (_, k) => `${k.replace('_', ' ')}:`)})</span>}
        </p>
      )}
      {fillable && (
        <button type="button" className="fill-btn" onClick={onFill}>
          Use {[p!.color, p!.make, p!.vehicle].filter(Boolean).join(' ') || 'saved details'}
          {p!.ownerName ? ` · ${p!.ownerName}` : ''}
        </button>
      )}
    </div>
  );
}

/** Mark a plate as a monthly, hotel guest or VIP, and note how they like it. */
export function ProfileDialog({
  plate,
  profile,
  onSave,
  onClose,
}: {
  plate: string;
  profile: VehicleProfile | null;
  onSave: (p: VehicleProfile) => void;
  onClose: () => void;
}) {
  const dialog = useDialog<HTMLFormElement>(onClose);
  const [p, setP] = useState<VehicleProfile>(profile ?? emptyProfile(plate));
  const set = (patch: Partial<VehicleProfile>) => setP((x) => ({ ...x, ...patch }));
  const t = guestType(p.type);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog profile-dialog"
        {...dialog}
        aria-label="Guest profile"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...p, plate: p.plate || plate });
        }}
      >
        <header>
          <h2>Guest profile</h2>
          <span className="plate-sm">{plate}</span>
          <div className="grow" />
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="hint">Saved with this plate, so it comes up the next time it's checked in or scanned.</p>
        <div className="seg profile-type" role="radiogroup" aria-label="Kind of guest">
          {GUEST_TYPES.map((g) => (
            <button type="button" key={g.type} role="radio" aria-checked={p.type === g.type} className={p.type === g.type ? 'on' : ''} onClick={() => set({ type: g.type })}>
              {g.label}
            </button>
          ))}
        </div>
        {(t.unitLabel || p.type === 'monthly') && (
          <div className="row2">
            {t.unitLabel && (
              <label className="field">
                <span>{t.unitLabel}</span>
                <input value={p.unit} onChange={(e) => set({ unit: e.target.value })} maxLength={40} />
              </label>
            )}
            {p.type === 'monthly' && (
              <label className="field">
                <span>Paid through</span>
                <input type="date" value={p.paidUntil} onChange={(e) => set({ paidUntil: e.target.value })} />
              </label>
            )}
          </div>
        )}
        <div className="row2">
          <label className="field">
            <span>Name</span>
            <input value={p.ownerName} onChange={(e) => set({ ownerName: e.target.value })} maxLength={200} autoComplete="off" />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={p.ownerPhone} onChange={(e) => set({ ownerPhone: e.target.value })} inputMode="tel" maxLength={40} autoComplete="off" />
          </label>
        </div>
        <label className="field">
          <span>How they like it</span>
          <textarea
            value={p.prefs}
            onChange={(e) => set({ prefs: e.target.value })}
            rows={3}
            maxLength={1000}
            placeholder="Seat stays back. Keep it near the front. Tips well."
          />
        </label>
        <div className="actions">
          <button className="primary" type="submit">
            Save profile
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
