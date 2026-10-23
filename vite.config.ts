import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset paths so the build works at any URL (e.g. GitHub Pages under /Valetate/)
  base: './',
  plugins: [react()],
});
