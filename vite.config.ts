import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
