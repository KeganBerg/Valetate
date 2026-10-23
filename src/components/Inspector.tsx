import { useEffect, useState } from 'react';
import { ASSETS, SURFACES, SWATCHES, assetFor } from '../assets';
import { rowNumbers, spotLabel } from '../geometry';
import type { LotMap, MapItem } from '../types';
import { SheetHandle } from './SheetHandle';

interface Props {
  map: LotMap;
  selected: MapItem[];
  spotCount: number;
  duplicates: string[];
  onPatch: (id: string, patch: Partial<MapItem>, key: string) => void;
  onMeta: (patch: Partial<LotMap>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate: (deg: number) => void;
  onOrder: (where: 'front' | 'back') => void;
  open: boolean;
  onClose: () => void;
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
          />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </div>
    </div>
  );
}

export function Inspector(p: Props) {
  const { map, selected } = p;

  if (selected.length === 0) {
    return (
      <aside className={`inspector ${p.open ? 'open' : ''}`}>
        <SheetHandle onClose={p.onClose} />
        <h2>Lot</h2>
        <label className="field">
          <span>Name</span>
          <input value={map.name} onChange={(e) => p.onMeta({ name: e.target.value })} />
        </label>
        <div className="row2">
          <NumberField label="Width" value={map.width} min={100} onChange={(v) => p.onMeta({ width: v })} />
          <NumberField label="Height" value={map.height} min={100} onChange={(v) => p.onMeta({ height: v })} />
        </div>
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
            <b>{map.items.length}</b> objects
          </div>
        </div>
        {p.duplicates.length > 0 && (
          <p className="warn">
            Some spot numbers are used twice: {p.duplicates.slice(0, 8).join(', ')}
            {p.duplicates.length > 8 ? '…' : ''}. Give those rows different letters so valets can tell them apart.
          </p>
        )}
        <p className="hint">Pick something on the left to add it. Click anything on the map to edit it.</p>
      </aside>
    );
  }

  if (selected.length > 1) {
    return (
      <aside className={`inspector ${p.open ? 'open' : ''}`}>
        <SheetHandle onClose={p.onClose} />
        <h2>{selected.length} selected</h2>
        <div className="actions">
          <button onClick={() => p.onRotate(90)}>Rotate 90°</button>
          <button onClick={p.onDuplicate}>Duplicate</button>
          <button className="danger" onClick={p.onDelete}>
            Delete
          </button>
        </div>
      </aside>
    );
  }

  const it = selected[0];
  const def = assetFor(it);
  const set = (patch: Partial<MapItem>, key: string) => p.onPatch(it.id, patch, `${it.id}:${key}`);
  const nums = it.kind === 'spaceRow' ? rowNumbers(it) : [];

  return (
    <aside className={`inspector ${p.open ? 'open' : ''}`}>
        <SheetHandle onClose={p.onClose} />
      <h2>{it.kind === 'space' && it.accessible ? 'Accessible space' : ASSETS.find((a) => a.kind === it.kind)?.name}</h2>
      {def.hint && <p className="hint">{def.hint}</p>}

      {it.kind === 'spaceRow' && (
        <>
          <div className="row2">
            <label className="field">
              <span>Row letter</span>
              <input value={it.prefix ?? ''} placeholder="none" onChange={(e) => set({ prefix: e.target.value }, 'prefix')} />
            </label>
            <NumberField label="First #" value={it.start ?? 1} onChange={(v) => set({ start: Math.round(v) }, 'start')} />
          </div>
          <div className="row2">
            <NumberField
              label="Spaces"
              value={it.count ?? 1}
              min={1}
              onChange={(v) => {
                // keep each space the same width when changing the count
                const count = Math.max(1, Math.min(200, Math.round(v)));
                const cw = it.w / (it.count ?? 1);
                set({ count, w: cw * count }, 'count');
              }}
            />
            <label className="field check">
              <input type="checkbox" checked={!!it.reverse} onChange={(e) => set({ reverse: e.target.checked }, 'reverse')} />
              <span>Count from other end</span>
            </label>
          </div>
          <p className="hint">
            Spots {spotLabel(it.prefix, nums[0])} … {spotLabel(it.prefix, nums[nums.length - 1])}
          </p>
        </>
      )}

      {def.hasLabel && (
        <label className="field">
          <span>{it.kind === 'space' ? 'Spot number' : 'Text'}</span>
          <input value={it.label ?? ''} onChange={(e) => set({ label: e.target.value }, 'label')} />
        </label>
      )}

      {it.kind === 'space' && (
        <label className="field check">
          <input type="checkbox" checked={!!it.accessible} onChange={(e) => set({ accessible: e.target.checked }, 'accessible')} />
          <span>Accessible (ADA)</span>
        </label>
      )}

      {it.kind === 'label' && (
        <NumberField label="Text size" value={it.fontSize ?? 20} min={6} onChange={(v) => set({ fontSize: v }, 'fontSize')} />
      )}

      {def.hasColor && <Colors value={it.color ?? '#ffffff'} onChange={(c) => set({ color: c }, 'color')} />}

      <div className="row2">
        <NumberField label="X" value={it.x} onChange={(v) => set({ x: v }, 'x')} />
        <NumberField label="Y" value={it.y} onChange={(v) => set({ y: v }, 'y')} />
      </div>
      <div className="row2">
        <NumberField label="Length" value={it.w} min={4} onChange={(v) => set({ w: v }, 'w')} />
        <NumberField label="Depth" value={it.h} min={4} onChange={(v) => set({ h: v }, 'h')} />
      </div>
      <NumberField label="Rotation °" value={it.rotation} onChange={(v) => set({ rotation: v }, 'rotation')} />

      <div className="actions">
        <button onClick={() => p.onRotate(90)}>Rotate 90°</button>
        <button onClick={p.onDuplicate}>Duplicate</button>
        <button onClick={() => p.onOrder('front')}>To front</button>
        <button onClick={() => p.onOrder('back')}>To back</button>
        <button className="danger" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </aside>
  );
}
