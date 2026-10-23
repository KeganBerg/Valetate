import { useState } from 'react';
import { uid } from '../geometry';
import { carsWithKeysOut } from '../keys';
import { dayStart, duration, latestHandoff, money, parseCents, splitPool, validTipUrl } from '../shifts';
import type { CarRequest, ParkedCar, Shift, Tip } from '../types';
import { useDialog } from '../dialog';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const QUICK = [1, 2, 3, 5, 10, 20];

interface Props {
  me: { id: string; name: string };
  /** managers and admins can clock out someone who forgot, and void any tip */
  isManager: boolean;
  isAdmin: boolean;
  now: number;
  shifts: Shift[];
  tips: Tip[];
  tipUrl: string;
  /** for the handoff summary */
  cars: ParkedCar[];
  requests: CarRequest[];
  onClockIn: (s: Shift) => void;
  onClockOut: (s: Shift, note: string) => void;
  onTip: (t: Tip) => void;
  onVoidTip: (t: Tip) => void;
  onTipUrl: (url: string) => void;
  onClose: () => void;
}

/** Clock in and out, log tips in one tap, see the pool split, and leave a note for the next crew. */
export function ShiftSheet(props: Props) {
  const dialog = useDialog(props.onClose);
  // the app's clock ticks slowly; a tip logged a second ago must already count
  const p = { ...props, now: Math.max(props.now, Date.now()) };
  const [method, setMethod] = useState<Tip['method']>('cash');
  const [custom, setCustom] = useState('');
  const [closing, setClosing] = useState<Shift | null>(null);
  const [note, setNote] = useState('');
  const [url, setUrl] = useState(p.tipUrl);

  const from = dayStart(p.now);
  const mine = p.shifts.find((s) => s.userId === p.me.id && !s.endedAt);
  const handoff = latestHandoff(p.shifts, p.now);
  const { total, shares } = splitPool(p.tips, p.shifts, from, Infinity, p.now);
  const todays = p.tips.filter((t) => t.createdAt >= from);
  const cash = todays.filter((t) => t.method === 'cash').reduce((s, t) => s + t.amountCents, 0);
  const open = new Set(p.shifts.filter((s) => !s.endedAt).map((s) => s.userId));
  const myShare = shares.find((s) => s.userId === p.me.id)?.cents ?? 0;

  const log = (cents: number) =>
    p.onTip({ id: uid(), amountCents: cents, method, carId: null, loggedBy: p.me.id, loggedByName: p.me.name, createdAt: Date.now() });

  // the handoff summary: what the next crew walks into
  const keysOut = carsWithKeysOut(p.cars);
  const waiting = p.requests.filter((r) => r.status !== 'ready').length;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="dialog shift-sheet" {...dialog} aria-label="Shift and tips">
        <header>
          <h2>Shift and tips</h2>
          <div className="grow" />
          <button className="icon" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {handoff && (!mine || mine.startedAt <= (handoff.endedAt ?? 0) + 60 * 60 * 1000) && handoff.userId !== p.me.id && (
          <div className="handoff-note">
            <b>
              From {handoff.userName || 'the last crew'} at {time(handoff.endedAt!)}
            </b>
            <p>{handoff.handoffNote}</p>
          </div>
        )}

        {closing ? (
          <form
            className="clock-out"
            onSubmit={(e) => {
              e.preventDefault();
              p.onClockOut(closing, note.trim());
              setClosing(null);
              setNote('');
            }}
          >
            <h3>{closing.userId === p.me.id ? 'Before you go' : `Clock out ${closing.userName}`}</h3>
            <ul className="handoff-summary">
              <li>
                <b>{p.cars.length}</b> {p.cars.length === 1 ? 'car' : 'cars'} still parked
              </li>
              <li className={keysOut.length ? 'warn-text' : ''}>
                <b>{keysOut.length}</b> {keysOut.length === 1 ? 'key' : 'keys'} off the board
                {keysOut.length > 0 && `: ${keysOut.map((c) => `${c.ticket ? `#${c.ticket}` : c.plate} (${c.keysWithName || 'someone'})`).join(', ')}`}
              </li>
              <li className={waiting ? 'warn-text' : ''}>
                <b>{waiting}</b> {waiting === 1 ? 'request' : 'requests'} still open
              </li>
              {closing.userId === p.me.id && (
                <li>
                  <b>{duration(p.now - closing.startedAt)}</b> on the clock · <b>{money(myShare)}</b> your share of tips so far
                </li>
              )}
            </ul>
            <label className="field">
              <span>Notes for the next crew</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Key box 4 sticks. Silver Tahoe in A3 is a monthly. Gate arm is slow…"
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => setClosing(null)}>
                Cancel
              </button>
              <button className="primary" type="submit">
                Clock out
              </button>
            </div>
          </form>
        ) : (
          <section className={`clock ${mine ? 'on' : ''}`}>
            <div>
              <b>{mine ? 'On the clock' : 'Not clocked in'}</b>
              <span>{mine ? `${duration(p.now - mine.startedAt)} · since ${time(mine.startedAt)}` : 'Clock in so your time counts toward the tip pool.'}</span>
            </div>
            {mine ? (
              <button onClick={() => setClosing(mine)}>Clock out</button>
            ) : (
              <button
                className="primary"
                onClick={() => p.onClockIn({ id: uid(), userId: p.me.id, userName: p.me.name, startedAt: Date.now(), endedAt: null, handoffNote: '' })}
              >
                Clock in
              </button>
            )}
          </section>
        )}

        <section className="tip-log">
          <h3>Log a tip</h3>
          <div className="seg" role="radiogroup" aria-label="How the tip was paid">
            {(['cash', 'digital'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
                {m === 'cash' ? 'Cash' : 'Venmo / card'}
              </button>
            ))}
          </div>
          <div className="tip-amounts">
            {QUICK.map((d) => (
              <button key={d} onClick={() => log(d * 100)}>
                ${d}
              </button>
            ))}
          </div>
          <form
            className="tip-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const c = parseCents(custom);
              if (c) {
                log(c);
                setCustom('');
              }
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Other amount" aria-label="Other amount" />
            <button type="submit" disabled={!parseCents(custom)}>
              Log {parseCents(custom) ? money(parseCents(custom)!) : ''}
            </button>
          </form>
        </section>

        <section className="pool">
          <h3>
            Today's pool <span className="pool-total">{money(total)}</span>
          </h3>
          <p className="hint">
            {money(cash)} cash · {money(total - cash)} digital · split by time on the clock since 5 AM
          </p>
          {shares.length ? (
            <ul className="pool-list">
              {shares.map((s) => {
                const openShift = p.shifts.find((x) => x.userId === s.userId && !x.endedAt);
                return (
                  <li key={s.userId}>
                    <span className={`dot ${open.has(s.userId) ? 'on' : ''}`} aria-label={open.has(s.userId) ? 'On the clock' : 'Off'} />
                    <span className="who">{s.userId === p.me.id ? (s.name && s.name !== 'You' ? `${s.name} (you)` : 'You') : s.name || 'Valet'}</span>
                    <span className="mins">{duration(s.minutes * 60000)}</span>
                    <b className="cut">{money(s.cents)}</b>
                    {p.isManager && openShift && s.userId !== p.me.id && (
                      <button className="link" onClick={() => setClosing(openShift)}>
                        Clock out
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Nobody has clocked in today, so there's nothing to split yet.</p>
          )}
          {todays.length > 0 && (
            <details className="tip-history">
              <summary>
                {todays.length} {todays.length === 1 ? 'tip' : 'tips'} logged today
              </summary>
              <ul>
                {[...todays].reverse().map((t) => (
                  <li key={t.id}>
                    <b>{money(t.amountCents)}</b> {t.method} · {t.loggedBy === p.me.id ? 'you' : t.loggedByName} · {time(t.createdAt)}
                    {(t.loggedBy === p.me.id || p.isManager) && (
                      <button className="link danger-text" onClick={() => p.onVoidTip(t)} aria-label={`Remove ${money(t.amountCents)} tip`}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {p.isAdmin ? (
          <form
            className="tip-link"
            onSubmit={(e) => {
              e.preventDefault();
              if (validTipUrl(url)) p.onTipUrl(url.trim());
            }}
          >
            <label className="field">
              <span>Guest tip link</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://venmo.com/u/your-stand" inputMode="url" />
            </label>
            {!validTipUrl(url) && <p className="warn">Use a full https:// link, like your Venmo, Cash App or PayPal.me page.</p>}
            <p className="hint">Guests see "Tip your valet" on their page once their car is up.</p>
            <button type="submit" disabled={url.trim() === p.tipUrl || !validTipUrl(url)}>
              Save link
            </button>
          </form>
        ) : (
          p.tipUrl && <p className="hint">Guests see a "Tip your valet" button for {p.tipUrl.replace(/^https:\/\//, '')} once their car is up.</p>
        )}
      </div>
    </div>
  );
}
