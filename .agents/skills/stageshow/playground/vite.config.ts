import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    fs: { allow: ['..', fileURLToPath(new URL('../../../../src', import.meta.url))] },
  },
  resolve: { dedupe: ['react', 'react-dom'] },
})
