import { useState } from 'react';
import { uid } from '../geometry';
import { parseCents } from '../shifts';
import { useDialog } from '../dialog';
import { dollars, normCode, ratesText, validationText, type Rates, type Validation } from '../payments';

interface Props {
  rates: Rates;
  validations: Validation[];
  /** only admins change what the stand charges */
  canSetRates: boolean;
  onRates: (r: Rates) => void;
  onValidation: (v: Validation) => void;
  onClose: () => void;
}

const money = (c: number) => (c ? (c / 100).toFixed(c % 100 ? 2 : 0) : '');

/** What the stand charges, and the validation codes merchants hand out. */
export function RatesSheet(p: Props) {
  const dialog = useDialog(p.onClose);
  const [mode, setMode] = useState(p.rates.mode);
  const [flat, setFlat] = useState(money(p.rates.flatCents));
  const [hourly, setHourly] = useState(money(p.rates.hourlyCents));
  const [max, setMax] = useState(money(p.rates.maxCents));
  const [grace, setGrace] = useState(p.rates.graceMin ? String(p.rates.graceMin) : '');
  const [adding, setAdding] = useState(false);

  const cents = (s: string) => (s.trim() ? parseCents(s) : 0);
  const next: Rates | null = (() => {
    const f = cents(flat);
    const h = cents(hourly);
    const m = cents(max);
    const g = grace.trim() ? Number(grace) : 0;
    if (f == null || h == null || m == null || !Number.isInteger(g) || g < 0 || g > 120) return null;
    if (mode === 'flat' && !f) return null;
    if (mode === 'hourly' && !h) return null;
    return { mode, flatCents: f, hourlyCents: h, maxCents: m, graceMin: g };
  })();
  const changed = !!next && JSON.stringify(next) !== JSON.stringify(p.rates);
  const active = p.validations.filter((v) => v.active);
  const retired = p.validations.filter((v) => !v.active);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="dialog rates-sheet" {...dialog} aria-label="Rates and validations">
        <header>
          <h2>Rates and validations</h2>
          <div className="grow" />
          <button className="icon" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section>
          <h3>What you charge</h3>
          <fieldset disabled={!p.canSetRates} className="rates-form">
            <div className="seg" role="radiogroup" aria-label="How you charge">
              {(
                [
                  ['off', 'No charge'],
                  ['flat', 'Flat fee'],
                  ['hourly', 'Hourly'],
                ] as const
              ).map(([m, l]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                  {l}
                </button>
              ))}
            </div>
            {mode === 'flat' && (
              <div className="rates-row">
                <label>
                  <span>Per visit (and per extra day)</span>
                  <Money value={flat} onChange={setFlat} placeholder="20" />
                </label>
              </div>
            )}
            {mode === 'hourly' && (
              <div className="rates-row">
                <label>
                  <span>Per hour</span>
                  <Money value={hourly} onChange={setHourly} placeholder="8" />
                </label>
                <label>
                  <span>Daily max</span>
                  <Money value={max} onChange={setMax} placeholder="30" />
                </label>
              </div>
            )}
            {mode !== 'off' && (
              <div className="rates-row">
                <label>
                  <span>Free for the first</span>
                  <div className="suffix-input">
                    <input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value.replace(/\D/g, ''))} placeholder="0" maxLength={3} />
                    <i>minutes</i>
                  </div>
                </label>
              </div>
            )}
            {p.canSetRates ? (
              <div className="rates-save">
                <span className="hint">{next ? ratesText(next) : 'Fill in the amount.'}</span>
                <button type="button" className="primary" disabled={!changed} onClick={() => next && p.onRates(next)}>
                  Save rates
                </button>
              </div>
            ) : (
              <p className="hint">Only an admin can change the rates.</p>
            )}
          </fieldset>
          <p className="hint">
            With rates on, "Car retrieved" and "Handed over" open checkout first. Card payments are run on the stand's own card reader or tap to pay and
            recorded here.
          </p>
        </section>

        <section>
          <div className="dash-head">
            <h3>Validation codes</h3>
            {!adding && (
              <button className="link" onClick={() => setAdding(true)}>
                + Add a code
              </button>
            )}
          </div>
          {adding && (
            <NewCode
              taken={p.validations.map((v) => v.code)}
              onAdd={(v) => {
                p.onValidation(v);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {active.length === 0 && !adding && <p className="muted">No codes yet. Give one to a restaurant, spa or theater so their guests park free or for less.</p>}
          <ul className="codes">
            {[...active, ...retired].map((v) => (
              <li key={v.id} className={v.active ? '' : 'retired'}>
                <b className="code">{v.code}</b>
                <span>
                  {v.label && <>{v.label} · </>}
                  {validationText(v)}
                </span>
                <button onClick={() => p.onValidation({ ...v, active: !v.active })}>{v.active ? 'Retire' : 'Bring back'}</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Money({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="money-input">
      <i>$</i>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} placeholder={placeholder} maxLength={8} />
    </div>
  );
}

function NewCode({ taken, onAdd, onCancel }: { taken: string[]; onAdd: (v: Validation) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Validation['kind']>('free');
  const [value, setValue] = useState('');
  const k = normCode(code);
  const amount = kind === 'off' ? parseCents(value) : kind === 'hours' ? (/^\d{1,2}$/.test(value) && Number(value) > 0 ? Number(value) : null) : 0;
  const dup = taken.includes(k);
  const ok = k.length >= 2 && k.length <= 24 && !dup && amount != null;
  return (
    <form
      className="new-code"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onAdd({ id: crypto.randomUUID?.() ?? uid(), code: k, label: label.trim().slice(0, 80), kind, value: amount!, active: true });
      }}
    >
      <div className="rates-row">
        <label>
          <span>Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SPA" autoCapitalize="characters" maxLength={24} autoFocus />
        </label>
        <label>
          <span>Who it's for</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Spa guests" maxLength={80} />
        </label>
      </div>
      <div className="seg" role="radiogroup" aria-label="What it does">
        {(
          [
            ['free', 'Parks free'],
            ['off', 'Dollars off'],
            ['hours', 'Hours free'],
          ] as const
        ).map(([m, l]) => (
          <button key={m} type="button" role="radio" aria-checked={kind === m} className={kind === m ? 'on' : ''} onClick={() => setKind(m)}>
            {l}
          </button>
        ))}
      </div>
      {kind !== 'free' && (
        <div className="rates-row">
          <label>
            <span>{kind === 'off' ? 'Amount off' : 'Hours free'}</span>
            {kind === 'off' ? (
              <Money value={value} onChange={setValue} placeholder="10" />
            ) : (
              <div className="suffix-input">
                <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} placeholder="3" maxLength={2} />
                <i>hours</i>
              </div>
            )}
          </label>
        </div>
      )}
      {dup && <p className="warn">There's already a code {k}.</p>}
      <div className="rates-save">
        <span className="hint">{ok ? `${k}: ${kind === 'off' ? `${dollars(amount!)} off` : validationText({ kind, value: amount! })}` : 'Two or more letters or numbers.'}</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={!ok}>
          Add code
        </button>
      </div>
    </form>
  );
}
