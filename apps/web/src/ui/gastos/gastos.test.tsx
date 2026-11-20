// Pantallas de gastos (T-M5-05, CAM-65): lista y formulario, también sin conexión. RF-PAG-03, D-009. Datos ficticios.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoyBogota } from '../../lib/formato'
import { CaminoDB } from '../../infra/db/db'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from '../../infra/sync/servidorSimulado'
import { crearEscritor } from '../../infra/sync/writer'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { PendientesProvider } from '../pendientes/contexto'
import { GastoNuevo } from './GastoNuevo'
import { Gastos } from './Gastos'

let db: CaminoDB
let srv: ServidorSimulado
let enLinea = true
const guardar = vi.fn(async () => ({ id: 'adj1' }))
const subirListas = vi.fn(async () => ({ vinculadas: 1, fallidas: 0, esperando: 0 }))

beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  srv = crearServidorSimulado()
  enLinea = true
  guardar.mockClear()
  subirListas.mockClear()
  await db.open()
})
afterEach(() => db.close())

function montar(ruta: string, conAdjuntos = true) {
  const servicio = crearPendientesService({ db, api: srv })
  const escritor = crearEscritor({ db, api: srv, enLinea: () => enLinea })
  return render(
    <PendientesProvider db={db} servicio={servicio} escritor={escritor} adjuntos={conAdjuntos ? ({ guardar, subirListas } as never) : undefined}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/gastos" element={<Gastos />} />
          <Route path="/gastos/nuevo" element={<GastoNuevo />} />
          <Route path="/pendientes" element={<p>Pantalla de pendientes</p>} />
          <Route path="/mas" element={<p>Pantalla de más</p>} />
        </Routes>
      </MemoryRouter>
    </PendientesProvider>,
  )
}

const escribir = (etiqueta: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const elegir = (categoria: string) => fireEvent.click(screen.getByRole('radio', { name: categoria }))
const guardarGasto = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))

describe('[RF-PAG-03] formulario de gasto', () => {
  it('trae la fecha de hoy, las categorías como opciones y un solo botón principal', () => {
    montar('/gastos/nuevo')
    expect(screen.getByRole('heading', { level: 1, name: 'Nuevo gasto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue(hoyBogota())
    const grupo = screen.getByRole('radiogroup', { name: 'Categoría' })
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Combustible', 'Empaques', 'Transporte', 'Alimentación', 'Otros'])
    expect(within(grupo).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeInTheDocument()
    expect(screen.getByText(/funciona sin conexión/i)).toBeInTheDocument()
  })

  it('elegir una categoría la marca y desmarca la anterior', () => {
    montar('/gastos/nuevo')
    elegir('Combustible')
    expect(screen.getByRole('radio', { name: 'Combustible' })).toHaveAttribute('aria-checked', 'true')
    elegir('Empaques')
    expect(screen.getByRole('radio', { name: 'Combustible' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Empaques' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sin llenar nada muestra los errores, los anuncia y no guarda nada', async () => {
    montar('/gastos/nuevo')
    guardarGasto()
    expect(await screen.findByText('Elige una categoría.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el valor del gasto.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Valor/)).toHaveAttribute('aria-invalid', 'true')
    expect(await db.outbox.count()).toBe(0)
    expect(srv.llamadas).toHaveLength(0)
  })

  it('con conexión envía gasto.registrar con el payload correcto y avisa que quedó guardado', async () => {
    montar('/gastos/nuevo')
    elegir('Combustible')
    escribir(/Valor/, '45.000')
    escribir(/Concepto/, '  ACPM del camión ')
    guardarGasto()
    expect(await screen.findByText(/gasto guardado/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(1)
    const op = srv.llamadas[0]![0]!
    expect(op.tipo).toBe('gasto.registrar')
    expect(op.datos).toMatchObject({ categoria: 'Combustible', concepto: 'ACPM del camión', valor: 45000, fecha: hoyBogota() })
    expect(await db.outbox.count()).toBe(0)
  })

  it('[D-009] sin conexión lo encola con su fila ⏳, sin enviar nada, y manda a Pendientes', async () => {
    enLinea = false
    montar('/gastos/nuevo')
    elegir('Empaques')
    escribir(/Valor/, '80000')
    guardarGasto()
    expect(await screen.findByText(/guardado en este teléfono/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveAttribute('href', '/pendientes')
    expect(srv.llamadas).toHaveLength(0)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.tipo).toBe('gasto.registrar')
    const filas = await db.gastos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ categoria: 'Empaques', valor: 80000, _pendiente: ops[0]!.op_id })
  })

  it('si el servidor lo rechaza, lo dice y deja el formulario con lo escrito', async () => {
    srv.manejadores['gasto.registrar'] = () => ({ status: 'error', error: { codigo: 'E_FECHA', mensaje: 'la fecha del gasto no puede ser futura' } })
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '5000')
    guardarGasto()
    expect(await screen.findByRole('alert')).toHaveTextContent(/fecha del gasto no puede ser futura/i)
    expect(screen.getByLabelText(/Valor/)).toHaveValue('5000')
    expect(screen.getByRole('radio', { name: 'Otros' })).toHaveAttribute('aria-checked', 'true')
  })

  it('con foto la guarda como soporte del gasto y no falla si la foto no se puede guardar', async () => {
    enLinea = false
    montar('/gastos/nuevo')
    elegir('Transporte')
    escribir(/Valor/, '20000')
    const archivo = new File(['x'], 'recibo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [archivo] } })
    guardarGasto()
    await screen.findByText(/guardado en este teléfono/i)
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'gasto', archivo }))

    guardar.mockRejectedValueOnce(new Error('sin espacio'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otro gasto' }))
    elegir('Otros')
    escribir(/Valor/, '1000')
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [archivo] } })
    guardarGasto()
    expect(await screen.findByText(/la foto no se pudo guardar/i)).toBeInTheDocument()
  })

  it('«Registrar otro gasto» deja el formulario limpio, con la fecha de hoy', async () => {
    montar('/gastos/nuevo')
    elegir('Combustible')
    escribir(/Valor/, '45000')
    guardarGasto()
    await screen.findByText(/gasto guardado/i)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otro gasto' }))
    expect(screen.getByLabelText(/Valor/)).toHaveValue('')
    expect(screen.getByLabelText('Fecha')).toHaveValue(hoyBogota())
    expect(screen.getByRole('radio', { name: 'Combustible' })).toHaveAttribute('aria-checked', 'false')
  })

  it('«Volver» abre la lista de gastos cuando se llega directo', () => {
    montar('/gastos/nuevo')
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/gastos')
  })

  it('el botón se deshabilita mientras guarda para no duplicar el gasto', async () => {
    let soltar: () => void = () => {}
    srv.manejadores['gasto.registrar'] = () => ({ status: 'ok', resultado: { id: 'x' } })
    const original = srv.aplicar.bind(srv)
    srv.aplicar = (ops, signal) => new Promise((ok) => (soltar = () => ok(original(ops, signal))))
    montar('/gastos/nuevo')
    elegir('Combustible')
    escribir(/Valor/, '45000')
    guardarGasto()
    await waitFor(() => expect(screen.getByRole('button', { name: /Guardando/ })).toBeDisabled())
    soltar()
    expect(await screen.findByText(/gasto guardado/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(1)
  })
})

describe('[RF-PAG-03] lista de gastos', () => {
  it('sin gastos muestra un estado vacío que invita a registrar el primero', async () => {
    montar('/gastos')
    expect(await screen.findByText(/aún no hay gastos/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nuevo gasto' })).toHaveAttribute('href', '/gastos/nuevo')
  })

  it('muestra los recientes con categoría, concepto, fecha y valor en pesos, y marca los que no se han subido', async () => {
    const hoy = hoyBogota()
    await db.gastos.bulkPut([
      { id: 'a', fecha: hoy, categoria: 'Combustible', concepto: 'ACPM', valor: 45000 },
      { id: 'b', fecha: hoy, categoria: 'Empaques', valor: 80000, _pendiente: 'op-1' },
    ])
    montar('/gastos')
    const lista = await screen.findByRole('list', { name: 'Gastos recientes' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    const combustible = filas.find((f) => f.textContent?.includes('Combustible'))!
    expect(combustible).toHaveTextContent('ACPM')
    expect(combustible.querySelector('data[value="45000"]')).not.toBeNull()
    expect(within(combustible).queryByText(/sin subir/i)).toBeNull()
    const empaques = filas.find((f) => f.textContent?.includes('Empaques'))!
    expect(within(empaques).getByText(/sin subir/i)).toBeInTheDocument()
  })

  it('arriba muestra el total del mes y no cuenta los gastos de otros meses', async () => {
    const hoy = hoyBogota()
    const mesAnterior = `${hoy.slice(0, 4)}-${String((Number(hoy.slice(5, 7)) + 10) % 12 + 1).padStart(2, '0')}-15`
    await db.gastos.bulkPut([
      { id: 'a', fecha: hoy, categoria: 'Combustible', valor: 45000 },
      { id: 'b', fecha: hoy, categoria: 'Otros', valor: 5000 },
      { id: 'c', fecha: mesAnterior, categoria: 'Otros', valor: 99999 },
    ])
    montar('/gastos')
    const total = await screen.findByLabelText('Total de gastos del mes')
    expect(total.querySelector('data[value="50000"]')).not.toBeNull()
  })

  it('«Volver» de la lista abre Más cuando se llega directo', async () => {
    montar('/gastos')
    expect(await screen.findByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/mas')
  })
})

describe('rutas de gastos', () => {
  it('/gastos y /gastos/nuevo son pantallas reales de la app, no «llega pronto»', async () => {
    const servicio = crearPendientesService({ db, api: srv })
    const escritor = crearEscritor({ db, api: srv, enLinea: () => enLinea })
    const enRuta = (ruta: string) =>
      render(
        <AuthProvider servicio={servicioFalso()}>
          <PendientesProvider db={db} servicio={servicio} escritor={escritor}>
            <MemoryRouter initialEntries={[ruta]}>
              <AppRoutes />
            </MemoryRouter>
          </PendientesProvider>
        </AuthProvider>,
      )
    const { unmount } = enRuta('/gastos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Gastos' })).toBeInTheDocument()
    expect(screen.queryByText(/llega pronto/i)).toBeNull()
    unmount()
    enRuta('/gastos/nuevo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuevo gasto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeInTheDocument()
  })
})

describe('revisión de T-M5-05: gasto con conexión, foco, límites y estados', () => {
  const mananaDe = (hoy: string) => {
    const d = new Date(`${hoy}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  const mesAnteriorDe = (hoy: string) => {
    const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return `${d.toISOString().slice(0, 7)}-15`
  }

  it('[P1] con conexión el gasto también queda en el teléfono (sync_pull no trae gastos): aparece en la lista y suma en el total', async () => {
    montar('/gastos/nuevo')
    elegir('Combustible')
    escribir(/Valor/, '45.000')
    guardarGasto()
    await screen.findByText(/gasto guardado/i)
    const filas = await db.gastos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ categoria: 'Combustible', valor: 45000, fecha: hoyBogota() })
    expect(filas[0]!._pendiente).toBeUndefined() // ya está en el servidor
    fireEvent.click(screen.getByRole('link', { name: 'Ver gastos' }))
    // «Ver gastos» abre la lista de este mismo árbol
    const total = await screen.findByLabelText('Total de gastos del mes')
    expect(total.querySelector('data[value="45000"]')).not.toBeNull()
  })

  it('con conexión y con la fila ya existente, no se duplica al volver a guardar el mismo id', async () => {
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '1000')
    guardarGasto()
    await screen.findByText(/gasto guardado/i)
    const [fila] = await db.gastos.toArray()
    await db.gastos.put({ ...fila! })
    expect(await db.gastos.count()).toBe(1)
  })

  it('el total y la lista dicen que son de este teléfono', async () => {
    await db.gastos.put({ id: 'a', fecha: hoyBogota(), categoria: 'Otros', valor: 1000 })
    montar('/gastos')
    const total = await screen.findByLabelText('Total de gastos del mes')
    expect(total).toHaveTextContent(/en este teléfono/i)
  })

  it('un valor por encima del tope se frena en el formulario, con su mensaje, sin llamar al servidor', async () => {
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '9'.repeat(20))
    guardarGasto()
    expect(await screen.findByText('El valor es demasiado grande.')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('la fecha futura y la fecha vacía se frenan en pantalla', async () => {
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '1000')
    escribir('Fecha', mananaDe(hoyBogota()))
    guardarGasto()
    expect(await screen.findByText('La fecha no puede ser futura.')).toBeInTheDocument()
    escribir('Fecha', '')
    guardarGasto()
    expect(await screen.findByText('Elige la fecha del gasto.')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('tras un envío inválido el foco va al primer campo con error', async () => {
    montar('/gastos/nuevo')
    guardarGasto() // sin categoría ni valor
    await screen.findByText('Elige una categoría.')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Combustible' })).toHaveFocus())
    elegir('Otros')
    guardarGasto() // solo falta el valor
    await screen.findByText('Escribe el valor del gasto.')
    await waitFor(() => expect(screen.getByLabelText(/Valor/)).toHaveFocus())
  })

  it('con la sesión vencida (401) lo deja guardado en el teléfono y lo dice', async () => {
    srv.forzar.push({ clase: 'no_aplicado', http: 401, mensaje: 'JWT expired' })
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '1000')
    guardarGasto()
    expect(await screen.findByText(/tu sesión venció/i)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(1)
  })

  it('si la aplicación aún no tiene escritor, avisa y no pierde lo escrito', async () => {
    const servicio = crearPendientesService({ db, api: srv })
    render(
      <PendientesProvider db={db} servicio={servicio}>
        <MemoryRouter initialEntries={['/gastos/nuevo']}>
          <Routes>
            <Route path="/gastos/nuevo" element={<GastoNuevo />} />
          </Routes>
        </MemoryRouter>
      </PendientesProvider>,
    )
    elegir('Otros')
    escribir(/Valor/, '1000')
    guardarGasto()
    expect(await screen.findByRole('alert')).toHaveTextContent(/aún no está lista/i)
    expect(screen.getByLabelText(/Valor/)).toHaveValue('1000')
  })

  it('con conexión y foto, sube las fotos listas después de guardarla', async () => {
    montar('/gastos/nuevo')
    elegir('Transporte')
    escribir(/Valor/, '20000')
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [new File(['x'], 'r.jpg', { type: 'image/jpeg' })] } })
    guardarGasto()
    await screen.findByText(/gasto guardado/i)
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(subirListas).toHaveBeenCalledTimes(1)
  })

  it('con conexión, si la foto falla, el gasto queda guardado y lo avisa', async () => {
    guardar.mockRejectedValueOnce(new Error('sin espacio'))
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '1000')
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [new File(['x'], 'r.jpg', { type: 'image/jpeg' })] } })
    guardarGasto()
    expect(await screen.findByText(/gasto guardado\. la foto no se pudo guardar/i)).toBeInTheDocument()
  })

  it('Enter en un campo con el botón deshabilitado no envía dos veces', async () => {
    let soltar: () => void = () => {}
    const original = srv.aplicar.bind(srv)
    srv.aplicar = (ops, signal) => new Promise((ok) => (soltar = () => ok(original(ops, signal))))
    montar('/gastos/nuevo')
    elegir('Otros')
    escribir(/Valor/, '1000')
    fireEvent.submit(screen.getByLabelText(/Valor/).closest('form')!)
    await waitFor(() => expect(screen.getByRole('button', { name: /Guardando/ })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /Guardando/ }))
    soltar()
    await screen.findByText(/gasto guardado/i)
    expect(srv.llamadas).toHaveLength(1)
  })

  it('la lista muestra «Cargando…» al abrir y un error claro si no se puede leer', async () => {
    const { unmount } = montar('/gastos')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    unmount()
    vi.spyOn(db.gastos, 'toArray').mockRejectedValue(new Error('IndexedDB no disponible'))
    montar('/gastos')
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron leer los gastos/i)
    vi.restoreAllMocks()
  })

  it('la lista dibuja como máximo 50 gastos, los más recientes', async () => {
    const hoy = hoyBogota()
    await db.gastos.bulkPut(Array.from({ length: 55 }, (_, i) => ({ id: `g-${String(i).padStart(3, '0')}`, fecha: hoy, categoria: 'Otros', valor: 1000 + i })))
    montar('/gastos')
    const lista = await screen.findByRole('list', { name: 'Gastos recientes' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(50)
    expect(lista.querySelector('data[value="1054"]')).not.toBeNull() // el último creado va primero
    expect(lista.querySelector('data[value="1000"]')).toBeNull() // los más viejos quedan fuera
  })

  it('una fila con fecha vacía o inválida no tira abajo la lista: muestra «Sin fecha»', async () => {
    await db.gastos.bulkPut([
      { id: 'a', fecha: '', categoria: 'Combustible', valor: 1000 },
      { id: 'b', fecha: 'no-es-fecha', categoria: 'Empaques', valor: 2000 },
    ])
    montar('/gastos')
    const lista = await screen.findByRole('list', { name: 'Gastos recientes' })
    expect(within(lista).getAllByText('Sin fecha')).toHaveLength(2)
  })

  it('el total del mes no cuenta el mes anterior, también en enero (el mes anterior es diciembre del año anterior)', async () => {
    const hoy = hoyBogota()
    await db.gastos.bulkPut([
      { id: 'a', fecha: hoy, categoria: 'Otros', valor: 5000 },
      { id: 'b', fecha: mesAnteriorDe(hoy), categoria: 'Otros', valor: 99999 },
      { id: 'c', fecha: mesAnteriorDe(`${Number(hoy.slice(0, 4)) + 1}-01-20`), categoria: 'Otros', valor: 77777 },
    ])
    montar('/gastos')
    const total = await screen.findByLabelText('Total de gastos del mes')
    expect(total.querySelector('data[value="5000"]')).not.toBeNull()
  })
})
