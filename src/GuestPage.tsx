import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './data/supabase';
import { colorHex, formatElapsed } from './ops';
import { dollars, feeFor, NO_RATES, type Rates } from './payments';

interface GuestCar {
  company: string;
  ticket: string;
  color: string;
  make: string;
  vehicle: string;
  parked: boolean;
  /** the stand's Venmo / Cash App link, if they set one */
  tip_url?: string | null;
  request: {
    status: 'open' | 'claimed' | 'ready' | 'done';
    created_at: string;
    claimed_by_name: string;
    ready_at: string | null;
  } | null;
  /** what the stand charges, when the car came in, and whether it's paid: the page works out what's owed so far */
  rates?: Partial<Rates> | null;
  parked_at?: string;
  paid?: boolean;
  /** their answer to the one question after pickup */
  feedback?: { rating: number; comment: string } | null;
}

type Load = { kind: 'loading' } | { kind: 'missing' } | { kind: 'offline' } | { kind: 'car'; car: GuestCar };

const POLL_MS = 4000;

/** What the guest sees from their link: one button, then live status until the car is in front of them. */
export default function GuestPage({ token }: { token: string }) {
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [asking, setAsking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastStatus = useRef<string | null>(null);

  const show = useCallback((data: unknown) => {
    if (!data) return setState({ kind: 'missing' });
    const car = data as GuestCar;
    const status = car.request?.status ?? null;
    // buzz once when the car reaches the stand
    if (status === 'ready' && lastStatus.current && lastStatus.current !== 'ready') navigator.vibrate?.([200, 100, 200]);
    lastStatus.current = status;
    setState({ kind: 'car', car });
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return setState({ kind: 'missing' });
    const { data, error } = await supabase.rpc('guest_car', { token });
    if (error) return setState((s) => (s.kind === 'car' ? s : { kind: 'offline' }));
    show(data);
    setNow(Date.now());
  }, [token, show]);

  useEffect(() => {
    load();
    const t = window.setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const ask = async () => {
    if (!supabase) return;
    setAsking(true);
    const { data, error } = await supabase.rpc('guest_request', { token });
    setAsking(false);
    if (error) return setState({ kind: 'offline' });
    show(data);
  };

  const car = state.kind === 'car' ? state.car : null;
  const req = car?.request && car.request.status !== 'done' ? car.request : null;
  useEffect(() => {
    document.title = req?.status === 'ready' ? 'Your car is ready' : car ? `${car.company} valet` : 'Valet';
  }, [req?.status, car]);

  return (
    <div className="guest">
      <main className="guest-card">
        {state.kind === 'loading' && <p className="muted center">Loading your ticket…</p>}
        {state.kind === 'offline' && (
          <>
            <h1>Can't reach the valet right now</h1>
            <p className="muted">Check your signal and try again. Your ticket is still good.</p>
            <button className="primary big" onClick={load}>
              Try again
            </button>
          </>
        )}
        {state.kind === 'missing' && (
          <>
            <h1>This link has expired</h1>
            <p className="muted">The car may already have been picked up. Show your ticket at the valet stand and they'll help you.</p>
          </>
        )}
        {car && (
          <>
            <p className="guest-company">{car.company} valet</p>
            <div className="guest-ticket">
              <span className="tag">#{car.ticket || '—'}</span>
              <span className="guest-car">
                {colorHex(car.color) && <i className="color-dot" style={{ background: colorHex(car.color) }} />}
                {[car.color, car.make, car.vehicle].filter(Boolean).join(' ') || 'Your car'}
              </span>
            </div>

            {car.parked && <Owed car={car} now={now} />}
            {!car.parked ? (
              <>
                <Step tone="done" title="Picked up" text="Thanks for valeting with us. Drive safe!" />
                <Survey token={token} feedback={car.feedback ?? null} onSaved={show} />
              </>
            ) : !req ? (
              <>
                <p className="muted">When you're ready to leave, tap below and we'll start bringing your car up.</p>
                <button className="primary big guest-ask" onClick={ask} disabled={asking}>
                  {asking ? 'Sending…' : 'Bring my car'}
                </button>
              </>
            ) : (
              <>
                <ol className="guest-steps">
                  <li className={req.status === 'open' ? 'now' : 'done'}>Request received</li>
                  <li className={req.status === 'claimed' ? 'now' : req.status === 'ready' ? 'done' : ''}>
                    {req.status === 'claimed' && req.claimed_by_name ? `${req.claimed_by_name} is getting your car` : 'A valet is getting your car'}
                  </li>
                  <li className={req.status === 'ready' ? 'now ready' : ''}>Ready at the valet stand</li>
                </ol>
                {req.status === 'ready' ? (
                  <Step tone="ready" title="Your car is ready" text={`Head to the valet stand and show ticket #${car.ticket}.`} />
                ) : (
                  <p className="muted center">
                    {now - Date.parse(req.created_at) < 60000 ? "Requested just now" : `Requested ${formatElapsed(now - Date.parse(req.created_at))} ago`}. This page updates on its own.
                  </p>
                )}
              </>
            )}
            {car.tip_url && /^https:\/\//.test(car.tip_url) && (!car.parked || req?.status === 'ready') && (
              <a className="guest-tip" href={car.tip_url} target="_blank" rel="noopener noreferrer">
                Tip your valet
              </a>
            )}
          </>
        )}
      </main>
      <p className="guest-foot">Powered by Valetate</p>
    </div>
  );
}

/** "Parking so far: $16 · pay at the stand" */
function Owed({ car, now }: { car: GuestCar; now: number }) {
  const rates = { ...NO_RATES, ...(car.rates ?? {}) };
  if (rates.mode === 'off' || !car.parked_at) return null;
  if (car.paid) return <p className="guest-owed paid">Parking paid ✓</p>;
  const fee = feeFor(rates, now - Date.parse(car.parked_at));
  if (!fee) return null;
  return (
    <p className="guest-owed">
      Parking so far: <b>{dollars(fee)}</b> · pay at the stand
    </p>
  );
}

const LABELS = ['Poor', 'Not great', 'Okay', 'Good', 'Excellent'];

/** The one question: tap a star (saved right away), then an optional comment. */
function Survey({ token, feedback, onSaved }: { token: string; feedback: GuestCar['feedback']; onSaved: (data: unknown) => void }) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(feedback?.rating ?? 0);
  const [note, setNote] = useState(feedback?.comment ?? '');
  const [sent, setSent] = useState(!!feedback?.comment);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async (stars: number | null, comment: string | null) => {
    if (!supabase) return false;
    setBusy(true);
    setFailed(false);
    const { data, error } = await supabase.rpc('guest_feedback', { token, stars, note: comment });
    setBusy(false);
    if (error) {
      setFailed(true);
      return false;
    }
    onSaved(data);
    return true;
  };
  const rate = (n: number) => {
    const before = picked;
    setPicked(n);
    save(n, null).then((ok) => ok || setPicked(before));
  };
  const shown = hover || picked;

  return (
    <div className="survey">
      <h2>{picked ? 'Thanks for rating us' : 'How was your valet service?'}</h2>
      <div className="survey-stars" role="radiogroup" aria-label="Your rating" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={picked === n}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}, ${LABELS[n - 1]}`}
            className={n <= shown ? 'on' : ''}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(n)}
            onClick={() => rate(n)}
            disabled={busy}
          >
            ★
          </button>
        ))}
      </div>
      <p className="survey-label" aria-live="polite">
        {shown ? LABELS[shown - 1] : 'Tap a star'}
      </p>
      {failed && <p className="warn">Couldn't send that. Check your signal and tap again.</p>}
      {picked > 0 &&
        (sent ? (
          <p className="muted center">
            Thanks for letting us know.{' '}
            <button className="link" onClick={() => setSent(false)}>
              Edit
            </button>
          </p>
        ) : (
          <form
            className="survey-note"
            onSubmit={(e) => {
              e.preventDefault();
              save(null, note).then((ok) => ok && setSent(true));
            }}
          >
            <label>
              <span>{picked <= 3 ? "Sorry it wasn't better. What went wrong?" : 'Anything the team should know? (optional)'}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
            </label>
            {note.trim() && (
              <button className="primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            )}
          </form>
        ))}
    </div>
  );
}

function Step({ tone, title, text }: { tone: 'ready' | 'done'; title: string; text: string }) {
  return (
    <div className={`guest-step ${tone}`} role="status">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
