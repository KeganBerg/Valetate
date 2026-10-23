/** Shown while a screen or dialog is still downloading; appears only if it takes a moment. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="lazy-wait" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
