import { ASSETS, renderAsset, type AssetDef } from '../assets';
import type { MapItem } from '../types';
import { SheetHandle } from './SheetHandle';

function previewItem(a: AssetDef): MapItem {
  const base: MapItem = { id: 'preview', kind: a.kind, x: 0, y: 0, w: a.w, h: a.h, rotation: 0, ...a.defaults };
  if (a.kind === 'spaceRow') return { ...base, w: 150, h: 60, count: 4, prefix: '' };
  if (a.kind === 'wall' || a.kind === 'laneLine' || a.kind === 'curb') return { ...base, w: 120 };
  if (a.kind === 'label') return { ...base, label: 'Aa', fontSize: 40 };
  if (a.kind === 'zone') return { ...base, w: 140, h: 100, label: '' };
  if (a.kind === 'building') return { ...base, w: 150, h: 110, label: '' };
  if (a.kind === 'ramp') return { ...base, label: '' };
  return base;
}

function Preview({ a }: { a: AssetDef }) {
  const it = previewItem(a);
  const pad = 10;
  const size = Math.max(it.w, it.h) + pad * 2 + (a.kind === 'spaceRow' && it.prefix ? 40 : 0);
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={44} height={44} aria-hidden>
      {renderAsset(it)}
    </svg>
  );
}

export function Palette({ onAdd, open, onClose }: { onAdd: (a: AssetDef) => void; open: boolean; onClose: () => void }) {
  const groups = ['Parking', 'Structure', 'Nature', 'Markings'] as const;
  return (
    <aside className={`palette ${open ? 'open' : ''}`}>
      <SheetHandle onClose={onClose} />
      {groups.map((g) => (
        <section key={g}>
          <h3>{g}</h3>
          <div className="asset-grid">
            {ASSETS.filter((a) => a.category === g).map((a) => (
              <button
                key={a.name}
                className="asset"
                title={`${a.name}: click to add, or drag onto the map`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-valetate-asset', a.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(a)}
              >
                <Preview a={a} />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="tip">
        Tip: drag empty space to pan, scroll or pinch to zoom, Shift-drag to select several things.
      </p>
    </aside>
  );
}
