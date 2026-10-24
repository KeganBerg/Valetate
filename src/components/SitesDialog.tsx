import { useMemo, useRef, useState } from 'react';
import { SITE_TEMPLATES, type SiteTemplate } from '../templates';
import { areasOf, spotCount } from '../sites';
import type { LotMap, Site } from '../types';
import { MapSvg } from './MapSvg';
import { useDialog } from '../dialog';

interface Props {
  sites: Site[];
  maps: LotMap[];
  currentSiteId?: string;
  onOpen: (site: Site) => void;
  onTemplate: (t: SiteTemplate) => void;
  onRename: (site: Site, name: string) => void;
  onDelete: (site: Site) => void;
  /** a saved map file becomes a new area of the site on screen */
  onImport: (file: File) => void;
  /** start a new site with a blank area and the step-by-step guide */
  onGuide?: () => void;
  onClose?: () => void;
  canEdit: boolean;
}

function SiteCard({
  site,
  areas,
  current,
  canEdit,
  onOpen,
  onRename,
  onDelete,
}: {
  site: Site;
  areas: LotMap[];
  current: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [sure, setSure] = useState(false);
  const spaces = spotCount(areas);
  const first = areas[0];
  return (
    <div className={`map-card site-card ${current ? 'current' : ''}`}>
      {editing ? (
        <form
          className="site-rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onRename(name.trim());
            setEditing(false);
          }}
        >
          <label className="field">
            <span>Site name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="row-actions">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="primary">Save</button>
          </div>
        </form>
      ) : (
        <button className="open" onClick={onOpen}>
          {first ? <MapSvg map={first} className="thumb" /> : <div className="thumb empty-thumb" />}
          <b>{site.name || 'Untitled site'}</b>
          <small>
            {areas.length === 1 ? '1 area' : `${areas.length} areas`}
            {spaces ? ` · ${spaces} spaces` : ''} · {areas.map((a) => a.name).join(', ')}
          </small>
        </button>
      )}
      {canEdit && !editing && (
        <div className="card-actions">
          <button onClick={() => setEditing(true)}>Rename</button>
          {sure ? (
            <>
              <button className="danger" onClick={onDelete}>
                Delete site and {areas.length === 1 ? 'its area' : `its ${areas.length} areas`}
              </button>
              <button onClick={() => setSure(false)}>Keep it</button>
            </>
          ) : (
            <button onClick={() => setSure(true)} aria-label={`Delete ${site.name}`}>
              🗑 Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SitesDialog({ sites, maps, currentSiteId, onOpen, onTemplate, onRename, onDelete, onImport, onGuide, onClose, canEdit }: Props) {
  const dialog = useDialog(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => SITE_TEMPLATES.map((t) => ({ t, map: { ...t.areas[0].template.build(), id: t.key, updatedAt: 0 } as LotMap })),
    [],
  );
  const groups = ['Start from', 'Examples'] as const;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" {...dialog} aria-label="Your sites">
        <header>
          <h2>{canEdit ? 'Your sites' : 'Sites'}</h2>
          <div className="grow" />
          {canEdit && currentSiteId && <button onClick={() => fileRef.current?.click()}>Open a saved file</button>}
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

        {sites.length === 0 && canEdit && (
          <p className="maps-intro">
            A site is one place you look after: a venue, an event, a campus, a garage. Each site has areas, like the whole
            grounds, a lawn, a parking lot or a garage level. Pick the closest starting point and change anything after.
          </p>
        )}

        {sites.length > 0 && (
          <section>
            <h3>Open a site</h3>
            <div className="cards">
              {sites.map((s) => (
                <SiteCard
                  key={s.id}
                  site={s}
                  areas={areasOf(maps, s.id)}
                  current={s.id === currentSiteId}
                  canEdit={canEdit}
                  onOpen={() => onOpen(s)}
                  onRename={(name) => onRename(s, name)}
                  onDelete={() => onDelete(s)}
                />
              ))}
            </div>
          </section>
        )}

        {canEdit && onGuide && (
          <button className="choice-tile guide-tile" onClick={onGuide}>
            <span className="choice-icon" aria-hidden="true">
              🧭
            </span>
            <b>{sites.length ? 'Draw a new site, step by step' : 'Draw my site, step by step'}</b>
            <span className="muted small">
              Recommended. We find your place on a satellite photo and show you how to draw on it.
            </span>
          </button>
        )}

        {canEdit &&
          groups.map((g) => (
            <section key={g}>
              <h3>{g === 'Start from' ? 'Or start a new site from a ready-made one' : 'Examples from real places'}</h3>
              <div className="cards">
                {previews
                  .filter(({ t }) => t.group === g)
                  .map(({ t, map }) => (
                    <div key={t.key} className="map-card">
                      <button className="open" onClick={() => onTemplate(t)}>
                        <MapSvg map={map} className="thumb" />
                        <b>
                          <span aria-hidden="true">{t.icon}</span> {t.name}
                        </b>
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
