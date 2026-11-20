// Pantallas existentes con el rediseño (T-D5, CAM-110, docs/producto/diseno.md): acceso en tarjeta con el lema, ajustes
// y cómo instalar en tarjetas, y una guarda contra el estilo anterior. Sin cambios de lógica.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
import { AppRoutes } from '../routes'
import { servicioFalso, socio } from '../test/servicioAuthFalso'
import { Ajustes } from './Ajustes'
import { ComoInstalar } from './ComoInstalar'

const enRuta = (servicio: ReturnType<typeof servicioFalso>, ruta: string) =>
  render(
    <AuthProvider servicio={servicio}>
      <MemoryRouter initialEntries={[ruta]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )

describe('acceso', () => {
  it('el login lleva el lema de la marca y el formulario va en una tarjeta', async () => {
    enRuta(servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } }), '/')
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.getByText('Del campo colombiano a tu mesa.')).toBeInTheDocument()
    const formulario = screen.getByRole('heading', { name: 'Iniciar sesión' }).closest('form')!
    expect(formulario.closest('[class*="bg-tarjeta"]')).not.toBeNull()
  })

  it('«Sin acceso» y «Sin verificar» también van en tarjeta', async () => {
    const { unmount } = enRuta(servicioFalso({ membresia: 'no' }), '/')
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Sin acceso' })
    expect(titulo).toBeInTheDocument()
    expect(screen.getByText(socio.email).closest('[class*="bg-tarjeta"]')).not.toBeNull()
    expect(screen.queryByText('Del campo colombiano a tu mesa.')).toBeNull()
    unmount()
    enRuta(servicioFalso({ membresia: 'desconocido' }), '/')
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').closest('[class*="bg-tarjeta"]')).not.toBeNull()
    expect(screen.queryByText('Del campo colombiano a tu mesa.')).toBeNull()
  })
})

describe('Ajustes y Cómo instalar', () => {
  it('Ajustes agrupa el almacenamiento en una tarjeta y enlaza a Cómo instalar', async () => {
    render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter>
          <Ajustes />
        </MemoryRouter>
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: /almacenamiento/i }).closest('[class*="bg-tarjeta"]')).not.toBeNull())
    expect(screen.getByRole('link', { name: /Cómo instalar/ })).toHaveAttribute('href', '/instalar')
    expect(screen.getByRole('heading', { level: 2, name: 'Sesión' }).closest('[class*="bg-tarjeta"]')).not.toBeNull()
  })

  it('«Datos» (actualizar) también va en su tarjeta', () => {
    const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'BotonActualizar.tsx'), 'utf8')
    expect(fuente).toContain('<Tarjeta')
  })

  it('Cómo instalar pone iPhone y Android cada uno en su tarjeta', () => {
    render(
      <MemoryRouter>
        <ComoInstalar />
      </MemoryRouter>,
    )
    for (const nombre of [/iPhone/, /Android/]) {
      expect(screen.getByRole('heading', { level: 2, name: nombre }).closest('[class*="bg-tarjeta"]')).not.toBeNull()
    }
  })
})

describe('guarda contra el estilo anterior', () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const ruta = join(dir, n)
      return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [ruta] : []
    })

  it('ninguna pantalla usa listas con `divide-*` ni cajas `border-borde` hechas a mano: van en FilaLista o Tarjeta', () => {
    const raiz = dirname(fileURLToPath(import.meta.url))
    const culpables = archivos(raiz).filter((f) => /divide-y|divide-borde|rounded-tarjeta border border-borde/.test(readFileSync(f, 'utf8')) && !f.endsWith('Tarjeta.tsx'))
    expect(culpables).toEqual([])
  }, 10_000)
})
