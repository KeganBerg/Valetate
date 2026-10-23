import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import type { ParkedCar } from '../types';

export function guestUrl(token: string) {
  return `${location.origin}${location.pathname}?car=${token}`;
}

function QrSvg({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }, [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * The guest's link: they scan it at check-in, or the valet texts it from their own
 * phone, and they request the car from it later. No app, no account.
 */
export function GuestLinkDialog({ car, company, onClose }: { car: ParkedCar; company?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = guestUrl(car.guestToken!);
  const text = `${company ? `${company} valet: ` : ''}your ticket is #${car.ticket || car.plate}. When you're ready for your car, tap ${url}`;
  const phone = car.ownerPhone.replace(/[^\d+]/g, '');
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog guest-link" role="dialog" aria-label="Guest link">
        <h2>Guest link for #{car.ticket || car.plate}</h2>
        <p className="hint">The guest scans this, or you text it. They tap one button when they want the car, and it shows up in Requests.</p>
        <QrSvg text={url} />
        <div className="actions">
          {phone && (
            <a className="button primary" href={`sms:${phone}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`}>
              Text to {car.ownerPhone}
            </a>
          )}
          {'share' in navigator && (
            <button className={phone ? '' : 'primary'} onClick={() => navigator.share({ text }).catch(() => {})}>
              Share…
            </button>
          )}
          <button
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
