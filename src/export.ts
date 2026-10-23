import { createElement } from 'react';
import { MapSvg } from './components/MapSvg';
import { isLotMap } from './storage';
import type { LotMap } from './types';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileSafe(name: string) {
  return name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'lot-map';
}

// the server renderer is big and only needed for exports: load it on first use
export async function mapToSvgString(map: LotMap): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(createElement(MapSvg, { map }));
}

export function exportJson(map: LotMap) {
  const blob = new Blob([JSON.stringify({ format: 'valetate-map', version: 1, map }, null, 2)], {
    type: 'application/json',
  });
  download(blob, `${fileSafe(map.name)}.valetate.json`);
}

export async function exportSvg(map: LotMap) {
  download(new Blob([await mapToSvgString(map)], { type: 'image/svg+xml' }), `${fileSafe(map.name)}.svg`);
}

export async function exportPng(map: LotMap, scale = 2) {
  const svg = await mapToSvgString(map);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the map'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = map.width * scale;
    canvas.height = map.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob) download(blob, `${fileSafe(map.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Accepts our export wrapper or a bare map object. */
export function parseMapFile(text: string): LotMap {
  const data = JSON.parse(text);
  const map = data && data.format === 'valetate-map' ? data.map : data;
  if (!isLotMap(map)) throw new Error('This file is not a Valetate map.');
  return { ...map, surface: map.surface ?? '#5d6168' };
}
