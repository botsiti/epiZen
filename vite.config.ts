import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Two pages: the app, and the menu bar item's panel (src-tauri/src/tray.rs opens tray.html).
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        tray: fileURLToPath(new URL('tray.html', import.meta.url)),
      },
    },
  },
  // Tauri needs a fixed dev port, and Vite clearing the screen would hide Rust errors.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
