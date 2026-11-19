// Componentes base del rediseño (T-D2, CAM-107, docs/producto/diseno.md): logo de marca, botón en pastilla,
// superficies de papel, selector de periodo, cifras de dinero y filas con filete punteado.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CampoSelect } from '../catalogo/campos'
import { Boton, BotonEnlace } from './Boton'
import { CampoTexto } from './CampoTexto'
import { Dinero } from './Dinero'
import { FilaLista } from './FilaLista'
import { Logo } from './Logo'
import { Segmentos } from './Segmentos'
import { SelectorPeriodo } from './SelectorPeriodo'
import { Tarjeta } from './Tarjeta'

const sinEspacios = (s: string | null) => (s ?? '').replace(new RegExp('[\\s\\u00a0\\u202f]', 'g'), '')

describe('Logo', () => {
  it('dibuja la montaña con camino aprobada de la web, con el color del texto', () => {
    const { container } = render(<Logo titulo="Camino" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '20 23.25 553.25 308.5')
    expect(svg).toHaveAttribute('fill', 'currentColor')
    expect(svg.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(1000)
  })

  it('con título es una imagen accesible; sin título es decorativo', () => {
    const { rerender } = render(<Logo titulo="Camino" />)
    expect(screen.getByRole('img', { name: 'Camino' })).toBeInTheDocument()
    rerender(<Logo />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Boton rediseñado', () => {
  it('es una pastilla', () => {
    render(<Boton>Guardar</Boton>)
    expect(screen.getByRole('button', { name: 'Guardar' }).className).toContain('rounded-full')
  })

  it('deshabilitado se ve apagado con intención (arena y tinta), no con opacidad', () => {
    render(<Boton disabled>Guardar</Boton>)
    const clases = screen.getByRole('button', { name: 'Guardar' }).className
    expect(clases).toContain('disabled:bg-arena')
    expect(clases).toContain('disabled:text-texto-secundario')
    expect(clases).not.toContain('opacity-50')
  })
})

describe('Tarjeta y CampoTexto rediseñados', () => {
  it('la tarjeta es blanca sobre el papel y lleva la sombra de papeles apilados', () => {
    render(<Tarjeta data-testid="t">x</Tarjeta>)
    const clases = screen.getByTestId('t').className
    expect(clases).toContain('bg-tarjeta')
    expect(clases).toContain('shadow-papel')
  })

  it('el campo es blanco sobre el papel', () => {
    render(<CampoTexto etiqueta="Correo" />)
    expect(screen.getByLabelText('Correo').className).toContain('bg-tarjeta')
  })
})

describe('Segmentos y SelectorPeriodo', () => {
  const opciones = [
    { valor: 'a', texto: 'Uno' },
    { valor: 'b', texto: 'Dos' },
  ]

  it('es un grupo con nombre; la opción activa va con aria-pressed y cada una mide 48 px', () => {
    render(<Segmentos etiqueta="Vista" opciones={opciones} valor="b" alCambiar={() => {}} />)
    const grupo = screen.getByRole('group', { name: 'Vista' })
    const [uno, dos] = within(grupo).getAllByRole('button')
    expect(uno).toHaveAttribute('aria-pressed', 'false')
    expect(dos).toHaveAttribute('aria-pressed', 'true')
    expect(uno!.className).toContain('min-h-12')
  })

  it('al tocar otra opción avisa su valor; tocar la activa no repite', () => {
    const alCambiar = vi.fn()
    render(<Segmentos etiqueta="Vista" opciones={opciones} valor="a" alCambiar={alCambiar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Uno' }))
    expect(alCambiar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dos' }))
    expect(alCambiar).toHaveBeenCalledExactlyOnceWith('b')
  })

  it('SelectorPeriodo ofrece hoy, semana y mes (RF-DSH-01)', () => {
    const alCambiar = vi.fn()
    render(<SelectorPeriodo valor="hoy" alCambiar={alCambiar} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Hoy', 'Semana', 'Mes'])
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(alCambiar).toHaveBeenCalledExactlyOnceWith('semana')
  })
})

describe('Dinero', () => {
  it.each([0, 38000, 1240000, -5000])('muestra %i en pesos sin decimales, en Fraunces con cifras tabulares', (v) => {
    render(<Dinero valor={v} />)
    const el = document.querySelector('data')!
    expect(sinEspacios(el.textContent)).toBe(sinEspacios(new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' }).format(v)))
    expect(el).toHaveAttribute('value', String(v))
    expect(el.className).toContain('font-titulo')
    expect(el.className).toContain('tabular-nums')
  })

  it('el signo $ va más pequeño y en tinta, aparte de la cifra', () => {
    render(<Dinero valor={38000} />)
    const signo = screen.getByText('$')
    expect(signo.className).toContain('text-texto-secundario')
    expect(signo.className).toContain('text-[0.6em]')
  })
})

describe('FilaLista', () => {
  it('es un elemento de lista de al menos 48 px con filete punteado', () => {
    render(
      <ul>
        <FilaLista>Catálogo</FilaLista>
      </ul>,
    )
    const fila = screen.getByRole('listitem')
    expect(fila).toHaveTextContent('Catálogo')
    expect(fila.className).toContain('min-h-12')
    expect(fila.className).toContain('border-dotted')
  })
})

describe('revisión de T-D2: coherencia y casos límite', () => {
  it('Boton secundario es contorno cacao sobre fondo transparente', () => {
    render(<Boton variante="secundario">Ver</Boton>)
    const clases = screen.getByRole('button', { name: 'Ver' }).className
    for (const c of ['border-acento', 'text-acento', 'bg-transparent']) expect(clases).toContain(c)
  })

  it('BotonEnlace es un enlace en pastilla con la variante marcada', () => {
    render(
      <MemoryRouter>
        <BotonEnlace to="/x" variante="peligro">
          Ir
        </BotonEnlace>
      </MemoryRouter>,
    )
    const a = screen.getByRole('link', { name: 'Ir' })
    expect(a).toHaveAttribute('data-variante', 'peligro')
    expect(a.className).toContain('rounded-full')
  })

  it('el select comparte el fondo blanco del campo de texto', () => {
    render(
      <CampoSelect etiqueta="Tipo">
        <option>CC</option>
      </CampoSelect>,
    )
    expect(screen.getByLabelText('Tipo').className).toContain('bg-tarjeta')
  })

  it('ningún campo con borde fuerte (campo o select) queda sobre el papel: todos usan bg-tarjeta', () => {
    const recorre = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const ruta = join(dir, n)
        return statSync(ruta).isDirectory() ? recorre(ruta) : /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [ruta] : []
      })
    const culpables = recorre('src/ui').filter((f) =>
      readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .some((l) => l.includes('border-borde-fuerte') && l.includes('bg-fondo')),
    )
    expect(culpables).toEqual([])
  })

  it('Dinero con un valor no finito muestra un guion largo y no pinta NaN', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const { container, unmount } = render(<Dinero valor={v} />)
      expect(container.textContent).toBe('—')
      expect(container.textContent).not.toMatch(/NaN|∞/)
      expect(container.querySelector('data')).toBeNull()
      unmount()
    }
  })

  it('Dinero redondea al entero: lo legible y el valor de máquina coinciden', () => {
    render(<Dinero valor={0.4} />)
    expect(document.querySelector('data')).toHaveAttribute('value', '0')
  })

  it('Segmentos con un valor fuera de las opciones no marca ninguna; con lista vacía no hay botones', () => {
    const { rerender } = render(<Segmentos etiqueta="Vista" opciones={[{ valor: 'a', texto: 'Uno' }]} valor={'z' as 'a'} alCambiar={() => {}} />)
    expect(screen.getByRole('button', { name: 'Uno' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<Segmentos etiqueta="Vista" opciones={[]} valor={'a'} alCambiar={() => {}} />)
    expect(within(screen.getByRole('group', { name: 'Vista' })).queryAllByRole('button')).toHaveLength(0)
  })
})
