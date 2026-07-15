import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    // 5173 is often taken by other Vite apps on this machine
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
