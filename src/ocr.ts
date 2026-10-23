import type { Worker } from 'tesseract.js';
import { pickPlate } from './plates';

let worker: Promise<Worker> | null = null;

/**
 * The text reader, started on first use. Its files (about 7 MB) are served
 * from /ocr by the app itself and kept in the browser's cache after that,
 * so later scans start in well under a second.
 */
export function loadReader(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const base = new URL('ocr/', document.baseURI).href;
    const w = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      workerBlobURL: false,
    });
    await w.setParameters({
      // plates are capital letters and digits; anything else is a misread
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      // skips a resolution guess on every frame (and its console noise)
      user_defined_dpi: '300',
    });
    return w;
  })().catch((e) => {
    worker = null;
    throw e;
  });
  return worker;
}

/**
 * Crop `rect` (in source pixels) out of a video frame or photo and clean it up
 * for reading: grey, contrast stretched, and scaled so letters are a size the
 * reader handles well.
 */
export function plateCrop(src: CanvasImageSource, rect: { x: number; y: number; w: number; h: number }, width = 800): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const scale = Math.min(3, width / rect.w);
  out.width = Math.round(rect.w * scale);
  out.height = Math.round(rect.h * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const px = img.data;
  const grey = new Uint8Array(px.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0; i < grey.length; i++) {
    const g = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    grey[i] = g;
    hist[grey[i]]++;
  }
  // stretch between the 2nd and 98th percentile so glare and shade don't wash it out
  const pct = (p: number) => {
    let n = 0;
    for (let v = 0; v < 256; v++) if ((n += hist[v]) >= grey.length * p) return v;
    return 255;
  };
  const lo = pct(0.02);
  const span = Math.max(1, pct(0.98) - lo);
  for (let i = 0; i < grey.length; i++) {
    const v = Math.max(0, Math.min(255, ((grey[i] - lo) * 255) / span));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Read a plate number from a cropped image; '' if nothing looks like one. */
export async function readPlate(img: HTMLCanvasElement): Promise<string> {
  const w = await loadReader();
  const { data } = await w.recognize(img);
  return pickPlate(data.text);
}
