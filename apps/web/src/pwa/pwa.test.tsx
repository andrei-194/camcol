import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
import { alfa, decodificarPng, luminosidad } from '../test/png'
import { servicioFalso } from '../test/servicioAuthFalso'
import { AppRoutes } from '../routes'
import { Ajustes, TEXTO_ALMACENAMIENTO } from '../ui/Ajustes'
import { estadoAlmacenamiento, solicitarAlmacenamientoPersistente } from './almacenamiento'
import { AvisoActualizacionVista } from './AvisoActualizacion'
import { opcionesPwa } from './config'

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }))

afterEach(cleanup)

const html = readFileSync('index.html', 'utf8')

describe('[RF-OPS-01] instalable', () => {
  const manifest = opcionesPwa.manifest as Record<string, unknown> & {
    icons: { src: string; sizes: string; purpose?: string }[]
  }

  it('el manifest es standalone, en es-CO y con nombre de la marca', () => {
    expect(manifest.name).toBe('Camino Col')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('es-CO')
    expect(manifest.start_url).toBe('/')
  })

  it('declara íconos 192 y 512 y uno maskable, y los archivos existen', () => {
    const tamanos = manifest.icons.map((i) => i.sizes)
    expect(tamanos).toContain('192x192')
    expect(tamanos).toContain('512x512')
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icono of manifest.icons) expect(existsSync(`public/${icono.src}`)).toBe(true)
  })

  it('index.html trae theme-color, apple-touch-icon y metas de iOS', () => {
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('name="apple-mobile-web-app-capable"')
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true)
  })

  // Lectura tolerante de index.html: no depende del orden de los atributos ni de cómo se cierre la etiqueta.
  const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '')
  const atributos = (etiqueta: string) =>
    [...sinComentarios.matchAll(new RegExp(`<${etiqueta}\\b([^>]*)>`, 'g'))].map((m) =>
      Object.fromEntries([...m[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1]!, x[2]!])),
    )
  const meta = (nombre: string) => atributos('meta').find((m) => m['name'] === nombre)?.['content']

  it('[T-D6] la barra del teléfono es el café y el arranque el papel, y coinciden con los tokens y con index.html', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const token = (n: string) => new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]!.toUpperCase()
    expect(manifest.theme_color).toBe(token('cafe'))
    expect(manifest.background_color).toBe(token('fondo'))
    expect(manifest.theme_color).toBe('#3A2418')
    expect(manifest.background_color).toBe('#FBF7EE')
    expect(meta('theme-color')).toBe(manifest.theme_color)
  })

  it('[T-D6] iPhone: barra de estado opaca y oscura, y el título de la pantalla de inicio es el short_name', () => {
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('black')
    expect(meta('apple-mobile-web-app-title')).toBe(manifest.short_name)
  })

  it('[T-D6] los favicon (svg y ico) existen, se precachean y están enlazados; el .ico trae la entrada de 48 px declarada', () => {
    const iconos = atributos('link').filter((l) => l['rel'] === 'icon')
    expect(iconos.map((l) => l['href'])).toEqual(['/favicon.svg', '/favicon.ico'])
    expect(iconos[1]!['sizes']).toBe('48x48')
    expect(existsSync('public/favicon.svg')).toBe(true)
    expect(opcionesPwa.includeAssets).toEqual(expect.arrayContaining(['favicon.svg', 'favicon.ico', 'icons/apple-touch-icon.png']))
    const ico = readFileSync('public/favicon.ico')
    expect(ico.readUInt16LE(0)).toBe(0) // reservado
    expect(ico.readUInt16LE(2)).toBe(1) // tipo: ícono
    const entradas = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => [ico.readUInt8(6 + 16 * i) || 256, ico.readUInt8(7 + 16 * i) || 256])
    expect(entradas).toContainEqual([48, 48])
  })

  it.each([
    ['public/icons/apple-touch-icon.png', 180],
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/maskable-512.png', 512],
  ])('[T-D6] %s es PNG de %i px, opaco en todos sus píxeles y no está en blanco: fondo oscuro y marca clara', (ruta, lado) => {
    const img = decodificarPng(readFileSync(ruta))
    expect([img.ancho, img.alto]).toEqual([lado, lado])
    let claros = 0
    let translucidos = 0
    for (let y = 0; y < img.alto; y++) {
      for (let x = 0; x < img.ancho; x++) {
        if (alfa(img, x, y) !== 255) translucidos++ // iOS pinta de negro lo transparente
        if (luminosidad(img, x, y) > 200) claros++
      }
    }
    expect(translucidos, `${translucidos} píxeles no son opacos`).toBe(0)
    expect(luminosidad(img, 0, 0)).toBeLessThan(128) // fondo cacao
    const fraccion = claros / (img.ancho * img.alto)
    expect(fraccion).toBeGreaterThan(0.02)
    expect(fraccion).toBeLessThan(0.4)
  })

  it('[T-D6] el ícono maskable deja toda la marca dentro de la zona segura: el círculo de 80 % de diámetro', () => {
    const img = decodificarPng(readFileSync('public/icons/maskable-512.png'))
    const centro = img.ancho / 2
    const radio = img.ancho * 0.4
    let claros = 0
    let fuera = 0
    for (let y = 0; y < img.alto; y++) {
      for (let x = 0; x < img.ancho; x++) {
        if (luminosidad(img, x, y) <= 200) continue
        claros++
        if (Math.hypot(x + 0.5 - centro, y + 0.5 - centro) > radio) fuera++
      }
    }
    expect(claros).toBeGreaterThan(0) // si no hay marca, la prueba no puede pasar en vacío
    expect(fuera, `${fuera} píxeles claros quedan fuera del círculo seguro`).toBe(0)
  })

  it('la pantalla "Cómo instalar" explica iPhone y Android', () => {
    render(
      <MemoryRouter initialEntries={['/instalar']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Cómo instalar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /iPhone/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Android/ })).toBeInTheDocument()
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument()
    expect(screen.getByText(/Instalar aplicación/)).toBeInTheDocument()
  })
})

describe('[RF-OPS-02] funciona sin conexión y almacenamiento persistente', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el service worker precachea el shell y cae a index.html al navegar', () => {
    expect(opcionesPwa.workbox).toMatchObject({ navigateFallback: 'index.html' })
  })

  it('el service worker no intercepta datos ni usa Background Sync', () => {
    expect(opcionesPwa.workbox).not.toHaveProperty('runtimeCaching')
    expect(opcionesPwa.strategies ?? 'generateSW').toBe('generateSW')
    expect(JSON.stringify(opcionesPwa)).not.toMatch(/sync/i)
  })

  it('pide persist() y reporta persistente cuando el navegador lo concede', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } })
    expect(await solicitarAlmacenamientoPersistente()).toBe('persistente')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('reporta no-persistente si el navegador lo niega y no-soportado si no hay API', async () => {
    vi.stubGlobal('navigator', {
      storage: { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) },
    })
    expect(await solicitarAlmacenamientoPersistente()).toBe('no-persistente')
    vi.stubGlobal('navigator', {})
    expect(await solicitarAlmacenamientoPersistente()).toBe('no-soportado')
    expect(await estadoAlmacenamiento()).toBe('no-soportado')
  })

  it('Ajustes muestra el estado del almacenamiento', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(true) } })
    render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter>
          <Ajustes />
        </MemoryRouter>
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByText(TEXTO_ALMACENAMIENTO.persistente)).toBeInTheDocument())
  })
})

describe('[RF-OPS-03] actualización con aviso', () => {
  it('el plugin usa registerType "prompt" (nunca actualiza solo)', () => {
    expect(opcionesPwa.registerType).toBe('prompt')
    expect(opcionesPwa.workbox).not.toHaveProperty('skipWaiting')
    expect(opcionesPwa.workbox).not.toHaveProperty('clientsClaim')
  })

  it('sin versión nueva no muestra nada', () => {
    const { container } = render(
      <AvisoActualizacionVista necesitaActualizar={false} listoOffline={false} onActualizar={vi.fn()} onCerrar={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('con versión nueva avisa y solo actualiza al tocar "Actualizar"', async () => {
    const onActualizar = vi.fn()
    const onCerrar = vi.fn()
    render(
      <AvisoActualizacionVista necesitaActualizar listoOffline={false} onActualizar={onActualizar} onCerrar={onCerrar} />,
    )
    expect(screen.getByText(/Nueva versión disponible/)).toBeInTheDocument()
    expect(onActualizar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Después' }))
    expect(onCerrar).toHaveBeenCalledOnce()
    expect(onActualizar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(onActualizar).toHaveBeenCalledOnce()
  })

  it('avisa cuando la app quedó lista para usarse sin conexión', () => {
    render(
      <AvisoActualizacionVista necesitaActualizar={false} listoOffline onActualizar={vi.fn()} onCerrar={vi.fn()} />,
    )
    expect(screen.getByText('Lista para usarse sin conexión.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument()
  })
})
