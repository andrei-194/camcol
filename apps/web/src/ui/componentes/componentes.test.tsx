// Componentes base del sistema de diseño (T-M3-00): roles, nombres accesibles y estados.
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Aviso } from './Aviso'
import { BarraSuperior } from './BarraSuperior'
import { Boton } from './Boton'
import { CampoTexto } from './CampoTexto'
import { EtiquetaEstado } from './EtiquetaEstado'
import { Pagina } from './Pagina'
import { Tarjeta } from './Tarjeta'

const enRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Boton', () => {
  it('es un botón con nombre accesible, tipo button por defecto y atiende el clic', () => {
    const alTocar = vi.fn()
    render(<Boton onClick={alTocar}>Guardar</Boton>)
    const b = screen.getByRole('button', { name: 'Guardar' })
    expect(b).toHaveAttribute('type', 'button')
    fireEvent.click(b)
    expect(alTocar).toHaveBeenCalledOnce()
  })

  it('deshabilitado no atiende el clic', () => {
    const alTocar = vi.fn()
    render(<Boton disabled onClick={alTocar}>Guardar</Boton>)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(alTocar).not.toHaveBeenCalled()
  })

  it.each(['primario', 'secundario', 'peligro'] as const)('variante %s marca data-variante y mide al menos 48 px', (v) => {
    render(<Boton variante={v}>Ok</Boton>)
    const b = screen.getByRole('button', { name: 'Ok' })
    expect(b).toHaveAttribute('data-variante', v)
    expect(b.className).toContain('min-h-12')
  })

  it('por defecto es primario', () => {
    render(<Boton>Ok</Boton>)
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveAttribute('data-variante', 'primario')
  })
})

describe('CampoTexto', () => {
  it('asocia la etiqueta con el campo', () => {
    render(<CampoTexto etiqueta="Correo" type="email" />)
    expect(screen.getByLabelText('Correo')).toHaveAttribute('type', 'email')
  })

  it('con error lo anuncia, lo vincula y marca el campo inválido', () => {
    render(<CampoTexto etiqueta="Correo" error="Escribe un correo válido." />)
    const campo = screen.getByLabelText('Correo')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Escribe un correo válido.')
    expect(campo.getAttribute('aria-describedby')).toContain(alerta.id)
  })

  it('sin error no es inválido ni muestra alerta', () => {
    render(<CampoTexto etiqueta="Correo" />)
    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('la ayuda también queda vinculada', () => {
    render(<CampoTexto etiqueta="Teléfono" ayuda="Con indicativo." />)
    const campo = screen.getByLabelText('Teléfono')
    expect(campo.getAttribute('aria-describedby')).toContain(screen.getByText('Con indicativo.').id)
  })
})

describe('Tarjeta, EtiquetaEstado y Aviso', () => {
  it('Tarjeta renderiza su contenido', () => {
    render(<Tarjeta>Contenido</Tarjeta>)
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('EtiquetaEstado muestra el texto y el tono', () => {
    render(<EtiquetaEstado tono="peligro">Error</EtiquetaEstado>)
    expect(screen.getByText('Error')).toHaveAttribute('data-tono', 'peligro')
  })

  it('Aviso de error usa role alert y el informativo role status', () => {
    const { rerender } = render(<Aviso tono="error">Falló</Aviso>)
    expect(screen.getByRole('alert')).toHaveTextContent('Falló')
    rerender(<Aviso tono="info">Listo</Aviso>)
    expect(screen.getByRole('status')).toHaveTextContent('Listo')
  })
})

describe('BarraSuperior y Pagina', () => {
  it('BarraSuperior muestra el título como h1 y el enlace Volver cuando hay destino', () => {
    enRouter(<BarraSuperior titulo="Ajustes" volverA="/" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })

  it('BarraSuperior sin destino no muestra Volver', () => {
    enRouter(<BarraSuperior titulo="Camino Col" />)
    expect(screen.queryByRole('link', { name: 'Volver' })).toBeNull()
  })

  it('Pagina tiene un solo main, el encabezado y el contenido', () => {
    enRouter(
      <Pagina titulo="Pendientes" volverA="/">
        <p>Hola</p>
      </Pagina>,
    )
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Pendientes' })).toBeInTheDocument()
    expect(screen.getByText('Hola')).toBeInTheDocument()
  })
})
