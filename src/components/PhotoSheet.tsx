import { useEffect, useReducer, useRef, useState } from 'react';
import type { DataSource } from '../data/source';
import { preparePhoto, SIDES, sideLabel, stampText } from '../photos';
import type { PendingPhoto as Pending, PhotoQueue } from '../photoQueue';
import { uid } from '../geometry';
import type { CarPhoto, ParkedCar, PhotoSide } from '../types';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Guided walkaround: four sides plus any close-ups. Each tap opens the camera;
 * the picture is shrunk and stamped on the phone and uploads in the background.
 */
export function PhotoSheet({ car, source, queue, onClose }: { car: ParkedCar; source: DataSource; queue: PhotoQueue; onClose: () => void }) {
  const [photos, setPhotos] = useState<CarPhoto[] | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const pending = queue.forCar(car.id);
  const [viewing, setViewing] = useState<CarPhoto | Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const forSide = useRef<PhotoSide>('front');

  useEffect(() => {
    source.listPhotos(car.id).then(setPhotos, () => setPhotos([]));
  }, [source, car.id]);
  useEffect(() => queue.subscribe(rerender), [queue]);
  useEffect(
    () =>
      queue.onSaved((saved) => {
        if (saved.carId === car.id) setPhotos((ps) => [...(ps ?? []).filter((x) => x.id !== saved.id), saved]);
      }),
    [queue, car.id],
  );

  const all = [...(photos ?? []), ...pending];

  const take = (side: PhotoSide) => {
    forSide.current = side;
    setError(null);
    input.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const side = forSide.current;
    const takenAt = Date.now();
    try {
      const blob = await preparePhoto(file, stampText(takenAt, car.ticket || car.plate, side));
      queue.add({ id: uid(), car, side, url: URL.createObjectURL(blob), blob, takenAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that photo");
    }
  };

  const toggleDamage = (ph: CarPhoto) => {
    setPhotos((ps) => (ps ?? []).map((x) => (x.id === ph.id ? { ...x, damage: !x.damage } : x)));
    setViewing((v) => (v && v.id === ph.id ? { ...ph, damage: !ph.damage } : v));
    source.setPhotoDamage(ph.id, !ph.damage).catch(() => {
      setPhotos((ps) => (ps ?? []).map((x) => (x.id === ph.id ? { ...x, damage: ph.damage } : x)));
      setError("Couldn't save that. Try again when you have signal.");
    });
  };

  const Thumb = ({ p }: { p: CarPhoto | Pending }) => {
    const saved = 'damage' in p ? p : null;
    const isPending = !saved;
    return (
      <button className={`thumb-btn ${saved?.damage ? 'damage' : ''}`} onClick={() => setViewing(p)}>
        <img src={p.url} alt={sideLabel(p.side)} />
        <span className="thumb-meta">
          {isPending ? ((p as Pending).failed ? 'Waiting for signal…' : 'Uploading…') : time(p.takenAt)}
          {saved?.damage && <b> · Damage</b>}
        </span>
      </button>
    );
  };

  const closeups = all.filter((p) => p.side === 'closeup');
  const done = SIDES.filter((s) => all.some((p) => p.side === s.side)).length;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog photos" role="dialog" aria-label="Walkaround photos">
        <header>
          <h2>
            Walkaround · #{car.ticket || car.plate}
          </h2>
          <div className="grow" />
          <span className={`pill ${done === 4 ? 'green' : ''}`}>{done}/4 sides</span>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="hint">Tap a side to take its photo. Mark anything already scratched or dented, so it's on record before the car moves.</p>
        {error && <p className="warn">{error}</p>}
        {!photos ? (
          <p className="muted">Loading photos…</p>
        ) : (
          <>
            <div className="sides">
              {SIDES.map(({ side, label }) => {
                const shots = all.filter((p) => p.side === side);
                const last = shots[shots.length - 1];
                return (
                  <div key={side} className="side">
                    <span className="side-label">{label}</span>
                    {last ? (
                      <Thumb p={last} />
                    ) : (
                      <button className="shoot" onClick={() => take(side)}>
                        <span aria-hidden>📷</span>
                        Take photo
                      </button>
                    )}
                    {last && (
                      <button className="link retake" onClick={() => take(side)}>
                        Add another
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <h3>Close-ups of damage</h3>
            <div className="closeups">
              {closeups.map((p) => (
                <Thumb key={p.id} p={p} />
              ))}
              <button className="shoot small" onClick={() => take('closeup')}>
                <span aria-hidden>＋</span>
                Close-up
              </button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {viewing && (
        <div className="photo-view" onPointerDown={(e) => e.target === e.currentTarget && setViewing(null)}>
          <img src={viewing.url} alt={sideLabel(viewing.side)} />
          <div className="photo-view-bar">
            <span>
              {sideLabel(viewing.side)} · {new Date(viewing.takenAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              {'takenByName' in viewing && viewing.takenByName ? ` · ${viewing.takenByName}` : ''}
            </span>
            {'damage' in viewing && (
              <button className={viewing.damage ? 'danger on' : ''} onClick={() => toggleDamage(viewing)}>
                {viewing.damage ? 'Damage marked' : 'Mark damage'}
              </button>
            )}
            <button onClick={() => setViewing(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
