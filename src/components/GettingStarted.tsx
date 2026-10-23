export interface Step {
  label: string;
  hint: string;
  done: boolean;
  action?: { label: string; run: () => void };
}

/** The first three things a new company does, shown to its admin until they're done. */
export function GettingStarted({ company, steps, onHide }: { company: string; steps: Step[]; onHide: () => void }) {
  const left = steps.filter((s) => !s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <section className="getting-started" aria-label="Getting started">
      <header>
        <div>
          <h2>{left ? `Set up ${company}` : `${company} is ready`}</h2>
          <p className="muted small">
            {left ? `${steps.length - left} of ${steps.length} done` : 'Your team can park and find cars on the live lot.'}
          </p>
        </div>
        <button className="icon" onClick={onHide} aria-label="Hide setup steps">
          ✕
        </button>
      </header>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} />
      </div>
      <ol>
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
      </ol>
    </section>
  );
}
