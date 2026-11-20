import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaminoDB } from '../../infra/db/db'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from '../../infra/sync/servidorSimulado'
import { crearEscritor } from '../../infra/sync/writer'
import { PendientesProvider } from '../pendientes/contexto'
import { TerceroDetalle } from './TerceroDetalle'
import { TerceroNuevo } from './TerceroNuevo'
import { Terceros } from './Terceros'

let db: CaminoDB
let srv: ServidorSimulado
let enLinea = true
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- el parámetro solo tipa las llamadas del mock
const guardar = vi.fn(async (_p: { opId: string; entidad: string; entidadId: string; archivo: Blob }) => ({ id: 'adj1' }))
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

function montar(ruta: string) {
  const servicio = crearPendientesService({ db, api: srv })
  const escritor = crearEscritor({ db, api: srv, enLinea: () => enLinea })
  return render(
    <PendientesProvider db={db} servicio={servicio} escritor={escritor} adjuntos={{ guardar, subirListas } as never}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/terceros" element={<Terceros />} />
          <Route path="/terceros/nuevo" element={<TerceroNuevo />} />
          <Route path="/terceros/:id" element={<TerceroDetalle />} />
          <Route path="/pendientes" element={<p>Pantalla de pendientes</p>} />
        </Routes>
      </MemoryRouter>
    </PendientesProvider>,
  )
}

const sembrar = () =>
  db.terceros.bulkPut([
    { id: 't1', nombre: 'Doña María Pérez', telefono: '3001234567', numero_documento: '1020304050', roles: ['proveedor'], es_proveedor: true },
    { id: 't2', nombre: 'Tienda La Esquina', telefono: '3109998877', roles: ['cliente'], es_cliente: true },
    { id: 't3', nombre: 'Don Luis', telefono: '3205550000', roles: ['cliente', 'proveedor'], es_cliente: true, es_proveedor: true, _pendiente: 'op-9' },
  ])

const escribir = (etiqueta: RegExp | string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })

describe('[RF-TER-01][RF-TER-02] lista y búsqueda local', () => {
  it('estado vacío sin terceros', async () => {
    montar('/terceros')
    expect(await screen.findByText(/aún no hay terceros/i)).toBeInTheDocument()
  })

  it('lista todos y filtra al instante por nombre, teléfono y documento (sin red)', async () => {
    await sembrar()
    enLinea = false
    srv.caido = true
    montar('/terceros')
    expect(await screen.findByText('Doña María Pérez')).toBeInTheDocument()
    expect(screen.getByText('Tienda La Esquina')).toBeInTheDocument()

    escribir(/buscar/i, 'maria') // sin tildes ni mayúsculas
    await waitFor(() => expect(screen.queryByText('Tienda La Esquina')).toBeNull())
    expect(screen.getByText('Doña María Pérez')).toBeInTheDocument()

    escribir(/buscar/i, '310 999')
    await waitFor(() => expect(screen.getByText('Tienda La Esquina')).toBeInTheDocument())
    expect(screen.queryByText('Doña María Pérez')).toBeNull()

    escribir(/buscar/i, '1020304')
    await waitFor(() => expect(screen.getByText('Doña María Pérez')).toBeInTheDocument())
    expect(srv.llamadas).toHaveLength(0)
  })

  it('«Volver» abre Más cuando se llega directo', async () => {
    await sembrar()
    montar('/terceros')
    expect(await screen.findByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/mas')
  })

  it('sin coincidencias muestra un mensaje', async () => {
    await sembrar()
    montar('/terceros')
    await screen.findByText('Don Luis')
    escribir(/buscar/i, 'zzzz')
    expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument()
  })

  it('filtra por rol', async () => {
    await sembrar()
    montar('/terceros')
    await screen.findByText('Don Luis')
    fireEvent.click(screen.getByRole('button', { name: 'Proveedores' }))
    await waitFor(() => expect(screen.queryByText('Tienda La Esquina')).toBeNull())
    expect(screen.getByText('Doña María Pérez')).toBeInTheDocument()
    expect(screen.getByText('Don Luis')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clientes' }))
    await waitFor(() => expect(screen.queryByText('Doña María Pérez')).toBeNull())
  })

  it('el rediseño: nombres en cursiva, filtro en pastillas y filas con filete punteado', async () => {
    await sembrar()
    montar('/terceros')
    const nombre = await screen.findByText('Don Luis')
    expect(nombre.className).toContain('nombre')
    expect(nombre.closest('li')!.className).toContain('border-dotted')
    const grupo = screen.getByRole('group', { name: 'Filtrar por rol' })
    expect(within(grupo).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: 'Todos' }).className).toContain('rounded-full')
    expect(within(grupo).getByRole('button', { name: 'Clientes' }).className).toContain('min-h-12')
  })

  it('marca con ⏳ las filas con _pendiente', async () => {
    await sembrar()
    montar('/terceros')
    const fila = (await screen.findByText('Don Luis')).closest('li') as HTMLElement
    expect(within(fila).getByText(/sin subir/i)).toBeInTheDocument()
    const otra = screen.getByText('Tienda La Esquina').closest('li') as HTMLElement
    expect(within(otra).queryByText(/sin subir/i)).toBeNull()
  })

  it('cada fila enlaza al detalle y hay botón para crear', async () => {
    await sembrar()
    montar('/terceros')
    const enlace = await screen.findByRole('link', { name: /Doña María Pérez/ })
    expect(enlace).toHaveAttribute('href', '/terceros/t1')
    expect(screen.getByRole('link', { name: /nuevo/i })).toHaveAttribute('href', '/terceros/nuevo')
  })

  it('[RF-TER-01] el detalle es de solo lectura (sin editar ni borrar)', async () => {
    await sembrar()
    montar('/terceros/t1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Doña María Pérez' })).toBeInTheDocument()
    expect(screen.getByText('3001234567')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).toBeNull()
  })

  it('detalle de un id inexistente avisa', async () => {
    montar('/terceros/nada')
    expect(await screen.findByText(/no se encontró/i)).toBeInTheDocument()
  })
})

describe('[RF-TER-03] captura de proveedor en campo (offline)', () => {
  it('sin conexión se encola, queda con ⏳ y no manda nada al servidor', async () => {
    enLinea = false
    srv.caido = true
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    escribir('Teléfono', '300 123 4567')
    escribir('Vereda', 'La Palma')
    escribir('Municipio', 'Pacho')
    escribir(/productos que ofrece/i, 'panela, café')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText(/guardado en este teléfono/i)).toBeInTheDocument()
    expect(srv.llamadas.length).toBeLessThanOrEqual(0)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.tipo).toBe('tercero.crear')
    expect(ops[0]!.datos).toMatchObject({ nombre: 'Don Pacho', es_proveedor: true, es_cliente: false, vereda: 'La Palma', productos_ofrecidos: 'panela, café' })
    const fila = (await db.terceros.toArray())[0]!
    expect(fila._pendiente).toBe(ops[0]!.op_id)
    expect(fila.roles).toEqual(['proveedor'])
  })

  it('con conexión se aplica y no queda en outbox', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(srv.aplicadas.size).toBe(1))
    expect(await db.outbox.count()).toBe(0)
  })

  it('usa la ubicación del teléfono (GPS)', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 5.1355, longitude: -74.1561, accuracy: 12 } } as GeolocationPosition),
    )
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /usar mi ubicación/i }))
    await waitFor(() => expect(screen.getByLabelText('Latitud')).toHaveValue('5.1355'))
    expect(screen.getByLabelText('Longitud')).toHaveValue('-74.1561')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(srv.aplicadas.size).toBe(1))
    expect(srv.llamadas[0]![0]!.datos).toMatchObject({ latitud: 5.1355, longitud: -74.1561 })
  })

  it('si el GPS falla o se niega, deja escribir latitud y longitud a mano', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, err: PositionErrorCallback) =>
      err({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /usar mi ubicación/i }))
    expect(await screen.findByText(/no pudimos obtener la ubicación/i)).toBeInTheDocument()
    escribir('Latitud', '5,2')
    escribir('Longitud', '-74.3')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(srv.aplicadas.size).toBe(1))
    expect(srv.llamadas[0]![0]!.datos).toMatchObject({ latitud: 5.2, longitud: -74.3 })
  })

  it('rechaza coordenadas fuera de rango', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    escribir('Latitud', '95')
    escribir('Longitud', '-74')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/latitud.*entre -90 y 90/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('foto opcional: se guarda en el teléfono ligada a la op y al tercero', async () => {
    enLinea = false
    srv.caido = true
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    const archivo = new File(['x'], 'finca.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/foto/i), { target: { files: [archivo] } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await screen.findByText(/guardado en este teléfono/i)
    const op = (await db.outbox.toArray())[0]!
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ opId: op.op_id, entidad: 'tercero', archivo }))
    expect((op.datos as { id: string }).id).toBe(guardar.mock.calls[0]![0].entidadId)
  })

  it('valida nombre obligatorio y teléfono de 7 a 15 dígitos', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/escribe el nombre/i)).toBeInTheDocument()
    escribir('Nombre', 'Don Pacho')
    escribir('Teléfono', '123')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/entre 7 y 15 dígitos/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('exige elegir al menos un rol', async () => {
    montar('/terceros/nuevo')
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/elige si es cliente, proveedor o ambos/i)).toBeInTheDocument()
  })
})

describe('[RF-TER-05][RN-DAT-01] cliente nuevo y consentimiento', () => {
  it('el cliente sin consentimiento no se guarda', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Cliente' }))
    escribir('Nombre', 'Tienda La Esquina')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/consentimiento.*obligatorio/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('el proveedor no necesita consentimiento (la casilla no aparece)', () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    expect(screen.queryByRole('checkbox', { name: /datos/i })).toBeNull()
  })

  it('con consentimiento envía bandera y fecha', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Cliente' }))
    escribir('Nombre', 'Tienda La Esquina')
    fireEvent.click(screen.getByRole('checkbox', { name: /autoriza.*datos/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(srv.aplicadas.size).toBe(1))
    const datos = srv.llamadas[0]![0]!.datos as { consentimiento_datos: boolean; consentimiento_en: string; es_cliente: boolean }
    expect(datos.es_cliente).toBe(true)
    expect(datos.consentimiento_datos).toBe(true)
    expect(datos.consentimiento_en).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('ambos roles también exigen consentimiento', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    escribir('Nombre', 'Don Luis')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/consentimiento.*obligatorio/i)).toBeInTheDocument()
  })

  it('[D-009] cliente sin conexión: «Requiere conexión» y no se encola', async () => {
    enLinea = false
    srv.caido = true
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Cliente' }))
    escribir('Nombre', 'Tienda La Esquina')
    fireEvent.click(screen.getByRole('checkbox', { name: /autoriza.*datos/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/requiere conexión/i)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(0)
    expect(await db.terceros.count()).toBe(0)
  })

  it('un rechazo del servidor se muestra y no se encola', async () => {
    srv.manejadores['tercero.crear'] = () => ({ status: 'error', error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Teléfono inválido' } })
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/Teléfono inválido/)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(0)
  })

  it('si el servidor pide revisión (posible duplicado) avisa y enlaza a Pendientes', async () => {
    srv.manejadores['tercero.crear'] = () => ({
      status: 'revision',
      resultado: { candidatos: [{ id: 'x', nombre: 'Don Pacho R.', telefono: '3001234567' }] },
    })
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    escribir('Nombre', 'Don Pacho')
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/posible duplicado/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pendientes/i })).toHaveAttribute('href', '/pendientes')
    expect((await db.outbox.toArray())[0]!.estado).toBe('revision')
  })
})

describe('[RNF-UX-04] accesibilidad básica', () => {
  it('todos los campos del formulario tienen etiqueta y los botones son táctiles', () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    for (const campo of screen.getAllByRole('textbox')) {
      expect(campo).toHaveAccessibleName()
    }
    for (const b of screen.getAllByRole('button')) expect(b.className).toMatch(/min-h-12/)
  })

  it('los errores se anuncian con role=alert y se vinculan al campo', async () => {
    montar('/terceros/nuevo')
    fireEvent.click(screen.getByRole('radio', { name: 'Proveedor' }))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const nombre = screen.getByLabelText('Nombre')
    await waitFor(() => expect(nombre).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  })
})
