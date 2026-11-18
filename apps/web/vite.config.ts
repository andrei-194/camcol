import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { opcionesPwa } from './src/pwa/config'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(opcionesPwa)],
  server: {
    // Dentro de Docker el servidor debe escuchar en todas las interfaces y vigilar con polling.
    host: true,
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
})
