// Candado del gancho de pruebas E2E (CAM-49, T-M2-09): solo existe en el build de modo `e2e`.
// Se construye de verdad (sin escribir a disco) y se busca la marca del gancho en el resultado.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { build, type Rollup } from 'vite'
import { describe, expect, it } from 'vitest'
import { opcionesPwa } from '../pwa/config'

const MARCA = '__camino_e2e'

async function construir(mode: string): Promise<string> {
  const salida = (await build({
    configFile: false,
    root: process.cwd(),
    mode,
    logLevel: 'silent',
    plugins: [react(), tailwindcss(), VitePWA({ ...opcionesPwa, disable: true })],
    build: { write: false, outDir: 'dist-prueba-e2e', emptyOutDir: false },
    define: { 'import.meta.env.VITE_SUPABASE_URL': '"http://localhost"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"x"' },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[]
  const bloques = Array.isArray(salida) ? salida : [salida]
  return bloques
    .flatMap((b) => b.output)
    .map((o) => (o.type === 'chunk' ? o.code : ''))
    .join('\n')
}

describe('gancho de pruebas E2E fuera de producción', () => {
  it('[E1] el build de producción NO contiene el gancho', async () => {
    expect(await construir('production')).not.toContain(MARCA)
  }, 120_000)

  it('[E1] el build de modo e2e SÍ contiene el gancho (la comprobación puede fallar)', async () => {
    expect(await construir('e2e')).toContain(MARCA)
  }, 120_000)
})
