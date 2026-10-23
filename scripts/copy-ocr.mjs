// Copies the plate reader (Tesseract worker, WebAssembly core and English
// model) into public/ocr so the app serves it itself instead of pulling it
// from a CDN. Runs before dev and build.
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));
const out = join(import.meta.dirname, '..', 'public', 'ocr');
mkdirSync(out, { recursive: true });

const files = [
  [pkg('tesseract.js'), 'dist/worker.min.js'],
  // the LSTM-only builds; the worker picks the fastest one the phone supports
  [pkg('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'],
  [pkg('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'],
  [pkg('tesseract.js-core'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  // the small integer model: about 3 MB, good enough for block letters
  [pkg('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz'],
];
for (const [dir, file] of files) cpSync(join(dir, file), join(out, file.split('/').pop()));
