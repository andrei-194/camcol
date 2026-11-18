// E2E con Playwright (PLAN §10). Corre DENTRO de la imagen oficial de Playwright (servicio `e2e` de
// docker-compose.yml) con `npm run test:e2e` desde la raíz: ese script prepara Supabase local y las variables E2E_*.
import { defineConfig, devices } from '@playwright/test'

const PUERTO = 4173
const viewport = { width: 360, height: 740 } // RNF-UX: viewport de 360 px

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    viewport,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
  ],
  webServer: {
    // Modo `e2e`: activa el gancho de prueba (nunca existe en producción). La anon key va solo al bundle de prueba.
    command: `npm run build:e2e && npx vite preview --host 0.0.0.0 --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env['E2E_SUPABASE_URL'] ?? '',
      VITE_SUPABASE_ANON_KEY: process.env['E2E_ANON_KEY'] ?? '',
    },
  },
})
