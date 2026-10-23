import { LATE_MS, sortQueue } from '../requests';
import { colorHex, formatElapsed } from '../ops';
import type { CarRequest, ParkedCar } from '../types';

export interface RequestActions {
  onClaim: (r: CarRequest) => void;
  onUnclaim: (r: CarRequest) => void;
  onCancel: (r: CarRequest) => void;
  /** the car is at the stand: retrieve it, which closes the request */
  onDone: (r: CarRequest, car: ParkedCar) => void;
}

interface Props extends RequestActions {
  requests: CarRequest[];
  cars: ParkedCar[];
  me: string;
  now: number;
  onFocus: (car: ParkedCar) => void;
}

const age = (r: CarRequest, now: number) => formatElapsed(now - r.createdAt);

/** The cars people are waiting on, oldest first. One tap to take one, one tap when it's delivered. */
export function RequestQueue(p: Props) {
  if (!p.requests.length) return null;
  const byId = new Map(p.cars.map((c) => [c.id, c]));
  const open = p.requests.filter((r) => r.status === 'open').length;
  return (
    <section className="queue" aria-label="Requests">
      <h3>
        Requests <span className={`count ${open ? 'hot' : ''}`}>{open ? `${open} waiting` : 'all taken'}</span>
      </h3>
      <ul>
        {sortQueue(p.requests).map((r) => {
          const car = byId.get(r.carId);
          if (!car) return null;
          const mine = r.status === 'claimed' && r.claimedBy === p.me;
          const late = p.now - r.createdAt > LATE_MS;
          return (
            <li key={r.id} className={`req ${r.status} ${mine ? 'mine' : ''} ${late ? 'late' : ''}`}>
              <button className="req-car" onClick={() => p.onFocus(car)} title="Show on map">
                <span className="tag-sm">{car.ticket ? `#${car.ticket}` : car.plate}</span>
                <span className="req-what">
                  <span className="req-line">
                    {colorHex(car.color) && <i className="color-dot" style={{ background: colorHex(car.color) }} />}
                    {[car.color, car.make].filter(Boolean).join(' ') || car.plate || 'Car'}
                  </span>
                  <span className="req-sub">
                    {car.spotLabel} · {r.status === 'open' ? `waiting ${age(r, p.now)}` : mine ? 'you have it' : `${r.claimedByName || 'Someone'} has it`}
                  </span>
                </span>
              </button>
              {r.status === 'open' && (
                <button className="primary claim" onClick={() => p.onClaim(r)}>
                  Claim
                </button>
              )}
              {mine && (
                <button className="primary done" onClick={() => p.onDone(r, car)}>
                  Done
                </button>
              )}
              {r.status === 'claimed' && !mine && <span className="req-age">{age(r, p.now)}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the car card shows when the car has been asked for. */
export function RequestStatus({ r, car, me, now, ...a }: { r: CarRequest; car: ParkedCar; me: string; now: number } & RequestActions) {
  const mine = r.status === 'claimed' && r.claimedBy === me;
  return (
    <div className={`req-status ${r.status} ${now - r.createdAt > LATE_MS ? 'late' : ''}`}>
      <div>
        <b>{r.status === 'open' ? 'Requested' : mine ? 'You have this one' : `${r.claimedByName || 'Someone'} has it`}</b>
        <span>
          {formatElapsed(now - r.createdAt)} ago{r.createdByName ? ` by ${r.createdByName}` : ''}
        </span>
      </div>
      <div className="actions">
        {r.status === 'open' && (
          <button className="primary" onClick={() => a.onClaim(r)}>
            Claim
          </button>
        )}
        {mine && (
          <>
            <button className="primary" onClick={() => a.onDone(r, car)}>
              Done, car delivered
            </button>
            <button onClick={() => a.onUnclaim(r)}>Give back</button>
          </>
        )}
        <button onClick={() => a.onCancel(r)}>Cancel request</button>
      </div>
    </div>
  );
}
