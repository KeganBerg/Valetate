import { useMemo, useRef } from 'react';
import { listSpots } from '../geometry';
import { TEMPLATES, type Template } from '../templates';
import type { LotMap } from '../types';
import { MapSvg } from './MapSvg';
import { useDialog } from '../dialog';

interface Props {
  maps: LotMap[];
  currentId: string;
  onOpen: (map: LotMap) => void;
  onTemplate: (t: Template) => void;
  onDelete: (map: LotMap) => void;
  onImport: (file: File) => void;
  /** start a blank lot with the step-by-step guide */
  onGuide?: () => void;
  onClose?: () => void;
  canEdit: boolean;
}

function Thumb({ map }: { map: LotMap }) {
  return <MapSvg map={map} className="thumb" />;
}

export function MapsDialog({ maps, currentId, onOpen, onTemplate, onDelete, onImport, onGuide, onClose, canEdit }: Props) {
  const dialog = useDialog(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => TEMPLATES.map((t) => ({ t, map: { ...t.build(), id: t.key, updatedAt: 0 } as LotMap })),
    [],
  );
  const groups = ['Start from', 'Examples'] as const;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" {...dialog} aria-label="Your maps">
        <header>
          <h2>{canEdit ? 'Your maps' : 'Maps'}</h2>
          <div className="grow" />
          {canEdit && <button onClick={() => fileRef.current?.click()}>Open a saved file</button>}
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
            <h3>Open a map</h3>
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
                  {canEdit && <button
                    className="icon del"
                    aria-label={`Delete ${m.name}`}
                    onClick={() => {
                      if (confirm(`Delete "${m.name}"? This can't be undone.`)) onDelete(m);
                    }}
                  >
                    🗑
                  </button>}
                </div>
              ))}
            </div>
          </section>
        )}

        {canEdit && onGuide && (
          <button className="choice-tile guide-tile" onClick={onGuide}>
            <span className="choice-icon" aria-hidden="true">
              🧭
            </span>
            <b>{maps.length ? 'Draw a new lot, step by step' : 'Draw my lot, step by step'}</b>
            <span className="muted small">
              Recommended. We find your venue on a satellite photo and show you how to add each row.
            </span>
          </button>
        )}

        {canEdit && groups.map((g) => (
          <section key={g}>
            <h3>{g === 'Start from' ? 'Or start from a ready-made lot' : 'Examples from real venues'}</h3>
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
