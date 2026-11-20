import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogo } from '../../application/catalogo/contexto'
import {
  MEDIOS_PAGO,
  PROVEEDOR_NUEVO,
  armarDatos,
  filasLocales,
  formVacio,
  lineaVacia,
  totalCompra,
  validarForm,
  type ErroresCompra,
  type FormCompra,
  type InfoArticulo,
  type LineaCompra,
  type Modalidad,
} from '../../application/compras/compras'
import { useTerceros } from '../../application/terceros/terceros'
import { hoyBogota } from '../../lib/formato'
import { uuidV7 } from '../../lib/uuid'
import { ErrorDominio, type ResultadoCommit } from '../../infra/sync/writer'
import { Aviso } from '../componentes/Aviso'
import { Boton, BotonEnlace, CLASES_ENLACE } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { Chips } from '../componentes/Chips'
import { Dinero } from '../componentes/Dinero'
import { Pagina } from '../componentes/Pagina'
import { Segmentos } from '../componentes/Segmentos'
import { Tarjeta } from '../componentes/Tarjeta'
import { CampoSelect, texto } from '../catalogo/campos'
import { usePendientesCtx } from '../pendientes/contexto'

const MODALIDADES: Array<{ valor: Modalidad; texto: string }> = [
  { valor: 'inmediata', texto: 'Inmediata' },
  { valor: 'encargo', texto: 'Encargo' },
]

type Resultado =
  | { tipo: 'aplicado'; modalidad: Modalidad; fotoFallo: boolean }
  | { tipo: 'encolado'; modalidad: Modalidad; aviso?: string; fotoFallo: boolean }
  | { tipo: 'revision'; candidatos: Array<{ nombre?: string; telefono?: string }> }

/**
 * Registro de una compra (RF-COM-01 a 05). Inmediata: la de finca, con recepción total y pago en un solo paso.
 * Encargo: se pide ahora y se recibe después. Funciona sin conexión (D-009, [E1]): sin señal queda en Pendientes.
 */
export function CompraNueva() {
  const { db, escritor, adjuntos } = usePendientesCtx()
  const catalogo = useCatalogo()
  const terceros = useTerceros(db)
  const [form, setForm] = useState<FormCompra>(() => formVacio(hoyBogota()))
  const [errores, setErrores] = useState<ErroresCompra>({})
  const [archivo, setArchivo] = useState<File | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [intentos, setIntentos] = useState(0) // sube con cada envío inválido: lleva el foco al primer error
  const [version, setVersion] = useState(0) // cambia al «Registrar otra compra»: limpia también el campo de archivo
  const formulario = useRef<HTMLFormElement>(null)

  const articulos = useMemo(() => (catalogo.fase === 'listo' ? catalogo.datos.articulos.filter((a) => a.activo !== false) : []), [catalogo])
  const infoArticulos = useMemo(
    () => Object.fromEntries(articulos.map((a) => [a.id, { controla_vencimiento: Boolean(a['controla_vencimiento']), controla_lote: Boolean(a['controla_lote']) }])) as Record<string, InfoArticulo & { controla_lote?: boolean }>,
    [articulos],
  )
  const proveedores = useMemo(
    () =>
      terceros.fase === 'listo'
        ? terceros.terceros.filter((t) => !t['deleted_at'] && (t.roles ?? []).includes('proveedor')).sort((a, b) => String(a['nombre'] ?? '').localeCompare(String(b['nombre'] ?? ''), 'es'))
        : [],
    [terceros],
  )

  useEffect(() => {
    if (intentos === 0) return
    const invalido = formulario.current?.querySelector('[aria-invalid="true"]')
    ;(invalido as HTMLElement | null)?.focus()
  }, [intentos])

  const poner = <K extends keyof FormCompra>(k: K, v: FormCompra[K]) => setForm((f) => ({ ...f, [k]: v }))
  const ponerLinea = (i: number, parcial: Partial<LineaCompra>) =>
    setForm((f) => ({ ...f, lineas: f.lineas.map((l, j) => (j === i ? { ...l, ...parcial } : l)) }))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const errs = validarForm(form, infoArticulos, hoyBogota())
    setErrores(errs)
    if (Object.keys(errs).length > 0) {
      setIntentos((n) => n + 1)
      return
    }
    if (!escritor) {
      setAviso('La aplicación aún no está lista. Intenta de nuevo.')
      return
    }
    const datos = armarDatos(form, uuidV7, new Date())
    setEnviando(true)
    try {
      const r: ResultadoCommit = await escritor.commit({ tipo: 'orden_compra.registrar', datos, filasLocales: filasLocales(datos) })
      let fotoFallo = false
      if (archivo && adjuntos) {
        try {
          await adjuntos.guardar({ opId: r.op_id, entidad: 'orden_compra', entidadId: datos.orden.id, archivo })
          if (r.estado === 'aplicada') await adjuntos.subirListas().catch(() => undefined)
        } catch {
          fotoFallo = true
        }
      }
      if (r.estado === 'revision') setResultado({ tipo: 'revision', candidatos: r.candidatos as Array<{ nombre?: string; telefono?: string }> })
      else if (r.estado === 'aplicada') setResultado({ tipo: 'aplicado', modalidad: form.modalidad, fotoFallo })
      else setResultado({ tipo: 'encolado', modalidad: form.modalidad, aviso: r.aviso, fotoFallo })
    } catch (err) {
      setAviso(err instanceof ErrorDominio ? err.message : 'No se pudo guardar. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  function otra() {
    setForm(formVacio(hoyBogota()))
    setErrores({})
    setArchivo(null)
    setAviso(null)
    setResultado(null)
    setVersion((v) => v + 1)
  }

  if (resultado) {
    const nombre = (m: Modalidad) => (m === 'inmediata' ? 'Compra' : 'Encargo')
    return (
      <Pagina titulo="Nueva compra" volverA="/compras">
        {resultado.tipo === 'aplicado' && (
          <Aviso>{`${nombre(resultado.modalidad)} ${resultado.modalidad === 'inmediata' ? 'registrada' : 'registrado'}.${resultado.fotoFallo ? ' La foto no se pudo guardar.' : ''}`}</Aviso>
        )}
        {resultado.tipo === 'encolado' && (
          <Aviso tono="advertencia">
            {`${nombre(resultado.modalidad)} ${resultado.modalidad === 'inmediata' ? 'guardada' : 'guardado'} en este teléfono. Se sube cuando pulses «Subir seleccionados» en `}
            <Link to="/pendientes" className={CLASES_ENLACE}>
              Pendientes
            </Link>
            .{resultado.aviso ? ` ${resultado.aviso}` : ''}
            {resultado.fotoFallo ? ' La foto no se pudo guardar.' : ''}
          </Aviso>
        )}
        {resultado.tipo === 'revision' && (
          <Aviso tono="advertencia">
            <p className="font-medium">Posible duplicado: ya existe un proveedor parecido.</p>
            <ul className="my-2">
              {resultado.candidatos.map((c, i) => (
                <li key={i}>
                  {c.nombre}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </li>
              ))}
            </ul>
            <p>
              La compra quedó guardada en este teléfono. Decide qué hacer en{' '}
              <Link to="/pendientes" className={CLASES_ENLACE}>
                Pendientes
              </Link>
              .
            </p>
          </Aviso>
        )}
        <div className="flex flex-col gap-3">
          <Boton onClick={otra}>Registrar otra compra</Boton>
          <BotonEnlace to="/compras" variante="secundario">
            Ir a Compras
          </BotonEnlace>
        </div>
      </Pagina>
    )
  }

  const inmediata = form.modalidad === 'inmediata'
  return (
    <Pagina titulo="Nueva compra" volverA="/compras">
      <Aviso tono="info">Funciona sin conexión: si no hay señal, se guarda en este teléfono y la subes después.</Aviso>
      <form key={version} ref={formulario} onSubmit={(e) => void guardar(e)} noValidate className="flex flex-col gap-4">
        <Segmentos etiqueta="Tipo de compra" opciones={MODALIDADES} valor={form.modalidad} alCambiar={(m) => poner('modalidad', m)} />
        <p className="-mt-2 text-pequeno text-texto-secundario">
          {inmediata ? 'La compra de finca: recibes y pagas en el momento.' : 'Pides ahora y recibes después.'}
        </p>

        <Tarjeta className="flex flex-col gap-4">
          <CampoSelect etiqueta="Proveedor" value={form.proveedorId} onChange={(e) => poner('proveedorId', e.target.value)} error={errores.proveedor}>
            <option value="">Elige…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p['nombre'] ?? '')}
              </option>
            ))}
            <option value={PROVEEDOR_NUEVO}>Nuevo proveedor</option>
          </CampoSelect>
          {form.proveedorId === PROVEEDOR_NUEVO && (
            <>
              <CampoTexto
                etiqueta="Nombre del proveedor"
                autoComplete="off"
                value={form.proveedorNuevo.nombre}
                onChange={(e) => poner('proveedorNuevo', { ...form.proveedorNuevo, nombre: e.target.value })}
                error={errores.proveedorNombre}
              />
              <CampoTexto
                etiqueta="Teléfono (opcional)"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.proveedorNuevo.telefono}
                onChange={(e) => poner('proveedorNuevo', { ...form.proveedorNuevo, telefono: e.target.value })}
                error={errores.proveedorTelefono}
              />
            </>
          )}
        </Tarjeta>

        {form.lineas.map((l, i) => {
          const e = errores.detalle?.[i] ?? {}
          const info = infoArticulos[l.articuloId]
          const n = i + 1
          return (
            <Tarjeta key={i} className="flex flex-col gap-4">
              <CampoSelect etiqueta={`Artículo ${n}`} value={l.articuloId} onChange={(ev) => ponerLinea(i, { articuloId: ev.target.value })} error={e.articulo}>
                <option value="">Elige…</option>
                {articulos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {texto(a, 'nombre')}
                  </option>
                ))}
              </CampoSelect>
              <CampoTexto etiqueta={`Cantidad ${n}`} inputMode="decimal" autoComplete="off" value={l.cantidad} onChange={(ev) => ponerLinea(i, { cantidad: ev.target.value })} error={e.cantidad} />
              <CampoTexto
                etiqueta={`Costo unitario ${n}`}
                inputMode="numeric"
                autoComplete="off"
                ayuda="En pesos, sin decimales. Ejemplo: 30.000"
                value={l.costo}
                onChange={(ev) => ponerLinea(i, { costo: ev.target.value })}
                error={e.costo}
              />
              {inmediata && info?.controla_vencimiento && (
                <CampoTexto etiqueta={`Vencimiento ${n}`} type="date" value={l.vencimiento} onChange={(ev) => ponerLinea(i, { vencimiento: ev.target.value })} error={e.vencimiento} />
              )}
              {inmediata && (info?.controla_vencimiento || info?.controla_lote) && (
                <CampoTexto etiqueta={`Lote ${n} (opcional)`} autoComplete="off" value={l.lote} onChange={(ev) => ponerLinea(i, { lote: ev.target.value })} />
              )}
              {form.lineas.length > 1 && (
                <Boton variante="secundario" aria-label={`Quitar artículo ${n}`} onClick={() => setForm((f) => ({ ...f, lineas: f.lineas.filter((_, j) => j !== i) }))}>
                  Quitar
                </Boton>
              )}
            </Tarjeta>
          )
        })}
        {errores.lineas && (
          <p role="alert" className="text-pequeno font-medium text-peligro">
            {errores.lineas}
          </p>
        )}
        <Boton variante="secundario" onClick={() => setForm((f) => ({ ...f, lineas: [...f.lineas, lineaVacia()] }))}>
          Agregar otro artículo
        </Boton>

        <Tarjeta>
          <section aria-label="Total de la compra" className="flex flex-col">
            <span className="text-pequeno text-texto-secundario">Total</span>
            <Dinero valor={totalCompra(form.lineas)} className="text-cifra" />
          </section>
        </Tarjeta>

        {inmediata ? (
          <Chips etiqueta="Medio de pago" opciones={MEDIOS_PAGO.map((m) => m.texto)} valor={MEDIOS_PAGO.find((m) => m.valor === form.medioPago)?.texto ?? ''} alCambiar={(t) => poner('medioPago', MEDIOS_PAGO.find((m) => m.texto === t)?.valor ?? 'efectivo')} />
        ) : (
          <CampoTexto etiqueta="Fecha esperada" type="date" min={hoyBogota()} value={form.fechaEsperada} onChange={(e) => poner('fechaEsperada', e.target.value)} error={errores.fechaEsperada} />
        )}

        {adjuntos && (
          <CampoTexto
            etiqueta="Foto del soporte (opcional)"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        )}
        {aviso && <Aviso tono="error">{aviso}</Aviso>}
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : inmediata ? 'Registrar compra' : 'Registrar encargo'}
        </Boton>
      </form>
    </Pagina>
  )
}
