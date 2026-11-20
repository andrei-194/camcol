// Tablero de Inicio (T-D4, CAM-109, RF-DSH-01 a 04): gráficos en SVG con texto alternativo, frases de decisión y
// estados vacíos mientras no existan ventas. Los datos de esta prueba son ficticios.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { frasesDeDecision } from './frases'
import { AreaVentasCosto, Arco, BarrasHorizontales, BarrasPeriodo } from './graficos'
import { Tablero } from './Tablero'
import type { DatosTablero } from './tipos'

const datos: DatosTablero = {
  ventas: 1240000,
  costo: 854000,
  ganancia: 386000,
  margenPct: 31,
  pedidos: 8,
  ticket: 155000,
  variacionPct: 18,
  serieDiaria: [
    { etiqueta: 'L', ventas: 120000, costo: 80000 },
    { etiqueta: 'M', ventas: 160000, costo: 105000 },
    { etiqueta: 'X', ventas: 260000, costo: 170000 },
  ],
  unidadesSemanales: [
    { etiqueta: 'S1', unidades: 38 },
    { etiqueta: 'S2', unidades: 63 },
  ],
  masVendidos: [
    { nombre: 'Café Jardín 500 g', unidades: 14 },
    { nombre: 'Café Villa Luz 250 g', unidades: 7 },
  ],
  porConfirmar: 2,
  esperandoPago: { cantidad: 3, valor: 480000 },
  faltantes: { cantidad: 1, ejemplo: 'crema de naranja' },
}

describe('Arco (margen)', () => {
  it('es una imagen con el valor en texto y llena la proporción de su escala', () => {
    const { container } = render(<Arco valor={31} max={50} etiqueta="margen" texto="31 %" />)
    expect(screen.getByRole('img', { name: 'margen 31 %' })).toBeInTheDocument()
    const relleno = container.querySelector('path[data-relleno]')!
    expect(relleno.getAttribute('stroke-dasharray')).toBe('62 100')
  })

  it('dos arcos en la misma pantalla no comparten ids de gradiente', () => {
    const { container } = render(
      <>
        <Arco valor={10} max={50} etiqueta="a" texto="1" />
        <Arco valor={20} max={50} etiqueta="b" texto="2" />
      </>,
    )
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('BarrasPeriodo', () => {
  it('dibuja una barra por periodo, la última resaltada, y la más alta es la mayor', () => {
    const { container } = render(<BarrasPeriodo titulo="Unidades por semana" datos={datos.unidadesSemanales} />)
    const barras = [...container.querySelectorAll('rect[data-barra]')]
    expect(barras).toHaveLength(2)
    expect(Number(barras[1]!.getAttribute('height'))).toBeGreaterThan(Number(barras[0]!.getAttribute('height')))
    expect(barras[1]!.getAttribute('data-actual')).toBe('true')
    expect(barras[0]!.getAttribute('data-actual')).toBe('false')
  })

  it('el texto alternativo resume el último valor y el máximo', () => {
    render(<BarrasPeriodo titulo="Unidades por semana" datos={datos.unidadesSemanales} />)
    expect(screen.getByRole('img', { name: /Unidades por semana.*S2.*63/ })).toBeInTheDocument()
  })

  it('sin datos no dibuja barras', () => {
    const { container } = render(<BarrasPeriodo titulo="Unidades por semana" datos={[]} />)
    expect(container.querySelectorAll('rect[data-barra]')).toHaveLength(0)
  })
})

describe('AreaVentasCosto', () => {
  it('dibuja la línea de ventas, la de costo (punteada) y el punto final', () => {
    const { container } = render(<AreaVentasCosto datos={datos.serieDiaria} />)
    expect(container.querySelector('polyline[data-serie="ventas"]')).not.toBeNull()
    expect(container.querySelector('polyline[data-serie="costo"]')?.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(container.querySelector('circle[data-final]')).not.toBeNull()
  })

  it('el texto alternativo da el último día con ventas y costo', () => {
    render(<AreaVentasCosto datos={datos.serieDiaria} />)
    expect(screen.getByRole('img', { name: /Ventas y costo.*X.*260\.000.*170\.000/ })).toBeInTheDocument()
  })

  it('sin datos no dibuja líneas', () => {
    const { container } = render(<AreaVentasCosto datos={[]} />)
    expect(container.querySelector('polyline')).toBeNull()
  })
})

describe('BarrasHorizontales (lo más vendido)', () => {
  it('conserva el orden dado y el mayor ocupa todo el ancho', () => {
    render(<BarrasHorizontales titulo="Lo más vendido" datos={datos.masVendidos} />)
    const lista = screen.getByRole('list', { name: 'Lo más vendido' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Café Jardín 500 g')
    expect(filas[0]).toHaveTextContent('14')
    expect(filas[0]!.querySelector('[data-barra]')).toHaveStyle({ width: '100%' })
    expect(filas[1]!.querySelector('[data-barra]')).toHaveStyle({ width: '50%' })
  })
})

describe('frasesDeDecision', () => {
  it('dice cuántos pedidos esperan pago y cuánto hay por cobrar, en singular y plural', () => {
    const f = frasesDeDecision(datos)
    expect(f).toContain('3 pedidos esperan pago: $ 480.000 por cobrar.'.replace('$ ', '$ '))
    expect(frasesDeDecision({ ...datos, esperandoPago: { cantidad: 1, valor: 38000 } })[0]).toMatch(/^1 pedido espera pago/)
  })

  it('avisa los faltantes con un ejemplo y los pedidos por confirmar', () => {
    const f = frasesDeDecision(datos)
    expect(f.some((x) => x.startsWith('1 artículo faltante: crema de naranja'))).toBe(true)
    expect(f.some((x) => x.startsWith('2 pedidos por confirmar'))).toBe(true)
  })

  it('sin nada que atender dice que todo está al día', () => {
    const f = frasesDeDecision({ ...datos, porConfirmar: 0, esperandoPago: { cantidad: 0, valor: 0 }, faltantes: { cantidad: 0 } })
    expect(f).toEqual(['Todo al día: no hay nada que atender.'])
  })
})

describe('Tablero', () => {
  const montar = (d: DatosTablero | null, alCambiar = vi.fn()) =>
    render(
      <MemoryRouter>
        <Tablero datos={d} periodo="hoy" alCambiarPeriodo={alCambiar} />
      </MemoryRouter>,
    )

  it('con datos muestra atención, ventas en grande, indicadores, gráficos y frases', () => {
    montar(datos)
    const atencion = screen.getByRole('region', { name: 'Lo que pide atención' })
    expect(within(atencion).getByText('por confirmar').previousSibling).toHaveTextContent('2')
    expect(screen.getByText('Ventas de hoy')).toBeInTheDocument()
    expect(document.querySelector('data[value="1240000"]')).not.toBeNull()
    expect(screen.getByText('▲ 18 % frente al periodo anterior')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'margen 31 %' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Ventas y costo/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Unidades por semana/ })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Lo más vendido' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Qué hacer hoy' })).toHaveTextContent('3 pedidos esperan pago')
  })

  it('el selector de periodo avisa el cambio', () => {
    const alCambiar = vi.fn()
    montar(datos, alCambiar)
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(alCambiar).toHaveBeenCalledExactlyOnceWith('semana')
  })

  it('una variación negativa muestra la flecha hacia abajo y sin comparación no muestra nada', () => {
    const { unmount } = montar({ ...datos, variacionPct: -7 })
    expect(screen.getByText('▼ 7 % frente al periodo anterior')).toBeInTheDocument()
    unmount()
    montar({ ...datos, variacionPct: null })
    expect(screen.queryByText(/frente al periodo anterior/)).toBeNull()
  })

  it('sin datos (aún no hay ventas) muestra un estado vacío que invita a actuar y ningún gráfico', () => {
    montar(null)
    expect(screen.getByText(/Aún no hay ventas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar el primer pedido' })).toHaveAttribute('href', '/ventas/nuevo')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Inicio con el tablero', () => {
  it('muestra el estado vacío del tablero mientras no existan ventas', async () => {
    render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    expect(await screen.findByText(/Aún no hay ventas/)).toBeInTheDocument()
    expect(screen.queryByText(/llega pronto/i)).toBeNull()
  })
})
