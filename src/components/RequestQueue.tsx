import { useState } from 'react';
import { LATE_MS, sortQueue, waited } from '../requests';
import { colorHex, formatElapsed } from '../ops';
import type { CarRequest, ParkedCar } from '../types';

export interface RequestActions {
  onClaim: (r: CarRequest) => void;
  onUnclaim: (r: CarRequest) => void;
  onCancel: (r: CarRequest) => void;
  /** the car is at the stand */
  onReady: (r: CarRequest) => void;
  /** the guest drove off: retrieve the car, which closes the request */
  onHandOver: (car: ParkedCar) => void;
}

interface Props extends RequestActions {
  requests: CarRequest[];
  cars: ParkedCar[];
  me: string;
  now: number;
  onFocus: (car: ParkedCar) => void;
  /** request a car by its tag without finding it on the map; returns an error to show, if any */
  onRequestTag: (tag: string) => string | null;
}

const age = (from: number, now: number) => waited(now - from);

function whoHasIt(r: CarRequest, me: string) {
  if (r.status === 'ready') return 'at the stand';
  if (r.status === 'open') return r.source === 'guest' ? 'guest is waiting' : 'nobody has it yet';
  return r.claimedBy === me ? 'you have it' : `${r.claimedByName || 'Someone'} has it`;
}

/** The one button that moves a request forward, for whoever is holding the phone. */
function NextStep({ r, car, me, a }: { r: CarRequest; car: ParkedCar; me: string; a: RequestActions }) {
  if (r.status === 'open')
    return (
      <button className="primary claim" onClick={() => a.onClaim(r)}>
        Claim
      </button>
    );
  if (r.status === 'claimed' && r.claimedBy === me)
    return (
      <button className="primary up" onClick={() => a.onReady(r)}>
        Car is up
      </button>
    );
  if (r.status === 'ready')
    return (
      <button className="primary handed" onClick={() => a.onHandOver(car)}>
        Handed over
      </button>
    );
  return null;
}

/** Cars people are waiting on, oldest first. Claim, "Car is up", "Handed over": one tap each. */
export function RequestQueue(p: Props) {
  const [tag, setTag] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const byId = new Map(p.cars.map((c) => [c.id, c]));
  const open = p.requests.filter((r) => r.status === 'open').length;
  return (
    <section className="queue" aria-label="Requests">
      <form
        className="quick-request"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tag.trim()) return;
          const problem = p.onRequestTag(tag.trim());
          setErr(problem);
          if (!problem) setTag('');
        }}
      >
        <input
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setErr(null);
          }}
          inputMode="numeric"
          enterKeyHint="send"
          placeholder="Tag # to request"
          aria-label="Tag number to request"
        />
        <button type="submit" className="request-btn" disabled={!tag.trim()}>
          Request
        </button>
      </form>
      {err && <p className="warn">{err}</p>}
      {p.requests.length > 0 && (
        <>
          <h3>
            Requests <span className={`count ${open ? 'hot' : ''}`}>{open ? `${open} waiting` : 'all taken'}</span>
          </h3>
          <ul>
            {sortQueue(p.requests).map((r) => {
              const car = byId.get(r.carId);
              if (!car) return null;
              const mine = r.status === 'claimed' && r.claimedBy === p.me;
              const late = r.status !== 'ready' && p.now - r.createdAt > LATE_MS;
              return (
                <li key={r.id} className={`req ${r.status} ${mine ? 'mine' : ''} ${late ? 'late' : ''}`}>
                  <button className="req-car" onClick={() => p.onFocus(car)} title="Show on map">
                    <span className="tag-sm">{car.ticket ? `#${car.ticket}` : car.plate}</span>
                    <span className="req-what">
                      <span className="req-line">
                        {colorHex(car.color) && <i className="color-dot" style={{ background: colorHex(car.color) }} />}
                        {[car.color, car.make].filter(Boolean).join(' ') || car.plate || 'Car'} · {car.spotLabel}
                      </span>
                      <span className="req-sub">
                        {age(r.status === 'ready' && r.readyAt ? r.readyAt : r.createdAt, p.now)} · {whoHasIt(r, p.me)}
                        {r.source === 'guest' && r.status !== 'open' ? ' · guest' : ''}
                      </span>
                    </span>
                  </button>
                  <NextStep r={r} car={car} me={p.me} a={p} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** What the car card shows once the car has been asked for. */
export function RequestStatus({ r, car, me, now, ...a }: { r: CarRequest; car: ParkedCar; me: string; now: number } & RequestActions) {
  const mine = r.status === 'claimed' && r.claimedBy === me;
  const title =
    r.status === 'open' ? (r.source === 'guest' ? 'Guest requested it' : 'Requested') : r.status === 'ready' ? 'Car is up at the stand' : mine ? 'You have this one' : `${r.claimedByName || 'Someone'} has it`;
  return (
    <div className={`req-status ${r.status} ${r.status !== 'ready' && now - r.createdAt > LATE_MS ? 'late' : ''}`}>
      <div>
        <b>{title}</b>
        <span>
          asked {now - r.createdAt < 60000 ? 'just now' : `${formatElapsed(now - r.createdAt)} ago`}{r.createdByName && r.source !== 'guest' ? ` by ${r.createdByName}` : ''}
        </span>
      </div>
      <div className="actions">
        <NextStep r={r} car={car} me={me} a={a} />
        {mine && <button onClick={() => a.onUnclaim(r)}>Give back</button>}
        <button onClick={() => a.onCancel(r)}>Cancel request</button>
      </div>
    </div>
  );
}
