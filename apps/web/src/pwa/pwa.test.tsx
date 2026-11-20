import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
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

  it('[T-D6] la barra del teléfono es el café y el arranque el papel, y coinciden con los tokens y con index.html', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const token = (n: string) => new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]!.toUpperCase()
    expect(manifest.theme_color).toBe(token('cafe'))
    expect(manifest.background_color).toBe(token('fondo'))
    expect(manifest.theme_color).toBe('#3A2418')
    expect(manifest.background_color).toBe('#FBF7EE')
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color as string}" />`)
  })

  it('[T-D6] en iPhone la barra de estado es opaca y oscura, para no tapar la cabecera', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black" />')
  })

  it('[T-D6] los íconos son los de la web: PNG reales de 180, 192 y 512 px, y el favicon enlazado', () => {
    const tamano = (ruta: string) => {
      const b = readFileSync(ruta)
      expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // firma PNG
      return [b.readUInt32BE(16), b.readUInt32BE(20)]
    }
    expect(tamano('public/icons/apple-touch-icon.png')).toEqual([180, 180])
    expect(tamano('public/icons/icon-192.png')).toEqual([192, 192])
    expect(tamano('public/icons/icon-512.png')).toEqual([512, 512])
    expect(tamano('public/icons/maskable-512.png')).toEqual([512, 512])
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />')
    expect(existsSync('public/favicon.ico')).toBe(true)
    expect(readFileSync('public/favicon.ico').subarray(0, 4).toString('hex')).toBe('00000100') // firma ICO
  })

  it('[T-D6] el apple-touch-icon es opaco en la esquina (iOS pinta de negro lo transparente)', () => {
    const png = readFileSync('public/icons/apple-touch-icon.png')
    expect(png.readUInt8(24)).toBe(8) // 8 bits por canal
    expect(png.readUInt8(25)).toBe(6) // RGBA
    // Une los trozos IDAT, descomprime y lee el primer píxel (en la primera fila el filtro no cambia su valor): alfa 255.
    const trozos: Buffer[] = []
    for (let i = 8; i < png.length; ) {
      const largo = png.readUInt32BE(i)
      if (png.subarray(i + 4, i + 8).toString('latin1') === 'IDAT') trozos.push(png.subarray(i + 8, i + 8 + largo))
      i += 12 + largo
    }
    const crudo = inflateSync(Buffer.concat(trozos))
    expect(crudo[4]).toBe(255)
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
