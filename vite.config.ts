import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorkerSource } from './src/sw/source';

/** Writes sw.js with the list of this build's files, so the app opens offline. */
function serviceWorker(): Plugin {
  return {
    name: 'valetate-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(Date.now().toString(36), ['./favicon.svg', ...files.map((f) => './' + f)]),
      });
    },
  };
}

export default defineConfig({
  // relative asset paths so the build works at any URL (e.g. GitHub Pages under /Valetate/)
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    rollupOptions: {
      output: {
        // libraries change far less often than the app: separate files stay cached across releases
        manualChunks(id) {
          // (not react-dom/server: exports load it on their own)
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id) && !id.includes('server')) return 'react';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
        },
      },
    },
  },
});
