import { useState } from 'react';
import { uid } from '../geometry';
import { carLabel } from '../incidents';
import { formatElapsed } from '../ops';
import { parseCents } from '../shifts';
import { useDialog } from '../dialog';
import {
  coveredByMonthly,
  dollars,
  feeFor,
  findValidation,
  PAY_METHODS,
  ratesText,
  validatedFee,
  validationText,
  type PayMethod,
  type Payment,
  type Rates,
  type Validation,
} from '../payments';
import type { ParkedCar, PlateHistory } from '../types';

interface Props {
  car: ParkedCar;
  rates: Rates;
  validations: Validation[];
  /** what the stand knows about the plate: a monthly pass, a hotel room */
  history: PlateHistory | null;
  /** when the stay ends (now, or when the car was handed over) */
  end: number;
  /** handing the car over: pay, then it's retrieved; otherwise just pay (a flat fee at drop-off) */
  checkout: boolean;
  onPay: (p: Payment) => void;
  /** hand the car over without taking payment */
  onSkip: () => void;
  onClose: () => void;
}

/** Take payment for a car: card on the stand's reader, cash, room charge, a validation code, a comp, or a monthly pass. */
export function PaymentSheet(p: Props) {
  const dialog = useDialog<HTMLFormElement>(p.onClose);
  const stay = p.end - p.car.parkedAt;
  const fee = feeFor(p.rates, stay) ?? 0;
  const profile = p.history?.profile ?? null;
  const monthly = coveredByMonthly(profile, p.end);
  // the plate's profile can arrive after the sheet opens, so the default follows it until someone picks
  const [picked, setMethod] = useState<PayMethod | null>(null);
  const method = picked ?? (monthly ? 'monthly' : 'card');
  const [code, setCode] = useState('');
  const [roomTyped, setRoom] = useState<string | null>(null);
  const room = roomTyped ?? (profile?.type === 'hotel' ? profile.unit : '');
  const [reason, setReason] = useState('');
  const [cash, setCash] = useState('');

  const validation = method === 'validated' ? findValidation(p.validations, code) : null;
  const amount = method === 'validated' ? (validation ? validatedFee(p.rates, stay, validation) : fee) : method === 'comp' || method === 'monthly' ? 0 : fee;
  const handed = parseCents(cash);
  const change = method === 'cash' && handed != null && handed >= amount ? handed - amount : null;
  const methods = PAY_METHODS.filter((m) => m.method !== 'monthly' || monthly || profile?.type === 'monthly');

  const ready =
    method === 'validated' ? !!validation : method === 'room' ? !!room.trim() : method === 'comp' ? !!reason.trim() : method === 'monthly' ? monthly : true;
  const label =
    method === 'card'
      ? `Paid ${dollars(amount)} by card`
      : method === 'cash'
        ? `Paid ${dollars(amount)} cash`
        : method === 'room'
          ? `Charge ${dollars(amount)} to room${room.trim() ? ` ${room.trim()}` : ''}`
          : method === 'validated'
            ? amount
              ? `Validated · paid ${dollars(amount)}`
              : 'Validated · no charge'
            : method === 'comp'
              ? `Comp ${dollars(fee)}`
              : 'Monthly · no charge';

  const pay = () => {
    if (!ready) return;
    p.onPay({
      id: crypto.randomUUID?.() ?? uid(),
      carId: p.car.id,
      ticket: p.car.ticket,
      amountCents: amount,
      feeCents: fee,
      method,
      code: method === 'validated' ? validation!.code : method === 'room' ? room.trim().slice(0, 40) : '',
      note: method === 'comp' ? reason.trim().slice(0, 500) : '',
      takenBy: '',
      takenByName: '',
      createdAt: Date.now(),
      voided: false,
    });
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <form
        className="dialog pay-sheet"
        {...dialog}
        aria-label="Take payment"
        onSubmit={(e) => {
          e.preventDefault();
          pay();
        }}
      >
        <header>
          <h2>{p.checkout ? 'Check out' : 'Take payment'}</h2>
          <div className="grow" />
          <button type="button" className="icon" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="pay-car">{carLabel(p.car) || 'This car'}</p>

        <div className="pay-due">
          <b className={amount < fee ? 'reduced' : ''}>{dollars(amount)}</b>
          {amount < fee && <s>{dollars(fee)}</s>}
          <small>
            {formatElapsed(stay)} · since {new Date(p.car.parkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {ratesText(p.rates)}
          </small>
        </div>

        {fee === 0 && method !== 'monthly' ? (
          <p className="pay-free">Nothing to collect: still inside the free {p.rates.graceMin} minutes.</p>
        ) : (
          <>
            <div className="pay-methods" role="radiogroup" aria-label="How they paid">
              {methods.map((m) => (
                <button
                  type="button"
                  key={m.method}
                  role="radio"
                  aria-checked={method === m.method}
                  className={method === m.method ? 'on' : ''}
                  onClick={() => setMethod(m.method)}
                >
                  <span aria-hidden>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {method === 'card' && <p className="hint">Run {dollars(amount)} on the stand's card reader or tap to pay, then confirm here.</p>}
            {method === 'cash' && (
              <label className="pay-field">
                <span>Cash handed over (optional)</span>
                <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={dollars(amount)} />
                {change != null && (
                  <span className="pay-change">
                    Change: <b>{dollars(change)}</b>
                  </span>
                )}
              </label>
            )}
            {method === 'room' && (
              <label className="pay-field">
                <span>Room number</span>
                <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="412" maxLength={40} autoFocus={!room} />
              </label>
            )}
            {method === 'validated' && (
              <label className="pay-field">
                <span>Validation code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={p.validations.find((v) => v.active)?.code ?? 'CODE'}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={30}
                  autoFocus
                />
                {code.trim() &&
                  (validation ? (
                    <span className="pay-code ok">
                      ✓ {validation.label || validation.code} · {validationText(validation)}
                    </span>
                  ) : (
                    <span className="pay-code bad">No active code {code.trim()}</span>
                  ))}
                {!p.validations.some((v) => v.active) && <span className="hint">No codes set up yet. A manager adds them under Rates and validations.</span>}
              </label>
            )}
            {method === 'comp' && (
              <label className="pay-field">
                <span>Why it's comped</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Manager OK'd, waited too long…" maxLength={500} autoFocus />
              </label>
            )}
            {method === 'monthly' && (
              <p className={monthly ? 'pay-free' : 'warn'}>
                {monthly
                  ? `Monthly pass${profile?.unit ? ` for unit ${profile.unit}` : ''}, paid through ${new Date(`${profile!.paidUntil}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}.`
                  : 'Their monthly pass has run out. Take payment or update their profile.'}
              </p>
            )}
          </>
        )}

        <div className="pay-actions">
          {fee === 0 && method !== 'monthly' ? (
            <button type="button" className="primary big" onClick={p.checkout ? p.onSkip : p.onClose}>
              {p.checkout ? 'Hand over' : 'Done'}
            </button>
          ) : (
            <button className="primary big" disabled={!ready}>
              {label}
            </button>
          )}
          {p.checkout && !(fee === 0 && method !== 'monthly') && (
            <button type="button" className="link pay-skip" onClick={p.onSkip}>
              Hand over without taking payment
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
