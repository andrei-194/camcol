import type { VitePWAOptions } from 'vite-plugin-pwa'

// Barra de estado y fondo de arranque: blanco, como la barra de estado de la app (docs/producto/diseno.md).
export const COLOR_TEMA = '#FFFFFF'
export const COLOR_FONDO = '#FFFFFF'

/**
 * Configuración PWA de Camino Col (RF-OPS-01/02/03, PLAN §6).
 *
 * - `registerType: 'prompt'`: el service worker nuevo queda en espera y solo
 *   toma el control cuando el usuario toca "Actualizar". Nunca recarga solo.
 * - El SW únicamente precachea el app shell (archivos de `dist`). No define
 *   `runtimeCaching`, así que no intercepta ninguna llamada a Supabase ni
 *   guarda datos: los datos viven en Dexie. Tampoco usa Background Sync
 *   (regla 5 de AGENTS.md).
 */
export const opcionesPwa: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'Camino Col',
    short_name: 'Camino',
    description: 'Pedidos, compras, inventario y pagos de Camino Col.',
    lang: 'es-CO',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: COLOR_TEMA,
    background_color: COLOR_FONDO,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
  },
}
