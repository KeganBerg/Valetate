/** Grab bar shown on the bottom sheets on phones; tapping it closes the sheet. */
export function SheetHandle({ onClose }: { onClose: () => void }) {
  return (
    <button className="sheet-handle" onClick={onClose} aria-label="Close panel">
      <i />
    </button>
  );
}
