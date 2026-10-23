import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadReader, plateCrop, readPlate } from '../ocr';
import { normalizePlate } from '../ops';
import { plateKey } from '../plates';

type Camera = 'starting' | 'live' | 'off';

interface Props {
  /** what the scan is for, shown at the top: "Scan plate", "Find a car" */
  title: string;
  /** button label once a plate is read */
  useLabel?: string;
  onUse: (plate: string) => void;
  onClose: () => void;
  /** a line under the result, such as which spot that car is in */
  describe?: (plate: string) => ReactNode;
}

/**
 * Point the phone at a plate and it reads it: the camera runs live and each
 * frame inside the box goes through the reader until two reads agree. The
 * result is always editable, since no reader gets every plate right.
 */
export function PlateScanner({ title, useLabel = 'Use plate', onUse, onClose, describe }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<Camera>('starting');
  const [reader, setReader] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [seen, setSeen] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadReader().then(
      () => setReader('ready'),
      () => setReader('failed'),
    );
  }, []);

  useEffect(() => {
    let stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('off');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        setCamera('live');
        const caps = s.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);
      })
      .catch(() => !stopped && setCamera('off'));
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // read frames until two of the last three reads agree
  useEffect(() => {
    if (camera !== 'live' || reader !== 'ready' || result !== null) return;
    let stop = false;
    const recent: string[] = [];
    (async () => {
      while (!stop) {
        const crop = frameCrop();
        const plate = crop ? await readPlate(crop).catch(() => '') : '';
        if (stop) return;
        setSeen(plate);
        const key = plateKey(plate);
        if (key && recent.includes(key)) {
          navigator.vibrate?.(40);
          setResult(plate);
          return;
        }
        recent.push(key);
        if (recent.length > 2) recent.shift();
        await new Promise((r) => setTimeout(r, crop ? 120 : 400));
      }
    })();
    return () => {
      stop = true;
    };
  }, [camera, reader, result]);

  /** the part of the current frame inside the guide box, in video pixels */
  const frameCrop = () => {
    const v = video.current;
    const b = box.current;
    if (!v || !b || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    // the video is drawn with object-fit: cover, so undo that scale and offset
    const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = (vr.width - v.videoWidth * scale) / 2;
    const oy = (vr.height - v.videoHeight * scale) / 2;
    // read a little past the box, so a plate that pokes out of it still reads
    const padX = br.width * 0.08;
    const padY = br.height * 0.15;
    const x = Math.max(0, (br.left - padX - vr.left - ox) / scale);
    const y = Math.max(0, (br.top - padY - vr.top - oy) / scale);
    const w = Math.min(v.videoWidth - x, (br.width + 2 * padX) / scale);
    const h = Math.min(v.videoHeight - y, (br.height + 2 * padY) / scale);
    return w > 20 && h > 10 ? plateCrop(v, { x, y, w, h }) : null;
  };

  const toggleTorch = () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).then(() => setTorch(!torch), () => setTorch(null));
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await createImageBitmap(file);
      // a hand-held photo usually has the plate near the middle
      const rect = { x: img.width * 0.1, y: img.height * 0.2, w: img.width * 0.8, h: img.height * 0.6 };
      const plate = await readPlate(plateCrop(img, rect, 1400));
      setResult(plate);
      setSeen(plate);
    } catch {
      setResult('');
    } finally {
      setBusy(false);
    }
  };

  const use = (plate: string) => {
    const p = normalizePlate(plate);
    if (p) onUse(p);
  };

  const status =
    reader === 'failed'
      ? "The plate reader didn't load. Check your signal, or type the plate."
      : reader === 'loading'
        ? 'Getting the reader ready…'
        : camera === 'starting'
          ? 'Starting camera…'
          : seen
            ? 'Hold steady…'
            : 'Fit the plate inside the box';

  return createPortal(
    <div className="scanner" role="dialog" aria-label={title}>
      <video ref={video} playsInline muted className={camera === 'live' ? '' : 'hidden'} />
      <header>
        <button className="icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>{title}</h2>
        {torch !== null ? (
          <button className={`icon ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-label={torch ? 'Light off' : 'Light on'} aria-pressed={torch}>
            🔦
          </button>
        ) : (
          <span className="icon-space" />
        )}
      </header>

      {camera !== 'off' ? (
        <div className="scan-frame">
          <div ref={box} className={`scan-box ${result !== null ? 'locked' : ''}`}>
            <i />
            <i />
            <i />
            <i />
            {/* hangs below the box without moving it, so every frame is cropped the same */}
            {result === null && (
              <p className="scan-status" aria-live="polite">
                {seen ? <b className="plate-read">{seen}</b> : null}
                {status}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="scan-frame no-camera">
          <p>
            {navigator.mediaDevices
              ? "Valetate can't use the camera. Allow camera access in your browser settings, or take a photo of the plate."
              : 'This browser has no live camera. Take a photo of the plate instead.'}
          </p>
          <button className="primary big" disabled={busy || reader !== 'ready'} onClick={() => photo.current?.click()}>
            {busy ? 'Reading…' : reader === 'loading' ? 'Getting the reader ready…' : '📷 Take a photo'}
          </button>
          <button className="link" onClick={() => setResult('')}>
            Type it instead
          </button>
        </div>
      )}

      {result !== null ? (
        <form
          className="scan-result"
          onSubmit={(e) => {
            e.preventDefault();
            use(result);
          }}
        >
          <label>
            <span>{result ? 'Plate read. Fix any letter that is wrong.' : "Couldn't read it. Type the plate."}</span>
            <input
              className="plate-input"
              value={result}
              autoFocus={!result}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => setResult(e.target.value.toUpperCase())}
              aria-label="Plate"
            />
          </label>
          {result && describe && <div className="scan-match">{describe(normalizePlate(result))}</div>}
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setSeen('');
                setResult(null);
              }}
            >
              Scan again
            </button>
            <button className="primary" type="submit" disabled={!normalizePlate(result)}>
              {useLabel}
            </button>
          </div>
        </form>
      ) : (
        camera !== 'off' && (
          <footer className="scan-actions">
            <button className="link" onClick={() => setResult(seen)}>
              {seen ? `Use ${seen}` : 'Type it instead'}
            </button>
          </footer>
        )
      )}
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromPhoto(e.target.files?.[0])} />
    </div>,
    document.body,
  );
}
