import { useState } from 'react';

export interface Step {
  label: string;
  hint: string;
  done: boolean;
  action?: { label: string; run: () => void };
}

/** The first things a new company does, shown to its admin until they're done. */
export function GettingStarted({ company, steps, done, onHide }: { company: string; steps: Step[]; done: string; onHide: () => void }) {
  const left = steps.filter((s) => !s.done).length;
  const next = steps.find((s) => !s.done);
  // on a phone it starts as one line so it doesn't cover the lot
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 820px)').matches);
  return (
    <section className={`getting-started ${open ? '' : 'collapsed'}`} aria-label="Getting started">
      <header>
        <button className="gs-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="gs-title">{left ? `Set up ${company}` : `${company} is ready`}</span>
          <span className="muted small gs-sub">
            {left ? `${steps.length - left} of ${steps.length} done` : done}
            {!open && next && ` · Next: ${next.label}`}
          </span>
        </button>
        <button className="icon" onClick={onHide} aria-label="Hide setup steps">
          ✕
        </button>
      </header>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} />
      </div>
      {open && <ol>
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'done' : s === next ? 'next' : ''}>
            <span className="check" aria-hidden="true">
              {s.done ? '✓' : ''}
            </span>
            <div>
              <b>{s.label}</b>
              {s === next && <span className="muted small">{s.hint}</span>}
            </div>
            {s === next && s.action && (
              <button className="primary" onClick={s.action.run}>
                {s.action.label}
              </button>
            )}
            {s.done && <span className="sr-only">done</span>}
          </li>
        ))}
      </ol>}
    </section>
  );
}
