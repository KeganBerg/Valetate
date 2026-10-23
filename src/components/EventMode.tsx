import { useEffect, useState } from 'react';
import { uid } from '../geometry';
import { blockersOf } from '../stacks';
import { clock, hhmm, isPre, nearestOpen, nextTime, pace, stagingList } from '../surge';
import type { CarRequest, LotEvent, ParkedCar, Spot } from '../types';
import { useDialog } from '../dialog';

/** re-render every second while a countdown is on screen */
function useSeconds(on = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}

const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const tagOf = (c: ParkedCar) => (c.ticket ? `#${c.ticket}` : c.plate || 'Car');

/** Start an event, or change its name and let-out time. */
export function EventDialog({ event, onSave, onEnd, onClose }: { event: LotEvent | null; onSave: (e: LotEvent) => void; onEnd: () => void; onClose: () => void }) {
  const dialog = useDialog<HTMLFormElement>(onClose);
  const [name, setName] = useState(event?.name ?? '');
  const [time, setTime] = useState(event ? hhmm(event.letOutAt) : '');
  const letOut = nextTime(time, Date.now());
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog event-dialog"
        {...dialog}
        aria-label="Event mode"
        onSubmit={(e) => {
          e.preventDefault();
          if (!letOut) return;
          onSave({ id: event?.id ?? uid(), name: name.trim(), letOutAt: letOut, createdAt: event?.createdAt ?? Date.now() });
        }}
      >
        <header>
          <h2>{event ? 'Event' : 'Start event mode'}</h2>
          <div className="grow" />
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="hint">
          For a show or game that lets out all at once. Everyone on the team sees the countdown, can request cars ahead for the let-out, and gets a list of
          cars to stage near the stand.
        </p>
        <label className="field">
          <span>What's on</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hamilton, Heat game…" autoFocus={!event} />
        </label>
        <label className="field">
          <span>Lets out at</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        {letOut && <p className="muted">{new Date(letOut).toDateString() === new Date().toDateString() ? 'Tonight' : 'Tomorrow'} at {timeOf(letOut)}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={!letOut}>
            {event ? 'Save' : 'Start'}
          </button>
          {event && (
            <button type="button" className="danger-text" onClick={onEnd}>
              End event
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** The countdown over the map, so it's visible with the sheet closed. */
export function EventPill({ event, onOpen }: { event: LotEvent; onOpen: () => void }) {
  const now = useSeconds();
  const left = event.letOutAt - now;
  return (
    <button className={`event-pill ${left <= 0 ? 'out' : left < 10 * 60_000 ? 'soon' : ''}`} onClick={onOpen}>
      <span aria-hidden>🎭</span> {left > 0 ? `Let-out in ${clock(left)}` : `Letting out · ${clock(left)}`}
    </button>
  );
}

interface CardProps {
  event: LotEvent;
  /** cars on every lot */
  cars: ParkedCar[];
  /** this lot's spots and cars, for staging */
  spots: Spot[];
  mapCars: ParkedCar[];
  stand: { x: number; y: number };
  requests: CarRequest[];
  outSince: number;
  onEdit: () => void;
  onFind: (q: string) => void;
  onStartMove: (car: ParkedCar) => void;
}

/** Top of the live sheet during an event: countdown, numbers, and what to stage. */
export function EventCard(p: CardProps) {
  const now = useSeconds();
  const before = now < p.event.letOutAt;
  const pre = p.requests.filter((r) => isPre(r, now));
  const waiting = p.requests.filter((r) => r.status !== 'ready' && !isPre(r, now)).length;
  const { minsLeft, perMin } = pace(p.outSince, p.event.letOutAt, now, p.cars.length);

  // cars asked for ahead on this lot; ones already among the spots nearest the stand count as staged
  const taken = new Set(p.mapCars.map((c) => c.spotKey));
  const preHere = p.requests.filter((r) => r.dueAt && r.status === 'open');
  const toStage = stagingList(p.mapCars, p.spots, preHere, p.stand);
  const closeKeys = new Set(nearestOpen(p.spots, new Set(), p.stand, Math.max(6, toStage.length * 2)).map((s) => s.key));
  const staged = (c: ParkedCar) => closeKeys.has(c.spotKey);
  const ordered = [...toStage.filter((c) => !staged(c)), ...toStage.filter(staged)];
  const openNear = nearestOpen(p.spots, taken, p.stand, 3);

  return (
    <section className={`card event-card ${before ? '' : 'out'}`} aria-label="Event">
      <div className="event-head">
        <span className="event-name">🎭 {p.event.name || 'Event'}</span>
        <button className="link" onClick={p.onEdit}>
          Edit
        </button>
      </div>
      <div className="countdown">
        <b>{clock(p.event.letOutAt - now)}</b>
        <span>{before ? `until let-out at ${timeOf(p.event.letOutAt)}` : `since let-out at ${timeOf(p.event.letOutAt)}`}</span>
      </div>
      <div className="event-stats">
        <div>
          <b>{p.cars.length}</b>
          <span>parked</span>
        </div>
        {before ? (
          <div>
            <b>{pre.length}</b>
            <span>asked ahead</span>
          </div>
        ) : (
          <>
            <div>
              <b>{waiting}</b>
              <span>waiting</span>
            </div>
            <div>
              <b>{p.outSince}</b>
              <span>out{perMin ? ` · ${perMin.toFixed(1)}/min` : ''}</span>
            </div>
            <div>
              <b>{minsLeft ?? '–'}</b>
              <span>min to empty</span>
            </div>
          </>
        )}
      </div>
      {ordered.length > 0 && (
        <>
          <h4>Stage near the stand</h4>
          <p className="hint">
            Asked for ahead, farthest first.
            {openNear.length > 0 && ` Open near the booth: ${openNear.map((s) => s.label).join(', ')}.`}
          </p>
          <ul className="stage-list">
            {ordered.map((c) => {
              const inTheWay = blockersOf(p.mapCars, c.id);
              const done = staged(c);
              return (
                <li key={c.id} className={done ? 'done' : ''}>
                  <button className="stage-car" onClick={() => p.onFind(c.ticket || c.plate)}>
                    <span className="tag-sm">{tagOf(c)}</span>
                    <span className="car-sm">
                      {c.spotLabel}
                      {done ? ' · staged' : inTheWay.length ? ` · move ${inTheWay.map(tagOf).join(', ')} first` : ''}
                    </span>
                  </button>
                  {!done && <button onClick={() => p.onStartMove(c)}>Move</button>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
