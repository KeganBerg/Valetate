import { useMemo, useRef } from 'react';
import { listSpots } from '../geometry';
import { TEMPLATES, type Template } from '../templates';
import type { LotMap } from '../types';
import { MapSvg } from './MapSvg';

interface Props {
  maps: LotMap[];
  currentId: string;
  onOpen: (map: LotMap) => void;
  onTemplate: (t: Template) => void;
  onDelete: (map: LotMap) => void;
  onImport: (file: File) => void;
  onClose?: () => void;
}

function Thumb({ map }: { map: LotMap }) {
  return <MapSvg map={map} className="thumb" />;
}

export function MapsDialog({ maps, currentId, onOpen, onTemplate, onDelete, onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => TEMPLATES.map((t) => ({ t, map: { ...t.build(), id: t.key, updatedAt: 0 } as LotMap })),
    [],
  );
  const groups = ['Start from', 'Examples'] as const;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-label="Lot maps">
        <header>
          <h2>Lot maps</h2>
          <div className="grow" />
          <button onClick={() => fileRef.current?.click()}>Import file…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
          {onClose && (
            <button className="icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>

        {maps.length > 0 && (
          <section>
            <h3>Your maps</h3>
            <div className="cards">
              {maps.map((m) => (
                <div key={m.id} className={`map-card ${m.id === currentId ? 'current' : ''}`}>
                  <button className="open" onClick={() => onOpen(m)}>
                    <Thumb map={m} />
                    <b>{m.name || 'Untitled lot'}</b>
                    <small>
                      {listSpots(m.items).length} spots · edited {new Date(m.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                  <button
                    className="icon del"
                    aria-label={`Delete ${m.name}`}
                    onClick={() => {
                      if (confirm(`Delete "${m.name}"? This can't be undone.`)) onDelete(m);
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <section key={g}>
            <h3>{g === 'Start from' ? 'New map' : 'Examples from real venues'}</h3>
            <div className="cards">
              {previews
                .filter(({ t }) => t.group === g)
                .map(({ t, map }) => (
                  <div key={t.key} className="map-card">
                    <button className="open" onClick={() => onTemplate(t)}>
                      <Thumb map={map} />
                      <b>{t.name}</b>
                      <small>{t.description}</small>
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
