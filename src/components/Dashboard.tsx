import { useEffect, useMemo, useState } from 'react';
import type { DataSource } from '../data/source';
import { buildReport, hourText, valetCsv, waitText, type Report, type ReportData } from '../report';
import { dayStart, money } from '../shifts';
import { useDialog } from '../dialog';

type Range = 'today' | 'week' | 'month';
const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
];
const DAY = 24 * 60 * 60 * 1000;

function rangeStart(r: Range, now: number) {
  const today = dayStart(now);
  return r === 'today' ? today : today - (r === 'week' ? 6 : 29) * DAY;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)}m`);

/** How the stand is doing: wait times, busy hours, who did what, and tips. Managers and admins. */
export function Dashboard({ source, onClose }: { source: DataSource; onClose: () => void }) {
  const dialog = useDialog(onClose);
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [now] = useState(Date.now());
  const from = rangeStart(range, now);

  useEffect(() => {
    let live = true;
    setError('');
    // always fetch the whole month once; switching ranges is then instant
    source
      .reportData(rangeStart('month', now))
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the report'));
    return () => {
      live = false;
    };
  }, [source, now]);

  const r = useMemo(() => (data ? buildReport(data, from, now + 1, now) : null), [data, from, now]);
  const [chart, setChart] = useState<'requests' | 'carsIn'>('requests');
  const rated = !!r?.guests?.ratings;

  const download = () => {
    if (!r) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([valetCsv(r)], { type: 'text/csv' }));
    a.download = `valetate-report-${new Date(from).toISOString().slice(0, 10)}-${RANGES.find((x) => x.id === range)!.label.replace(' ', '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dashboard" {...dialog} aria-label="Stand report">
        <header>
          <h2>Stand report</h2>
          <div className="grow" />
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="seg dash-range" role="radiogroup" aria-label="Time range">
          {RANGES.map((x) => (
            <button key={x.id} role="radio" aria-checked={range === x.id} className={range === x.id ? 'on' : ''} onClick={() => setRange(x.id)}>
              {x.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="warn">{error}</p>
        ) : !r ? (
          <p className="muted">Adding it up…</p>
        ) : r.carsIn + r.carsOut + r.requests === 0 && !r.tipsCents ? (
          <div className="dash-empty">
            <b>No cars {range === 'today' ? 'yet today' : 'in this range'}</b>
            <p className="muted">Park and retrieve cars in the Live lot, and wait times, busy hours and tips fill in here on their own.</p>
          </div>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi">
                <span>Cars in</span>
                <b>{r.carsIn}</b>
                <small>{r.carsOut} out</small>
              </div>
              <div className={`kpi ${r.avgWait != null && r.avgWait > 10 * 60000 ? 'bad' : ''}`}>
                <span>Average wait</span>
                <b>{waitText(r.avgWait)}</b>
                <small>
                  {r.timed ? `9 in 10 within ${waitText(r.p90Wait)}` : 'No requests timed yet'}
                  {r.slowShare > 0 && ` · ${pct(r.slowShare)} over 10m`}
                </small>
              </div>
              <div className="kpi">
                <span>Busiest hour</span>
                <b>{r.peakHour == null ? '–' : hourText(r.peakHour)}</b>
                <small>
                  {r.requests > 0
                    ? `${r.byHour.requests[r.peakHour ?? 0]} of ${r.requests} requests · ${pct(r.guestShare)} by guests`
                    : `${r.peakHour == null ? 0 : r.byHour.carsIn[r.peakHour]} of ${r.carsIn} cars in`}
                </small>
              </div>
              <div className="kpi">
                <span>Tips</span>
                <b>{money(r.tipsCents)}</b>
                <small>{r.tipsPerShift != null ? `${money(r.tipsPerShift)} per shift · ${r.shifts} ${r.shifts === 1 ? 'shift' : 'shifts'}` : 'Nobody clocked in'}</small>
              </div>
            </div>

            <section className="dash-section">
              <div className="dash-head">
                <h3>By hour of the day</h3>
                <div className="seg small" role="radiogroup" aria-label="What to chart">
                  <button role="radio" aria-checked={chart === 'requests'} className={chart === 'requests' ? 'on' : ''} onClick={() => setChart('requests')}>
                    Requests
                  </button>
                  <button role="radio" aria-checked={chart === 'carsIn'} className={chart === 'carsIn' ? 'on' : ''} onClick={() => setChart('carsIn')}>
                    Cars in
                  </button>
                </div>
              </div>
              <Bars
                values={r.byHour[chart]}
                label={(i) => hourText(i)}
                tick={(i) => (i % 3 === 0 ? hourText(i).replace(' ', '') : '')}
                unit={chart === 'requests' ? ['request', 'requests'] : ['car in', 'cars in']}
                note={range === 'today' ? '' : ` over ${RANGES.find((x) => x.id === range)!.label.toLowerCase()}`}
              />
            </section>

            {r.byDay.length > 0 && (
              <section className="dash-section">
                <h3>Cars in per day</h3>
                <Bars
                  values={r.byDay.map((d) => d.carsIn)}
                  label={(i) => new Date(r.byDay[i].day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  tick={(i) =>
                    r.byDay.length <= 7 || i % 5 === 0 || i === r.byDay.length - 1
                      ? new Date(r.byDay[i].day).toLocaleDateString([], r.byDay.length <= 7 ? { weekday: 'short' } : { month: 'numeric', day: 'numeric' })
                      : ''
                  }
                  unit={['car in', 'cars in']}
                  note=""
                />
              </section>
            )}

            <section className="dash-section">
              <div className="dash-head">
                <h3>The crew</h3>
                {r.valets.length > 0 && (
                  <button className="link" onClick={download}>
                    Download CSV
                  </button>
                )}
              </div>
              {r.valets.length ? (
                <div className="table-wrap">
                  <table className="crew">
                    <thead>
                      <tr>
                        <th>Valet</th>
                        <th>Parked</th>
                        <th>Brought up</th>
                        <th>Avg wait</th>
                        <th>On clock</th>
                        <th>Tips</th>
                        {rated && <th>Rating</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {r.valets.map((v) => (
                        <tr key={v.userId}>
                          <td>{v.name}</td>
                          <td>{v.parked}</td>
                          <td>{v.broughtUp}</td>
                          <td className={v.avgWait != null && v.avgWait > 10 * 60000 ? 'warn-text' : ''}>{waitText(v.avgWait)}</td>
                          <td>{v.minutesOn ? hours(v.minutesOn) : '–'}</td>
                          <td>{v.tipsCents ? money(v.tipsCents) : '–'}</td>
                          {rated && (
                            <td className={v.rating != null && v.rating < 3.5 ? 'warn-text' : ''} title={v.ratings ? `${v.ratings} ${v.ratings === 1 ? 'rating' : 'ratings'}` : undefined}>
                              {v.rating == null ? '–' : `${v.rating.toFixed(1)} ★`}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Nobody to show yet.</p>
              )}
              <p className="hint">
                Wait is from the request (or the let-out, for cars asked for ahead) to the car at the stand. Tips are each person's share of the pool.
                {rated && ' Rating is what guests gave the cars each person brought up.'}
              </p>
            </section>

            {r.guests && <GuestRatings g={r.guests} />}
          </>
        )}
      </div>
    </div>
  );
}

const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** What guests said after pickup: the average, how the stars spread, and every comment or low rating. */
function GuestRatings({ g }: { g: NonNullable<Report['guests']> }) {
  const [all, setAll] = useState(false);
  const top = Math.max(1, ...g.stars);
  const said = all ? g.said : g.said.slice(0, 5);
  return (
    <section className="dash-section">
      <h3>Guest ratings</h3>
      {g.ratings ? (
        <>
          <div className="rating-sum">
            <div className={`rating-big ${g.avg != null && g.avg < 3.5 ? 'bad' : ''}`}>
              <b>{g.avg!.toFixed(1)}</b>
              <span className="stars" aria-hidden>
                {stars(g.avg!)}
              </span>
              <small>
                {g.ratings} {g.ratings === 1 ? 'rating' : 'ratings'}
              </small>
            </div>
            <ul className="rating-dist" aria-label="How the stars spread">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} aria-label={`${n} stars: ${g.stars[n - 1]}`}>
                  <span>{n}★</span>
                  <i>
                    <i className={n <= 2 ? 'low' : ''} style={{ width: `${(g.stars[n - 1] / top) * 100}%` }} />
                  </i>
                  <span>{g.stars[n - 1]}</span>
                </li>
              ))}
            </ul>
          </div>
          {said.length > 0 && (
            <ul className="said">
              {said.map((f) => (
                <li key={f.id}>
                  <span className={`stars ${f.rating <= 2 ? 'low' : ''}`} aria-label={`${f.rating} stars`}>
                    {stars(f.rating)}
                  </span>
                  <p>{f.comment ? `“${f.comment}”` : <span className="muted">No comment</span>}</p>
                  <small>
                    {[f.ticket && `#${f.ticket}`, f.valetName && `brought up by ${f.valetName.split(' ')[0]}`, when(f.createdAt)].filter(Boolean).join(' · ')}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {g.said.length > 5 && (
            <button className="link" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${g.said.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="muted">No ratings yet. After pickup, the guest's car link asks one question: how was your valet service?</p>
      )}
    </section>
  );
}

/** A single-series bar chart with a readout: tap or hover a bar to read it, otherwise it shows the busiest. */
function Bars({
  values,
  label,
  tick,
  unit,
  note,
}: {
  values: number[];
  label: (i: number) => string;
  tick: (i: number) => string;
  unit: [string, string];
  note: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const shown = hover ?? peak;
  const W = 100 / values.length;
  const H = 120;
  const v = values[shown] ?? 0;
  return (
    <figure className="bars" onPointerLeave={() => setHover(null)}>
      <figcaption className="bars-readout" aria-live="polite">
        <b>{v}</b> {v === 1 ? unit[0] : unit[1]} · {label(shown)}
        {hover == null && v > 0 ? ' (busiest)' : ''}
        {note}
      </figcaption>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={values.map((x, i) => `${label(i)}: ${x}`).join(', ')}>
        <line x1="0" x2="100" y1={H - 0.5} y2={H - 0.5} className="bars-base" vectorEffect="non-scaling-stroke" />
        {values.map((x, i) => {
          const h = x ? Math.max(3, (x / max) * (H - 6)) : 0;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={i * W} y={0} width={W} height={H} fill="transparent" />
              {h > 0 && <rect x={i * W + W * 0.12} y={H - h} width={W * 0.76} height={h} rx={0.6} className={`bar ${i === shown ? 'on' : ''}`} />}
            </g>
          );
        })}
      </svg>
      <div className="bars-ticks" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }} aria-hidden>
        {values.map((_, i) => (
          <span key={i}>{tick(i)}</span>
        ))}
      </div>
    </figure>
  );
}
