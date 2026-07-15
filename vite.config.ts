import { defineConfig } from 'vite';

// Portable builds use relative paths (./) so dist/ works on any static host.
// GitHub Pages project site sets VITE_BASE=/trump-doom/
const base = process.env.VITE_BASE || './';

export default defineConfig({
  base,
  root: '.',
  publicDir: 'public',
  server: {
    port: 5180,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 4180,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
