import { useState } from 'react';
import type { Place } from '../backdrop';
import type { LotMap } from '../types';
import { PlaceSearch } from './Satellite';

interface Props {
  map: LotMap;
  /** put the satellite photo of this place under the lot (and start lining it up) */
  onPlace: (p: Place) => void;
  /** add a piece by its palette name ("Building", "Row of spaces"…) */
  onAdd: (assetName: string) => void;
  onClose: () => void;
}

const FIRST = [
  { asset: 'Building', label: 'A building', icon: '🏢' },
  { asset: 'Row of spaces', label: 'A row of parking spaces', icon: '🅿️' },
  { asset: 'Colored area', label: 'An area (lawn, yard, zone)', icon: '▭' },
  { asset: 'Tent', label: 'A tent or stand', icon: '⛺' },
];

/**
 * Draw a map step by step: find the place on the satellite photo,
 * put the first thing on it (a building, a row of spaces, an area, a tent), line
 * it up, done. Each step says what to
 * do in plain words and has one big button for it.
 */
export function Guide({ map, onPlace, onAdd, onClose }: Props) {
  const [noPhoto, setNoPhoto] = useState(false);
  const [firstOk, setFirstOk] = useState(false);
  const has = map.items.length > 0;
  const last = map.items[map.items.length - 1];
  const steps = [
    { title: 'Find your place', done: !!map.backdrop || noPhoto },
    { title: 'Add the first thing', done: has },
    { title: 'Put it where it really is', done: has && firstOk },
  ];
  const quickAdd = (
    <div className="guide-picks">
      {FIRST.map((f) => (
        <button key={f.asset} className="big" onClick={() => onAdd(f.asset)}>
          <span aria-hidden="true">{f.icon}</span> {f.label}
        </button>
      ))}
    </div>
  );
  const step = steps.findIndex((s) => !s.done);
  const [small, setSmall] = useState(false);

  return (
    <section className={`guide ${small ? 'small' : ''}`} aria-label="Draw your map step by step">
      <header>
        <button className="guide-toggle" onClick={() => setSmall(!small)} aria-expanded={!small}>
          <b>{step < 0 ? 'Your map is started!' : `Step ${step + 1} of ${steps.length}: ${steps[step].title}`}</b>
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
          <p>Type the name or address of the place. We'll put a satellite photo of it under your map so you can trace it.</p>
          <PlaceSearch onPick={onPlace}>
            <button onClick={() => setNoPhoto(true)}>Skip, no photo</button>
          </PlaceSearch>
        </div>
      )}
      {!small && step === 1 && (
        <div className="guide-body">
          <p>What do you want to put on first? Pick one. Gates, signs, first aid and more are under ＋ Add.</p>
          {quickAdd}
        </div>
      )}
      {!small && step === 2 && (
        <div className="guide-body">
          <ol className="guide-list">
            <li>{map.backdrop ? 'Drag it on top of the real thing in the photo.' : 'Drag it to where it really is.'}</li>
            {last?.kind === 'spaceRow' ? (
              <li>
                Press <b>−</b> or <b>+</b> until it has the right number of spaces.
              </li>
            ) : (
              <li>Drag a white square on its edge to make it bigger or smaller.</li>
            )}
            <li>
              Press <b>↻ Turn</b> if it faces the wrong way.
            </li>
          </ol>
          <button className="primary big" onClick={() => setFirstOk(true)}>
            ✓ It matches
          </button>
        </div>
      )}
      {!small && step < 0 && (
        <div className="guide-body">
          <p>
            Add the rest the same way, here or with <b>＋ Add</b>. Made a mistake? Press <b>↶ Undo</b> at the top. Your map saves by itself.
          </p>
          {quickAdd}
          <div className="actions">
            <button className="primary" onClick={onClose}>
              Finish
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
