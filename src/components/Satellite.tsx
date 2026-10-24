import { useLayoutEffect, useRef, useState } from 'react';
import { TILE, UNITS_PER_METER, placeBackdrop, searchPlaces, tileZoom, tilesFor, type Place } from '../backdrop';
import type { LotMap, MapBackdrop } from '../types';

/** The satellite photo, drawn in map coordinates under the objects. */
export function SatelliteLayer({ backdrop: b, view }: { backdrop: MapBackdrop; view: { x: number; y: number; z: number } }) {
  const ref = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const svg = ref.current?.ownerSVGElement;
    if (!svg) return;
    const read = () => {
      const r = svg.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const area = { x: -view.x / view.z, y: -view.y / view.z, w: size.w / view.z, h: size.h / view.z };
  const z = tileZoom(b, view.z, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  // a blurry layer of big tiles underneath, so there are no holes while the sharp ones load
  const layers = size.w ? [...(z > 4 ? [tilesFor(b, z - 3, area)] : []), tilesFor(b, z, area)] : [];
  return (
    <g ref={ref} opacity={b.opacity} pointerEvents="none" className="satellite">
      {layers.map((l) => (
        <g key={l.z} transform={`translate(${b.x} ${b.y}) rotate(${b.rotation}) scale(${l.k}) translate(${-l.ax} ${-l.ay})`}>
          {l.tiles.map((t) => (
            // a hair of overlap hides the seams between tiles
            <image key={t.key} href={t.url} x={t.x} y={t.y} width={TILE + 0.6} height={TILE + 0.6} />
          ))}
        </g>
      ))}
    </g>
  );
}

/** Search for the venue (or use this phone's location) and pick the right place. */
export function PlaceSearch({ onPick, autoFocus, children }: { onPick: (p: Place) => void; autoFocus?: boolean; children?: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);

  const pick = (p: Place) => {
    setResults(null);
    setQ('');
    onPick(p);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const found = await searchPlaces(q.trim());
      setResults(found);
      if (!found.length) setErr('Nothing found. Try the street address with the city.');
    } catch (ex) {
      // a dropped connection says "Failed to fetch": say it in plain words
      setErr(ex instanceof TypeError ? "Couldn't search. Check your internet and try again." : ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  const here = () => {
    if (!navigator.geolocation) return setErr('This device cannot share its location.');
    setBusy(true);
    setErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        pick({ name: 'My location', lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(false);
        setErr('Could not get your location. Type the address instead.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <>
      <form className="sat-search" onSubmit={search}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Venue name or address"
          aria-label="Venue name or address"
          enterKeyHint="search"
          autoFocus={autoFocus}
        />
        <button type="submit" className="primary" disabled={busy || !q.trim()}>
          {busy ? '…' : 'Search'}
        </button>
      </form>
      {results && results.length > 0 && (
        <div className="sat-results">
          <p className="hint">Tap the right one:</p>
          {results.map((r) => (
            <button key={`${r.lat},${r.lng}`} onClick={() => pick(r)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      {err && <p className="warn">{err}</p>}
      <div className="actions">
        <button onClick={here} disabled={busy}>
          📍 I'm there now
        </button>
        {children}
      </div>
    </>
  );
}

/** The "Satellite photo" part of the lot panel. */
export function SatellitePanel({
  map,
  onChange,
  onAlign,
}: {
  map: LotMap;
  onChange: (b: MapBackdrop | undefined) => void;
  onAlign: () => void;
}) {
  const b = map.backdrop;
  const [picking, setPicking] = useState(false);

  const place = (p: Place) => {
    // keep how it's lined up when only the place changes
    const next = placeBackdrop(p.lat, p.lng, map, p.name);
    onChange(b ? { ...next, scale: b.scale, rotation: b.rotation, opacity: b.opacity } : next);
    setPicking(false);
    onAlign();
  };

  if (b && !picking) {
    return (
      <div className="field satellite-panel">
        <span>Photo of your real lot</span>
        <p className="sat-place" title={b.place}>
          {b.place || 'Placed on the map'}
        </p>
        <label className="field check sat-show">
          <input type="checkbox" checked={!b.hidden} onChange={(e) => onChange({ ...b, hidden: !e.target.checked })} />
          <span>Show the photo</span>
        </label>
        {!b.hidden && (
          <label className="sat-range">
            <span>Fade</span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={b.opacity}
              onChange={(e) => onChange({ ...b, opacity: parseFloat(e.target.value) })}
              aria-label="Photo strength"
            />
          </label>
        )}
        <div className="actions">
          <button className="primary" onClick={onAlign} disabled={b.hidden}>
            Move the photo
          </button>
          <button onClick={() => setPicking(true)}>Change place</button>
          <button className="danger" onClick={() => onChange(undefined)}>
            Remove photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field satellite-panel">
      <span>Photo of your real lot</span>
      {!b && <p className="hint">Put a satellite photo of your lot under the map, then trace your rows right on top of it.</p>}
      <PlaceSearch onPick={place} autoFocus={picking}>
        {picking && <button onClick={() => setPicking(false)}>Cancel</button>}
      </PlaceSearch>
    </div>
  );
}

/** Floating controls while lining the photo up with the drawing. */
export function AlignBar({ backdrop: b, onChange, onDone }: { backdrop: MapBackdrop; onChange: (b: MapBackdrop) => void; onDone: () => void }) {
  // size is a power of two so the slider feels even from small to big
  const sizeStep = Math.log2(b.scale / UNITS_PER_METER);
  return (
    <div className="align-bar" role="dialog" aria-label="Line up the satellite photo">
      <div className="align-head">
        <p>Drag the photo with your finger or mouse until it lines up with your lot. Tap Done when it looks right.</p>
        <button onClick={() => onChange({ ...b, scale: UNITS_PER_METER, rotation: 0 })}>Reset</button>
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </div>
      <label className="sat-range">
        <span>Size</span>
        <input
          type="range"
          min={-2}
          max={2}
          step={0.01}
          value={sizeStep}
          onChange={(e) => onChange({ ...b, scale: UNITS_PER_METER * 2 ** parseFloat(e.target.value) })}
          aria-label="Photo size"
        />
        <output>{Math.round(2 ** sizeStep * 100)}%</output>
      </label>
      <label className="sat-range">
        <span>Turn</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={0.5}
          value={b.rotation}
          onChange={(e) => onChange({ ...b, rotation: parseFloat(e.target.value) })}
          aria-label="Photo turn"
        />
        <output>{b.rotation}°</output>
      </label>
      <label className="sat-range">
        <span>Fade</span>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={b.opacity}
          onChange={(e) => onChange({ ...b, opacity: parseFloat(e.target.value) })}
          aria-label="Photo strength"
        />
        <output>{Math.round(b.opacity * 100)}%</output>
      </label>
    </div>
  );
}
