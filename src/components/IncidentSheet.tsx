import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataSource } from '../data/source';
import { uid } from '../geometry';
import { carLabel, INCIDENT_KINDS, kindInfo, sortIncidents } from '../incidents';
import { formatElapsed } from '../ops';
import { preparePhoto } from '../photos';
import { useDialog } from '../dialog';
import type { Incident, IncidentKind, ParkedCar } from '../types';

const MAX_PHOTOS = 8;
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = (t: number, now: number) => (now - t < 60000 ? 'just now' : `${formatElapsed(now - t)} ago`);

interface Props {
  source: DataSource;
  me: { id: string; name: string };
  isManager: boolean;
  incidents: Incident[];
  /** parked cars, to attach one */
  cars: ParkedCar[];
  /** open straight on a new report about this car */
  forCar?: ParkedCar | null;
  onChanged: () => void;
  onResolve: (inc: Incident, note: string, reopen: boolean) => void;
  onClose: () => void;
}

/** File and follow incident reports: damage claims, accidents, complaints, lost and found. */
export function IncidentSheet(p: Props) {
  const dialog = useDialog(p.onClose);
  const [view, setView] = useState<'list' | 'new' | string>(p.forCar ? 'new' : 'list');
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const now = Date.now();
  const sorted = useMemo(() => sortIncidents(p.incidents), [p.incidents]);
  const open = sorted.filter((i) => i.status === 'open');
  const shown = tab === 'open' ? open : sorted.filter((i) => i.status !== 'open');
  const viewing = sorted.find((i) => i.id === view);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="dialog incident-sheet" {...dialog} aria-label="Incidents">
        <header>
          {view !== 'list' && (
            <button className="icon" onClick={() => setView('list')} aria-label="Back to incidents">
              ‹
            </button>
          )}
          <h2>{view === 'new' ? 'Report an incident' : viewing ? kindInfo(viewing.kind).label : 'Incidents'}</h2>
          <div className="grow" />
          <button className="icon" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {view === 'new' ? (
          <NewIncident
            {...p}
            onDone={(inc) => {
              p.onChanged();
              setTab('open');
              setView(inc.id);
            }}
          />
        ) : viewing ? (
          <IncidentDetail inc={viewing} source={p.source} isManager={p.isManager} now={now} onResolve={p.onResolve} />
        ) : (
          <>
            <button className="primary big new-incident" onClick={() => setView('new')}>
              + Report an incident
            </button>
            <div className="seg incident-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>
                Open{open.length ? ` (${open.length})` : ''}
              </button>
              <button role="tab" aria-selected={tab === 'resolved'} className={tab === 'resolved' ? 'on' : ''} onClick={() => setTab('resolved')}>
                Resolved
              </button>
            </div>
            {shown.length ? (
              <ul className="incident-list">
                {shown.map((i) => (
                  <li key={i.id}>
                    <button className={`incident-row kind-${i.kind}`} onClick={() => setView(i.id)}>
                      <span className="incident-icon" aria-hidden>
                        {kindInfo(i.kind).icon}
                      </span>
                      <span className="incident-main">
                        <b>
                          {kindInfo(i.kind).label}
                          {i.carLabel && <span className="muted"> · {i.carLabel}</span>}
                        </b>
                        <span className="incident-text">{i.details}</span>
                        <small>
                          {i.reportedBy === p.me.id ? 'You' : i.reportedByName || 'Someone'} · {ago(i.createdAt, now)}
                          {i.photos.length > 0 && ` · ${i.photos.length} 📷`}
                          {i.status === 'resolved' && ` · resolved by ${i.resolvedByName || 'a manager'}`}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted incident-empty">
                {tab === 'open' ? 'Nothing open. If something happens, report it here with photos and a manager will see it right away.' : 'Nothing resolved in the last 30 days.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NewIncident(p: Props & { onDone: (inc: Incident) => void }) {
  const [kind, setKind] = useState<IncidentKind | null>(p.forCar ? 'damage' : null);
  const [car, setCar] = useState<ParkedCar | null>(p.forCar ?? null);
  const [q, setQ] = useState('');
  const [details, setDetails] = useState('');
  const [guestName, setGuestName] = useState(p.forCar?.ownerName ?? '');
  const [guestPhone, setGuestPhone] = useState(p.forCar?.ownerPhone ?? '');
  const [photos, setPhotos] = useState<{ id: string; blob: Blob; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => photos.forEach((ph) => URL.revokeObjectURL(ph.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^#/, '');
    if (!t) return [];
    return p.cars
      .filter((c) => [c.ticket, c.plate, c.ownerName, c.make, c.color].some((f) => f && f.toLowerCase().includes(t)))
      .slice(0, 5);
  }, [q, p.cars]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    for (const f of [...files].slice(0, MAX_PHOTOS - photos.length)) {
      try {
        const blob = await preparePhoto(f, [when(Date.now()), car?.ticket && `#${car.ticket}`, 'Incident'].filter(Boolean).join(' · '));
        setPhotos((ps) => [...ps, { id: crypto.randomUUID?.() ?? uid(), blob, url: URL.createObjectURL(blob) }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't use that photo");
      }
    }
  };

  const guestFields = kind === 'damage' || kind === 'complaint' || kind === 'lost_found';
  const submit = async () => {
    if (!kind || !details.trim()) return;
    const inc: Incident = {
      id: crypto.randomUUID?.() ?? uid(),
      kind,
      status: 'open',
      carId: car?.id ?? null,
      carLabel: car ? carLabel(car) : '',
      details: details.trim(),
      guestName: guestFields ? guestName.trim() : '',
      guestPhone: guestFields ? guestPhone.trim() : '',
      photos: [],
      reportedBy: p.me.id,
      reportedByName: p.me.name,
      createdAt: Date.now(),
      resolvedAt: null,
      resolvedByName: '',
      resolution: '',
    };
    setSaving(true);
    setError('');
    try {
      await p.source.reportIncident(inc, photos);
      p.onDone(inc);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Could not file it'}. Your report is still here; try again when you have signal.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="incident-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="kind-grid" role="radiogroup" aria-label="What happened">
        {INCIDENT_KINDS.map((k) => (
          <button type="button" key={k.kind} role="radio" aria-checked={kind === k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => setKind(k.kind)}>
            <span aria-hidden>{k.icon}</span>
            {k.label}
          </button>
        ))}
      </div>
      {kind && <p className="hint">{kindInfo(kind).hint}.</p>}

      <div className="field">
        <span>Car {kind === 'complaint' || kind === 'other' ? '(if any)' : ''}</span>
        {car ? (
          <div className="incident-car">
            <b>{carLabel(car)}</b>
            <button type="button" className="link" onClick={() => setCar(null)}>
              Change
            </button>
          </div>
        ) : (
          <div className="car-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tag, plate or name" aria-label="Find the car" />
            {matches.length > 0 && (
              <ul>
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCar(c);
                        setQ('');
                        if (!guestName) setGuestName(c.ownerName);
                        if (!guestPhone) setGuestPhone(c.ownerPhone);
                      }}
                    >
                      {carLabel(c)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <label className="field">
        <span>What happened</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          maxLength={4000}
          required
          placeholder="Who, what, where. Guest pointed at a scratch on the rear bumper, driver side; it's in the check-in photos…"
        />
      </label>

      {guestFields && (
        <div className="row2">
          <label className="field">
            <span>Guest name</span>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>Guest phone</span>
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </label>
        </div>
      )}

      <div className="field">
        <span>Photos</span>
        <div className="incident-photos">
          {photos.map((ph) => (
            <div key={ph.id} className="incident-thumb">
              <img src={ph.url} alt="" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  URL.revokeObjectURL(ph.url);
                  setPhotos((ps) => ps.filter((x) => x.id !== ph.id));
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="add-photo" onClick={() => input.current?.click()}>
              <span aria-hidden>📷</span>
              Add
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="warn">{error}</p>}
      <div className="actions">
        <button className="primary big" type="submit" disabled={!kind || !details.trim() || saving}>
          {saving ? (photos.length ? 'Uploading photos…' : 'Filing…') : 'File report'}
        </button>
      </div>
      <p className="hint">Managers see it right away. A filed report can't be edited, only resolved, so it holds up for insurance.</p>
    </form>
  );
}

function IncidentDetail({
  inc,
  source,
  isManager,
  now,
  onResolve,
}: {
  inc: Incident;
  source: DataSource;
  isManager: boolean;
  now: number;
  onResolve: Props['onResolve'];
}) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [note, setNote] = useState(inc.resolution);
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    source.incidentPhotos(inc).then(
      (u) => live && setUrls(u),
      () => live && setUrls([]),
    );
    return () => {
      live = false;
    };
  }, [source, inc]);

  return (
    <div className="incident-detail">
      <p className={`incident-status ${inc.status}`}>
        {inc.status === 'open' ? 'Open' : 'Resolved'} · filed by {inc.reportedByName || 'someone'} {when(inc.createdAt)} ({ago(inc.createdAt, now)})
      </p>
      {inc.carLabel && (
        <p>
          <b>Car</b> {inc.carLabel}
        </p>
      )}
      <p className="incident-details">{inc.details}</p>
      {(inc.guestName || inc.guestPhone) && (
        <p>
          <b>Guest</b> {inc.guestName}
          {inc.guestPhone && (
            <>
              {inc.guestName && ' · '}
              <a href={`tel:${inc.guestPhone}`}>{inc.guestPhone}</a>
            </>
          )}
        </p>
      )}
      {inc.photos.length > 0 && (
        <div className="incident-photos">
          {urls == null
            ? inc.photos.map((x) => <div key={x} className="incident-thumb loading" />)
            : urls.map((u) => (
                <button key={u} className="incident-thumb" onClick={() => setBig(u)} aria-label="View photo">
                  <img src={u} alt="" />
                </button>
              ))}
        </div>
      )}
      {big && (
        <button className="photo-full" onClick={() => setBig(null)} aria-label="Close photo">
          <img src={big} alt="" />
        </button>
      )}

      {inc.status === 'resolved' && (
        <div className="resolution">
          <b>
            Resolved by {inc.resolvedByName || 'a manager'}
            {inc.resolvedAt && ` · ${when(inc.resolvedAt)}`}
          </b>
          {inc.resolution && <p>{inc.resolution}</p>}
        </div>
      )}

      {isManager ? (
        inc.status === 'open' ? (
          <form
            className="resolve-form"
            onSubmit={(e) => {
              e.preventDefault();
              onResolve(inc, note.trim(), false);
            }}
          >
            <label className="field">
              <span>What was done</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} placeholder="Called the guest, sent photos to insurance…" />
            </label>
            <button className="primary" type="submit">
              Mark resolved
            </button>
          </form>
        ) : (
          <button onClick={() => onResolve(inc, inc.resolution, true)}>Reopen</button>
        )
      ) : (
        inc.status === 'open' && <p className="hint">A manager will follow up and mark it resolved.</p>
      )}
    </div>
  );
}
