import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './data/supabase';
import { colorHex, formatElapsed } from './ops';

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

            {!car.parked ? (
              <Step tone="done" title="Picked up" text="Thanks for valeting with us. Drive safe!" />
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

function Step({ tone, title, text }: { tone: 'ready' | 'done'; title: string; text: string }) {
  return (
    <div className={`guest-step ${tone}`} role="status">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
