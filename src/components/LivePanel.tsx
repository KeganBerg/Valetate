import { useEffect, useState } from 'react';
import { formatElapsed, normalizePlate } from '../ops';
import type { ParkedCar, Spot } from '../types';
import { normalizeSpot } from '../geometry';
import { SheetHandle } from './SheetHandle';

interface Props {
  spots: Spot[];
  cars: ParkedCar[];
  active: Spot | null;
  now: number;
  moving: ParkedCar | null;
  onPark: (spot: Spot, car: Omit<ParkedCar, 'id' | 'mapId' | 'spotKey' | 'spotLabel' | 'parkedAt'>) => void;
  onRetrieve: (car: ParkedCar) => void;
  onStartMove: (car: ParkedCar | null) => void;
  onFocus: (spot: Spot) => void;
  open: boolean;
  onClose: () => void;
}

const EMPTY = { plate: '', vehicle: '', ownerName: '', ownerPhone: '', ticket: '', notes: '' };

export function LivePanel(p: Props) {
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  useEffect(() => setForm(EMPTY), [p.active?.key]);

  const bySpot = new Map(p.cars.map((c) => [c.spotKey, c]));
  const car = p.active ? bySpot.get(p.active.key) : undefined;
  const spotByKey = new Map(p.spots.map((s) => [s.key, s]));
  const nq = normalizePlate(q);
  const list = [...p.cars]
    .sort((a, b) => a.parkedAt - b.parkedAt)
    .filter(
      (c) =>
        !nq ||
        normalizePlate(c.plate).includes(nq) ||
        normalizeSpot(c.spotLabel) === normalizeSpot(q) ||
        normalizePlate(c.ticket).includes(nq) ||
        normalizePlate(c.ownerName).includes(nq),
    );
  const field = (k: keyof typeof EMPTY, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra} />
    </label>
  );

  return (
    <aside className={`inspector live ${p.open ? 'open' : ''}`}>
      <SheetHandle onClose={p.onClose} />
      <div className="stats">
        <div>
          <b>{p.cars.length}</b> parked
        </div>
        <div>
          <b>{Math.max(0, p.spots.length - p.cars.length)}</b> open
        </div>
      </div>

      {p.moving && (
        <div className="moving">
          Moving <b>{p.moving.plate}</b>: tap an open spot on the map.
          <button onClick={() => p.onStartMove(null)}>Cancel</button>
        </div>
      )}

      {p.active && car && (
        <section className="card">
          <h2>
            Spot {p.active.label} <span className="pill red">Taken</span>
          </h2>
          <div className="plate">{car.plate}</div>
          <dl>
            <dt>Parked</dt>
            <dd>
              {formatElapsed(p.now - car.parkedAt)} ago ·{' '}
              {new Date(car.parkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </dd>
            {car.vehicle && (
              <>
                <dt>Vehicle</dt>
                <dd>{car.vehicle}</dd>
              </>
            )}
            {car.ownerName && (
              <>
                <dt>Owner</dt>
                <dd>{car.ownerName}</dd>
              </>
            )}
            {car.ownerPhone && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${car.ownerPhone}`}>{car.ownerPhone}</a>
                </dd>
              </>
            )}
            {car.ticket && (
              <>
                <dt>Ticket</dt>
                <dd>{car.ticket}</dd>
              </>
            )}
            {car.notes && (
              <>
                <dt>Notes</dt>
                <dd>{car.notes}</dd>
              </>
            )}
          </dl>
          <div className="actions">
            <button className="primary" onClick={() => p.onRetrieve(car)}>
              Car retrieved
            </button>
            <button onClick={() => p.onStartMove(car)}>Move to another spot</button>
          </div>
        </section>
      )}

      {p.active && !car && !p.moving && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.plate.trim()) return;
            p.onPark(p.active!, { ...form, plate: form.plate.trim().toUpperCase() });
          }}
        >
          <h2>
            Spot {p.active.label} <span className="pill green">Open</span>
          </h2>
          {field('plate', 'License plate *', { required: true, autoFocus: true, autoCapitalize: 'characters' })}
          {field('vehicle', 'Vehicle', { placeholder: 'Black Tesla Model 3' })}
          {field('ownerName', 'Owner name')}
          {field('ownerPhone', 'Owner phone', { type: 'tel', inputMode: 'tel' })}
          {field('ticket', 'Ticket #')}
          {field('notes', 'Notes', { placeholder: 'Keys in box 4, scratch on bumper…' })}
          <button className="primary" type="submit">
            Park here
          </button>
        </form>
      )}

      {!p.active && !p.moving && <p className="hint">Tap a spot on the map to park a car there or see who's in it.</p>}

      <h3>Parked cars</h3>
      <input className="search" placeholder="Search plate, spot, ticket, owner" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="car-list">
        {list.map((c) => {
          const spot = spotByKey.get(c.spotKey);
          return (
            <li key={c.id}>
              <button onClick={() => spot && p.onFocus(spot)} disabled={!spot}>
                <span className="spot">{spot?.label ?? c.spotLabel}</span>
                <span className="plate-sm">{c.plate}</span>
                <span className="time">{formatElapsed(p.now - c.parkedAt)}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="empty">{p.cars.length ? 'No matches' : 'No cars parked yet'}</li>}
      </ul>
    </aside>
  );
}
