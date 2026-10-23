import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CarDetails } from '../data/source';
import { CAR_COLORS, CAR_MAKES, carMatches, colorHex, formatElapsed, nextOpenSpot } from '../ops';
import type { CarRequest, LotEvent, ParkedCar, Spot } from '../types';
import { EventCard } from './EventMode';
import { carsWithKeysOut, hookTaken, keyHook, KEYS_LATE_MS } from '../keys';
import { matchPlate } from '../plates';
import { blockedBy, blockersOf, carsNear } from '../stacks';
import { RequestQueue, RequestStatus, type RequestActions } from './RequestQueue';
import { SheetHandle } from './SheetHandle';

// opened now and then: loaded the first time they're needed
const PlateScanner = lazy(() => import('./PlateScanner').then((m) => ({ default: m.PlateScanner })));

type NewCar = Omit<ParkedCar, 'id' | 'mapId' | 'spotKey' | 'spotLabel' | 'parkedAt' | 'keysWith' | 'keysWithName' | 'keysOutAt' | 'blocks'> & { blocks: string[] };

interface Props extends RequestActions {
  /** open and claimed requests for this lot */
  requests: CarRequest[];
  me: string;
  onRequest: (car: ParkedCar, dueAt?: number) => void;
  onRequestTag: (tag: string, dueAt?: number) => string | null;
  /** event mode: the event, cars out since its let-out, and where the stand is on this lot */
  event: LotEvent | null;
  outSince: number;
  stand: { x: number; y: number };
  onEditEvent: () => void;
  /** my shift: "Clock in", or time on and today's pool; opens shift and tips */
  shift: { on: boolean; time: string; pool: string };
  onShift: () => void;
  /** the let-out time while it's still ahead */
  preUntil?: number;
  /** show the guest's QR and link (team accounts only) */
  onGuestLink?: (car: ParkedCar) => void;
  /** walkaround damage photos */
  onPhotos: (car: ParkedCar) => void;
  /** file an incident report about this car */
  onIncident: (car: ParkedCar) => void;
  spots: Spot[];
  /** cars on this map */
  cars: ParkedCar[];
  /** cars on every map, so a tag isn't handed out twice across a stand */
  allCars: ParkedCar[];
  /** cars on this map whose spot no longer exists */
  orphans: ParkedCar[];
  active: Spot | null;
  now: number;
  moving: ParkedCar | null;
  /** suggested tag number for the next car */
  suggestedTag: string;
  onPark: (spot: Spot, car: NewCar) => void;
  onUpdate: (car: ParkedCar, patch: CarDetails) => void;
  onRetrieve: (car: ParkedCar) => void;
  /** which parked cars this one blocks in */
  onBlocks: (car: ParkedCar, blocks: string[]) => void;
  /** keys off the board with me, or back on their hook */
  onKeys: (car: ParkedCar, out: boolean) => void;
  onStartMove: (car: ParkedCar | null) => void;
  onFocus: (spot: Spot) => void;
  /** jump to a car or spot on any map, as the top search does */
  onFind: (q: string) => void;
  open: boolean;
  onClose: () => void;
}

const EMPTY: NewCar = { ticket: '', color: '', make: '', plate: '', vehicle: '', ownerName: '', ownerPhone: '', notes: '', keySlot: '', blocks: [] };

function ColorDot({ name, size = 14 }: { name: string; size?: number }) {
  const hex = colorHex(name);
  if (!hex) return null;
  return <i className="color-dot" style={{ background: hex, width: size, height: size }} title={name} />;
}

function carTitle(c: Pick<ParkedCar, 'color' | 'make' | 'vehicle'>) {
  return [c.color, c.make, c.vehicle].filter(Boolean).join(' ') || 'Car';
}

const tagOf = (c: ParkedCar) => (c.ticket ? `#${c.ticket}` : c.plate || 'Car');

/** Tap the cars this one is parked in front of. Only neighbours are offered. */
function BlocksPicker({ options, value, onChange }: { options: ParkedCar[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips blocks-pick" role="group" aria-label="Cars this one blocks in">
      {options.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            type="button"
            key={c.id}
            aria-pressed={on}
            className={on ? 'on' : ''}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
          >
            {tagOf(c)} · {c.spotLabel}
          </button>
        );
      })}
    </div>
  );
}

/** makes shown before "More": enough for most cars without pushing the Park button down */
const TOP_MAKES = 8;

/** Big tap targets for color and make: nothing to type at rush. */
function Chips({ value, onChange, color }: { value: Pick<NewCar, 'color' | 'make'>; onChange: (v: Partial<NewCar>) => void; color?: boolean }) {
  const [allMakes, setAllMakes] = useState(false);
  if (color)
    return (
      <div className="chips colors" role="radiogroup" aria-label="Color">
        {CAR_COLORS.map((c) => (
          <button
            type="button"
            key={c.name}
            role="radio"
            aria-checked={value.color === c.name}
            className={`color-chip ${value.color === c.name ? 'on' : ''}`}
            style={{ background: c.hex }}
            title={c.name}
            aria-label={c.name}
            onClick={() => onChange({ color: value.color === c.name ? '' : c.name })}
          />
        ))}
      </div>
    );
  return (
    <div className="chips makes" role="radiogroup" aria-label="Make">
      {CAR_MAKES.filter((m, i) => allMakes || i < TOP_MAKES || m === value.make).map((m) => (
        <button
          type="button"
          key={m}
          role="radio"
          aria-checked={value.make === m}
          className={value.make === m ? 'on' : ''}
          onClick={() => onChange({ make: value.make === m ? '' : m })}
        >
          {m}
        </button>
      ))}
      {!allMakes && (
        <button type="button" className="more-makes" onClick={() => setAllMakes(true)}>
          More…
        </button>
      )}
    </div>
  );
}

function DetailFields({ form, set, onScan }: { form: NewCar; set: (v: Partial<NewCar>) => void; onScan: () => void }) {
  const field = (k: keyof NewCar, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} {...extra} />
    </label>
  );
  return (
    <>
      <label className="field">
        <span>License plate</span>
        <div className="with-btn">
          <input value={form.plate} autoCapitalize="characters" onChange={(e) => set({ plate: e.target.value })} />
          <button type="button" className="scan-btn" onClick={onScan} aria-label="Scan plate with camera">
            📷
          </button>
        </div>
      </label>
      <div className="row2">
        {field('vehicle', 'Model', { placeholder: 'Model 3, Camry…' })}
        {field('keySlot', 'Key hook or box', { placeholder: form.ticket.trim() ? `Same as tag (${form.ticket.trim()})` : 'Same as tag' })}
      </div>
      <div className="row2">
        {field('ownerName', 'Owner name')}
        {field('ownerPhone', 'Owner phone', { type: 'tel', inputMode: 'tel' })}
      </div>
      {field('notes', 'Notes', { placeholder: 'Keys in box 4, scratch on bumper…' })}
    </>
  );
}

export function LivePanel(p: Props) {
  const [form, setForm] = useState<NewCar>({ ...EMPTY, ticket: p.suggestedTag });
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState<NewCar | null>(null);
  const [q, setQ] = useState('');
  const [scan, setScan] = useState<'park' | 'edit' | 'find' | null>(null);
  const [pickBlocks, setPickBlocks] = useState(false);
  const tagRef = useRef<HTMLInputElement>(null);
  const set = (v: Partial<NewCar>) => setForm((f) => ({ ...f, ...v }));

  // fresh form for each spot, with the next tag already filled in
  useEffect(() => {
    setForm({ ...EMPTY, ticket: p.suggestedTag });
    setMore(false);
    setEditing(null);
    setPickBlocks(false);
  }, [p.active?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setForm((f) => (f.ticket ? f : { ...f, ticket: p.suggestedTag })), [p.suggestedTag]);

  const bySpot = new Map(p.cars.map((c) => [c.spotKey, c]));
  const car = p.active ? bySpot.get(p.active.key) : undefined;
  const request = car ? p.requests.find((r) => r.carId === car.id) : undefined;
  const spotByKey = new Map(p.spots.map((s) => [s.key, s]));
  const taken = new Set(p.cars.map((c) => c.spotKey));
  const openSpot = nextOpenSpot(p.spots, taken, p.active?.key);
  const dupTag = !car && form.ticket.trim() && p.allCars.find((c) => c.ticket.trim() === form.ticket.trim());
  const dupPlate = !car && form.plate.trim() ? matchPlate(p.allCars, form.plate) : undefined;
  const dupHook = !car && form.keySlot?.trim() ? hookTaken(p.allCars, form.keySlot) : undefined;
  const keysOutList = carsWithKeysOut(p.allCars);
  const liveCarIds = new Set(p.requests.map((r) => r.carId));
  const neighbours = p.active ? carsNear(p.spots, p.cars, p.active) : [];
  const inTheWay = car ? blockersOf(p.allCars, car.id) : [];
  const blocking = car ? blockedBy(p.allCars, car) : [];
  // offer the neighbours, plus anything already marked that has since drifted out of range
  const blockOptions = car ? [...neighbours, ...blocking.filter((b) => !neighbours.includes(b))] : neighbours;
  const list = [...p.cars].sort((a, b) => a.parkedAt - b.parkedAt).filter((c) => carMatches(c, q));

  const park = () => {
    if (!p.active || (!form.ticket.trim() && !form.plate.trim())) {
      tagRef.current?.focus();
      return;
    }
    p.onPark(p.active, { ...form, ticket: form.ticket.trim(), plate: form.plate.trim().toUpperCase() });
  };

  return (
    <aside className={`inspector live ${p.open ? 'open' : ''}`}>
      <SheetHandle onClose={p.onClose} />
      <div className="stats">
        <div>
          <b>{p.cars.length}</b> parked
        </div>
        <div>
          <b>{Math.max(0, p.spots.length - (p.cars.length - p.orphans.length))}</b> open
        </div>
        <button className={`shift-tile ${p.shift.on ? 'on' : ''}`} onClick={p.onShift} aria-label="Shift and tips">
          {p.shift.on ? (
            <>
              <b>{p.shift.pool}</b> {p.shift.time}
            </>
          ) : (
            <>
              <b>Clock in</b> pool {p.shift.pool}
            </>
          )}
        </button>
      </div>

      {p.event && (
        <EventCard
          event={p.event}
          cars={p.allCars}
          spots={p.spots}
          mapCars={p.cars}
          stand={p.stand}
          requests={p.requests}
          outSince={p.outSince}
          onEdit={p.onEditEvent}
          onFind={p.onFind}
          onStartMove={(c) => p.onStartMove(c)}
        />
      )}

      <RequestQueue
        {...p}
        onFocus={(c) => {
          const s = spotByKey.get(c.spotKey);
          if (s) p.onFocus(s);
        }}
      />

      {p.moving && (
        <div className="moving">
          <span>
            Moving <b>#{p.moving.ticket || p.moving.plate}</b>: tap an open spot.
          </span>
          <button onClick={() => p.onStartMove(null)}>Cancel</button>
        </div>
      )}

      {p.orphans.length > 0 && !p.moving && (
        <section className="card orphans">
          <h2>
            Needs a spot <span className="pill red">{p.orphans.length}</span>
          </h2>
          <p className="hint">Their spot was removed or renumbered on the map. Move each car to where it really is, or mark it retrieved.</p>
          <ul className="orphan-list">
            {p.orphans.map((c) => (
              <li key={c.id}>
                <span className="tag-sm">{c.ticket ? `#${c.ticket}` : c.plate}</span>
                <span className="car-sm">
                  <ColorDot name={c.color} /> {c.make || carTitle(c)} · was {c.spotLabel || '?'}
                </span>
                <button onClick={() => p.onStartMove(c)}>Move</button>
                <button onClick={() => p.onRetrieve(c)}>Retrieved</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.active && car && !editing && (
        <section className="card">
          <h2>
            Spot {p.active.label} <span className="pill red">Taken</span>
          </h2>
          <div className="car-head">
            {car.ticket && <div className="tag">#{car.ticket}</div>}
            <div>
              <div className="car-title">
                <ColorDot name={car.color} size={16} /> {carTitle(car)}
              </div>
              {car.plate && <div className="plate-sm">{car.plate}</div>}
            </div>
          </div>
          <div className={`key-row ${car.keysWith ? 'out' : ''}`}>
            <span aria-hidden>🔑</span>
            <span className="key-where">
              {car.keysWith ? (
                <>
                  With <b>{car.keysWith === p.me ? 'you' : car.keysWithName || 'a valet'}</b>
                  {car.keysOutAt ? ` · ${formatElapsed(p.now - car.keysOutAt)}` : ''}
                </>
              ) : keyHook(car) ? (
                <>
                  On hook <b>{keyHook(car)}</b>
                </>
              ) : (
                'On the board'
              )}
            </span>
            <button onClick={() => p.onKeys(car, !car.keysWith)}>{car.keysWith ? `Back on ${keyHook(car) ? `hook ${keyHook(car)}` : 'board'}` : 'Take keys'}</button>
          </div>
          {inTheWay.length > 0 && (
            <div className="blocked-warn">
              <b>Blocked in.</b> Move first:
              {inTheWay.map((c) => (
                <button key={c.id} onClick={() => p.onFind(c.ticket || c.plate)}>
                  {tagOf(c)} · {c.spotLabel}
                </button>
              ))}
            </div>
          )}
          <dl>
            <dt>Parked</dt>
            <dd>
              {formatElapsed(p.now - car.parkedAt)} ago ·{' '}
              {new Date(car.parkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </dd>
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
            {blocking.length > 0 && (
              <>
                <dt>Blocking</dt>
                <dd>{blocking.map((c) => `${tagOf(c)} (${c.spotLabel})`).join(', ')}</dd>
              </>
            )}
            {car.notes && (
              <>
                <dt>Notes</dt>
                <dd>{car.notes}</dd>
              </>
            )}
          </dl>
          {request ? (
            <RequestStatus {...p} r={request} car={car} />
          ) : p.preUntil ? (
            <div className="request-pair">
              <button className="big request-btn" onClick={() => p.onRequest(car)}>
                Request now
              </button>
              <button className="big request-later" onClick={() => p.onRequest(car, p.preUntil)}>
                At let-out
              </button>
            </div>
          ) : (
            <button className="big request-btn" onClick={() => p.onRequest(car)}>
              Request car
            </button>
          )}
          {/* with a request open, its own buttons lead; this stays as the shortcut */}
          <button className={request ? 'retrieve-alt' : 'primary big'} onClick={() => p.onRetrieve(car)}>
            Car retrieved
          </button>
          <div className="actions">
            <button onClick={() => p.onPhotos(car)}>📷 Photos</button>
            {p.onGuestLink && car.guestToken && <button onClick={() => p.onGuestLink!(car)}>Guest link</button>}
            <button onClick={() => p.onStartMove(car)}>Move</button>
            {blockOptions.length > 0 && (
              <button className={pickBlocks ? 'on' : ''} aria-expanded={pickBlocks} onClick={() => setPickBlocks(!pickBlocks)}>
                Blocking…
              </button>
            )}
            <button onClick={() => setEditing({ ...EMPTY, ...car })}>
              {car.plate && car.color && car.ownerName ? 'Edit details' : 'Add details'}
            </button>
            <button onClick={() => p.onIncident(car)}>Report incident</button>
          </div>
          {pickBlocks && (
            <div className="blocks-edit">
              <p className="hint">Which cars is {tagOf(car)} parked in front of? A request for one of them will say to move this car first.</p>
              <BlocksPicker options={blockOptions} value={car.blocks ?? []} onChange={(v) => p.onBlocks(car, v)} />
            </div>
          )}
        </section>
      )}

      {p.active && car && editing && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const { ticket, color, make, plate, vehicle, ownerName, ownerPhone, notes, keySlot } = editing;
            p.onUpdate(car, { ticket, color, make, plate: plate.toUpperCase(), vehicle, ownerName, ownerPhone, notes, keySlot: keySlot?.trim() ?? '' });
            setEditing(null);
          }}
        >
          <h2>Spot {p.active.label} · details</h2>
          <label className="field">
            <span>Tag #</span>
            <input value={editing.ticket} inputMode="numeric" onChange={(e) => setEditing({ ...editing, ticket: e.target.value })} />
          </label>
          <Chips color value={editing} onChange={(v) => setEditing({ ...editing, ...v })} />
          <Chips value={editing} onChange={(v) => setEditing({ ...editing, ...v })} />
          <DetailFields form={editing} set={(v) => setEditing({ ...editing, ...v })} onScan={() => setScan('edit')} />
          <div className="actions">
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {p.active && !car && !p.moving && (
        <form
          className="card quick"
          onSubmit={(e) => {
            e.preventDefault();
            park();
          }}
        >
          <h2>
            Park in {p.active.label} <span className="pill green">Open</span>
          </h2>
          <label className="field tag-field">
            <span>Tag #</span>
            <input
              ref={tagRef}
              value={form.ticket}
              inputMode="numeric"
              enterKeyHint="go"
              onFocus={(e) => e.target.select()}
              onChange={(e) => set({ ticket: e.target.value })}
              aria-label="Key tag number"
            />
          </label>
          {dupTag && <p className="warn">Tag #{form.ticket} is already parked in {dupTag.spotLabel}.</p>}
          <Chips color value={form} onChange={set} />
          <Chips value={form} onChange={set} />
          {neighbours.length > 0 &&
            (pickBlocks || form.blocks.length ? (
              <div className="field">
                <span>Parked in front of (tandem, ramp)</span>
                <BlocksPicker options={neighbours} value={form.blocks} onChange={(blocks) => set({ blocks })} />
              </div>
            ) : (
              <button type="button" className="link more" onClick={() => setPickBlocks(true)}>
                + Blocking a car in?
              </button>
            ))}
          {more ? (
            <DetailFields form={form} set={set} onScan={() => setScan('park')} />
          ) : (
            <div className="more-row">
              <button type="button" className="scan-plate" onClick={() => setScan('park')}>
                📷 Scan plate
              </button>
              <button type="button" className="link more" onClick={() => setMore(true)}>
                + Plate, owner, notes
              </button>
            </div>
          )}
          {dupHook && (
            <p className="warn">
              Hook {keyHook(dupHook)} already has the keys for {dupHook.ticket ? `#${dupHook.ticket}` : carTitle(dupHook)} in {dupHook.spotLabel}.
            </p>
          )}
          {dupPlate && (
            <p className="warn">
              Plate {dupPlate.plate} is already parked in {dupPlate.spotLabel}
              {dupPlate.ticket ? ` (#${dupPlate.ticket})` : ''}.
            </p>
          )}
          <button className="primary big" type="submit">
            Park {form.ticket ? `#${form.ticket}` : ''} in {p.active.label}
          </button>
        </form>
      )}

      {!p.active && !p.moving && (
        <div className="card empty-state">
          <p>Tap an open spot on the map to park a car.</p>
          {openSpot && (
            <button className="primary" onClick={() => p.onFocus(openSpot)}>
              Next open: {openSpot.label}
            </button>
          )}
        </div>
      )}

      {keysOutList.length > 0 && (
        <section className="keys-out">
          <h3>
            Keys out <span className="pill">{keysOutList.length}</span>
          </h3>
          <ul>
            {keysOutList.map((c) => {
              const late = !liveCarIds.has(c.id) && p.now - (c.keysOutAt ?? p.now) > KEYS_LATE_MS;
              return (
                <li key={c.id} className={late ? 'late' : ''}>
                  <button className="key-car" onClick={() => p.onFind(c.ticket || c.plate)}>
                    <span className="tag-sm">{c.ticket ? `#${c.ticket}` : c.plate}</span>
                    <span className="car-sm">
                      {c.keysWith === p.me ? 'You' : c.keysWithName || 'A valet'} · {formatElapsed(p.now - (c.keysOutAt ?? p.now))}
                    </span>
                  </button>
                  <button onClick={() => p.onKeys(c, false)} aria-label={`Keys for ${c.ticket ? `#${c.ticket}` : c.plate} are back`}>
                    {keyHook(c) ? `Hang on ${keyHook(c)}` : 'Hang up'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h3>Parked cars</h3>
      <div className="with-btn search-row">
        <input className="search" placeholder="Search tag, plate, owner, color" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="scan-btn" onClick={() => setScan('find')} aria-label="Find a car by scanning its plate">
          📷
        </button>
      </div>
      <ul className="car-list">
        {list.map((c) => {
          const spot = spotByKey.get(c.spotKey);
          return (
            <li key={c.id}>
              <button onClick={() => spot && p.onFocus(spot)} disabled={!spot} className={spot?.key === p.active?.key ? 'on' : ''}>
                <span className="tag-sm">{c.ticket ? `#${c.ticket}` : '—'}</span>
                <span className="car-sm">
                  <ColorDot name={c.color} /> {c.make || c.plate || carTitle(c)}
                </span>
                <span className="spot">{spot?.label ?? c.spotLabel}</span>
                <span className="time">{formatElapsed(p.now - c.parkedAt)}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="empty">{p.cars.length ? 'No matches' : 'No cars parked yet'}</li>}
      </ul>

      {scan && (
        <Suspense fallback={null}>
          <PlateScanner
            title={scan === 'find' ? 'Find a car by plate' : 'Scan plate'}
            useLabel={scan === 'find' ? 'Find car' : 'Use plate'}
            describe={(plate) => {
              const hit = matchPlate(p.allCars, plate);
              if (scan === 'find')
                return hit ? (
                  <>
                    {hit.ticket && <b>#{hit.ticket}</b>} {carTitle(hit)} · {hit.spotLabel}
                  </>
                ) : (
                  <span className="muted">No parked car has this plate.</span>
                );
              return hit && hit.id !== car?.id ? (
                <span className="warn-text">
                  Already parked in {hit.spotLabel}
                  {hit.ticket ? ` (#${hit.ticket})` : ''}
                </span>
              ) : null;
            }}
            onUse={(plate) => {
              setScan(null);
              if (scan === 'park') {
                set({ plate });
                setMore(true);
              } else if (scan === 'edit') setEditing((e) => e && { ...e, plate });
              else {
                const hit = matchPlate(p.allCars, plate);
                if (hit) {
                  setQ('');
                  p.onFind(hit.plate);
                } else setQ(plate);
              }
            }}
            onClose={() => setScan(null)}
          />
        </Suspense>
      )}
    </aside>
  );
}
