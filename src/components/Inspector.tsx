import { useEffect, useState } from 'react';
import { ASSETS, SURFACES, SWATCHES, assetFor } from '../assets';
import { rowNumbers, spotLabel } from '../geometry';
import type { LotMap, MapItem } from '../types';
import { SheetHandle } from './SheetHandle';
import { SatellitePanel } from './Satellite';

interface Props {
  map: LotMap;
  selected: MapItem[];
  spotCount: number;
  duplicates: string[];
  onPatch: (id: string, patch: Partial<MapItem>, key: string) => void;
  onMeta: (patch: Partial<LotMap>) => void;
  onFitLot: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate: (deg: number) => void;
  onOrder: (where: 'front' | 'back') => void;
  open: boolean;
  onClose: () => void;
  /** start lining up the satellite photo on the map */
  onAlign: () => void;
  /** stop editing the picked thing and go back to the lot */
  onDone: () => void;
  showGrid: boolean;
  onShowGrid: (on: boolean) => void;
  snapOn: boolean;
  onSnap: (on: boolean) => void;
}

/** Number field that lets you clear it while typing without snapping back to 0. */
function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(round(value)));
  useEffect(() => setText(String(round(value))), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
        }}
      />
    </label>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="field">
      <span>Color</span>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`Color ${c}`}
            aria-pressed={c.toLowerCase() === value.toLowerCase()}
          />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </div>
    </div>
  );
}

/** Big − 10 + buttons: easier than typing a number, especially on a phone. */
export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 200,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v))));
  return (
    <div className="field">
      <span>{label}</span>
      <div className="stepper">
        <button onClick={() => set(value - 1)} disabled={value <= min} aria-label={`One less ${unit ?? ''}`.trim()}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={text}
          aria-label={label}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v >= min) set(v);
          }}
          onBlur={() => setText(String(value))}
        />
        <button onClick={() => set(value + 1)} disabled={value >= max} aria-label={`One more ${unit ?? ''}`.trim()}>
          +
        </button>
      </div>
    </div>
  );
}

/** Turn, copy and delete: the same three big buttons for one thing or several. */
function MainActions({ p }: { p: Props }) {
  return (
    <div className="big-actions">
      <button onClick={() => p.onRotate(90)}>
        <i aria-hidden>↻</i>Turn
      </button>
      <button onClick={p.onDuplicate}>
        <i aria-hidden>⧉</i>Copy
      </button>
      <button className="danger" onClick={p.onDelete}>
        <i aria-hidden>🗑</i>Delete
      </button>
    </div>
  );
}

function Heading({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="insp-head">
      <h2>{title}</h2>
      <button className="primary done" onClick={onDone}>
        ✓ Done
      </button>
    </div>
  );
}

export function Inspector(p: Props) {
  const { map, selected } = p;

  if (selected.length === 0) {
    return (
      <aside className={`inspector ${p.open ? 'open' : ''}`}>
        <SheetHandle onClose={p.onClose} />
        <h2>Your lot</h2>
        <label className="field">
          <span>Lot name</span>
          <input value={map.name} placeholder="Example: Front lot" onChange={(e) => p.onMeta({ name: e.target.value })} />
        </label>
        <SatellitePanel map={map} onChange={(backdrop) => p.onMeta({ backdrop })} onAlign={p.onAlign} />
        <div className="field">
          <span>Ground</span>
          <div className="surfaces">
            {SURFACES.map((s) => (
              <button
                key={s.color}
                className={`surface ${s.color === map.surface ? 'on' : ''}`}
                onClick={() => p.onMeta({ surface: s.color })}
              >
                <i style={{ background: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="stats">
          <div>
            <b>{p.spotCount}</b> parking spots
          </div>
          <div>
            <b>{map.items.length}</b> things on the map
          </div>
        </div>
        {p.duplicates.length > 0 && (
          <p className="warn">
            Some spot numbers are used twice: {p.duplicates.slice(0, 8).join(', ')}
            {p.duplicates.length > 8 ? '…' : ''}. Give those rows different letters so valets can tell them apart.
          </p>
        )}
        <details className="more">
          <summary>More options</summary>
          <p className="hint lot-hint">
            <i className="lot-swatch" /> To make the lot bigger or smaller, drag the orange handles on its edges. It also grows by itself
            when you put something past the edge.
          </p>
          <div className="row2">
            <NumberField label="Width" value={map.width} min={100} onChange={(v) => p.onMeta({ width: v })} />
            <NumberField label="Height" value={map.height} min={100} onChange={(v) => p.onMeta({ height: v })} />
          </div>
          <button className="fit-lot" onClick={p.onFitLot} disabled={!map.items.length}>
            Shrink the lot to fit what's on it
          </button>
          <label className="field check">
            <input type="checkbox" checked={p.showGrid} onChange={(e) => p.onShowGrid(e.target.checked)} />
            <span>Show grid lines</span>
          </label>
          <label className="field check">
            <input type="checkbox" checked={p.snapOn} onChange={(e) => p.onSnap(e.target.checked)} />
            <span>Line things up neatly when moving them</span>
          </label>
        </details>
      </aside>
    );
  }

  if (selected.length > 1) {
    return (
      <aside className={`inspector ${p.open ? 'open' : ''}`}>
        <SheetHandle onClose={p.onClose} />
        <Heading title={`${selected.length} things picked`} onDone={p.onDone} />
        <p className="hint">Drag any of them to move them all together.</p>
        <MainActions p={p} />
      </aside>
    );
  }

  const it = selected[0];
  const def = assetFor(it);
  const set = (patch: Partial<MapItem>, key: string) => p.onPatch(it.id, patch, `${it.id}:${key}`);
  const nums = it.kind === 'spaceRow' ? rowNumbers(it) : [];
  const title = it.kind === 'space' && it.accessible ? 'Accessible space' : (ASSETS.find((a) => a.kind === it.kind)?.name ?? 'Item');

  return (
    <aside className={`inspector ${p.open ? 'open' : ''}`}>
      <SheetHandle onClose={p.onClose} />
      <Heading title={title} onDone={p.onDone} />
      <p className="hint">Drag it on the map to move it. Drag the white squares to stretch it.</p>

      {it.kind === 'spaceRow' && (
        <>
          <Stepper
            label="Number of spaces"
            unit="space"
            value={it.count ?? 1}
            onChange={(count) => {
              // keep each space the same width when changing the count
              const cw = it.w / (it.count ?? 1);
              set({ count, w: cw * count }, 'count');
            }}
          />
          <label className="field">
            <span>Row letter</span>
            <input value={it.prefix ?? ''} placeholder="none" maxLength={4} onChange={(e) => set({ prefix: e.target.value }, 'prefix')} />
          </label>
          <p className="hint">
            Spots are numbered <b>{spotLabel(it.prefix, nums[0])}</b> to <b>{spotLabel(it.prefix, nums[nums.length - 1])}</b>
          </p>
        </>
      )}

      {def.hasLabel && (
        <label className="field">
          <span>{it.kind === 'space' ? 'Spot number' : 'Words shown on it'}</span>
          <input value={it.label ?? ''} onChange={(e) => set({ label: e.target.value }, 'label')} />
        </label>
      )}

      {it.kind === 'space' && (
        <label className="field check">
          <input type="checkbox" checked={!!it.accessible} onChange={(e) => set({ accessible: e.target.checked }, 'accessible')} />
          <span>Accessible (handicap) spot</span>
        </label>
      )}

      <MainActions p={p} />

      {def.hasColor && <Colors value={it.color ?? '#ffffff'} onChange={(c) => set({ color: c }, 'color')} />}

      <details className="more">
        <summary>More options</summary>
        {it.kind === 'spaceRow' && (
          <>
            <NumberField label="First spot number" value={it.start ?? 1} onChange={(v) => set({ start: Math.round(v) }, 'start')} />
            <label className="field check">
              <input type="checkbox" checked={!!it.reverse} onChange={(e) => set({ reverse: e.target.checked }, 'reverse')} />
              <span>Number from the other end</span>
            </label>
          </>
        )}
        {it.kind === 'label' && (
          <NumberField label="Text size" value={it.fontSize ?? 20} min={6} onChange={(v) => set({ fontSize: v }, 'fontSize')} />
        )}
        <div className="row2">
          <NumberField label="Length" value={it.w} min={4} onChange={(v) => set({ w: v }, 'w')} />
          <NumberField label="Depth" value={it.h} min={4} onChange={(v) => set({ h: v }, 'h')} />
        </div>
        <NumberField label="Exact angle (degrees)" value={it.rotation} onChange={(v) => set({ rotation: v }, 'rotation')} />
        <div className="row2">
          <NumberField label="Left–right position" value={it.x} onChange={(v) => set({ x: v }, 'x')} />
          <NumberField label="Up–down position" value={it.y} onChange={(v) => set({ y: v }, 'y')} />
        </div>
        <div className="actions">
          <button onClick={() => p.onOrder('front')}>Bring to front</button>
          <button onClick={() => p.onOrder('back')}>Send to back</button>
        </div>
      </details>
    </aside>
  );
}
