import type { CarPhoto, PhotoSide } from './types';

export const SIDES: { side: Exclude<PhotoSide, 'closeup'>; label: string }[] = [
  { side: 'front', label: 'Front' },
  { side: 'driver', label: 'Driver side' },
  { side: 'back', label: 'Back' },
  { side: 'passenger', label: 'Passenger side' },
];

export const sideLabel = (s: PhotoSide) => SIDES.find((x) => x.side === s)?.label ?? 'Close-up';

/** how many of the four sides have a picture */
export function sidesDone(photos: CarPhoto[]): number {
  return SIDES.filter((s) => photos.some((p) => p.side === s.side)).length;
}

const MAX_EDGE = 1600;

export function stampText(takenAt: number, tag: string, side: PhotoSide): string {
  const when = new Date(takenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return [when, tag && `#${tag}`, sideLabel(side)].filter(Boolean).join(' · ');
}

/**
 * Shrink a camera photo (often 4-12 MB) to a ~250 KB JPEG and burn the time,
 * tag and side into the corner, so the picture proves itself even when shared.
 */
export async function preparePhoto(file: Blob, stamp: string): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const fs = Math.max(14, Math.round(w / 40));
  ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
  const pad = Math.round(fs * 0.5);
  const tw = ctx.measureText(stamp).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - fs - pad * 2, tw + pad * 2, fs + pad * 2);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.fillText(stamp, pad, h - fs - pad);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), 'image/jpeg', 0.78),
  );
}
