import { useState } from 'react';
import type { Place } from '../backdrop';
import type { LotMap } from '../types';
import { PlaceSearch } from './Satellite';

interface Props {
  map: LotMap;
  /** put the satellite photo of this place under the lot (and start lining it up) */
  onPlace: (p: Place) => void;
  onAddRow: () => void;
  onClose: () => void;
}

/**
 * Draw your first lot step by step: find the venue on the satellite photo,
 * put a row of spaces on it, set how many spaces, done. Each step says what to
 * do in plain words and has one big button for it.
 */
export function Guide({ map, onPlace, onAddRow, onClose }: Props) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [rowOk, setRowOk] = useState(false);
  const hasRow = map.items.some((i) => i.kind === 'spaceRow');
  const steps = [
    { title: 'Find your lot', done: !!map.backdrop || noPhoto },
    { title: 'Add a row of parking spaces', done: hasRow },
    { title: 'Match it to your real row', done: hasRow && rowOk },
  ];
  const step = steps.findIndex((s) => !s.done);
  const [small, setSmall] = useState(false);

  return (
    <section className={`guide ${small ? 'small' : ''}`} aria-label="Draw your lot step by step">
      <header>
        <button className="guide-toggle" onClick={() => setSmall(!small)} aria-expanded={!small}>
          <b>{step < 0 ? 'Your lot is started!' : `Step ${step + 1} of ${steps.length}: ${steps[step].title}`}</b>
          {small && <span className="muted small">Tap to show</span>}
        </button>
        <button className="icon" onClick={onClose} aria-label="Close the guide">
          ✕
        </button>
      </header>
      <div className="guide-dots" aria-hidden="true">
        {steps.map((s, i) => (
          <i key={i} className={s.done ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      {!small && step === 0 && (
        <div className="guide-body">
          <p>Type the name or address of your venue. We'll put a satellite photo of it under your map so you can trace it.</p>
          <PlaceSearch onPick={onPlace}>
            <button onClick={() => setNoPhoto(true)}>Skip, no photo</button>
          </PlaceSearch>
        </div>
      )}
      {!small && step === 1 && (
        <div className="guide-body">
          <p>A row is a line of numbered parking spaces, like row A in your lot.</p>
          <button className="primary big" onClick={onAddRow}>
            ＋ Add a row of spaces
          </button>
        </div>
      )}
      {!small && step === 2 && (
        <div className="guide-body">
          <ol className="guide-list">
            <li>{map.backdrop ? 'Drag the row on top of a real row in the photo.' : 'Drag the row to where it is in your lot.'}</li>
            <li>
              Press <b>−</b> or <b>+</b> until it has the right number of spaces.
            </li>
            <li>
              Press <b>↻ Turn</b> if it faces the wrong way.
            </li>
          </ol>
          <button className="primary big" onClick={() => setRowOk(true)}>
            ✓ It matches
          </button>
        </div>
      )}
      {!small && step < 0 && (
        <div className="guide-body">
          <p>
            Add your other rows the same way with <b>＋ Add</b>. Made a mistake? Press <b>↶ Undo</b> at the top. Your map saves by itself.
          </p>
          <div className="actions">
            <button onClick={onAddRow}>＋ Add another row</button>
            <button className="primary" onClick={onClose}>
              Finish
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
