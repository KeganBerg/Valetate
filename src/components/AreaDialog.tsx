import { useMemo } from 'react';
import { areaInfo } from '../sites';
import { TEMPLATES, type Template } from '../templates';
import type { LotMap } from '../types';
import { MapSvg } from './MapSvg';
import { useDialog } from '../dialog';

interface Props {
  siteName: string;
  onPick: (t: Template) => void;
  /** a blank area with the step-by-step guide */
  onGuide?: () => void;
  onClose: () => void;
}

/** Add an area to a site: the whole grounds, a lawn, a parking lot, a garage level, a floor. */
export function AreaDialog({ siteName, onPick, onGuide, onClose }: Props) {
  const dialog = useDialog(onClose);
  const previews = useMemo(
    () => TEMPLATES.filter((t) => t.group === 'Start from').map((t) => ({ t, map: { ...t.build(), id: t.key, updatedAt: 0 } as LotMap })),
    [],
  );
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" {...dialog} aria-label="Add an area">
        <header>
          <h2>Add an area to {siteName}</h2>
          <div className="grow" />
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="maps-intro">
          An area is one map of part of your site. It gets its own tab at the top, so anyone can switch to it with one tap.
        </p>
        {onGuide && (
          <button className="choice-tile guide-tile" onClick={onGuide}>
            <span className="choice-icon" aria-hidden="true">
              🧭
            </span>
            <b>Draw it step by step</b>
            <span className="muted small">Find it on a satellite photo, then trace over it.</span>
          </button>
        )}
        <section>
          <h3>Or start from</h3>
          <div className="cards">
            {previews.map(({ t, map }) => (
              <div key={t.key} className="map-card">
                <button className="open" onClick={() => onPick(t)}>
                  <MapSvg map={map} className="thumb" />
                  <b>
                    <span aria-hidden="true">{areaInfo(t.areaKind).icon}</span> {t.name}
                  </b>
                  <small>{t.description}</small>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
