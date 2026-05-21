import { defineConfig } from 'vite';

// Spin Arena build config. `base: './'` keeps the bundle portable so it can be
// dropped onto any static host (itch.io, GitHub Pages, a plain folder).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true,
  },
});
