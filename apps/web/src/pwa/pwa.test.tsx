import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
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
