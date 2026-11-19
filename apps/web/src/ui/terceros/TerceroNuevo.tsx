import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  FORM_VACIO,
  armarDatos,
  esCliente,
  filaLocal,
  validarForm,
  type ErroresForm,
  type FormTercero,
  type RolForm,
} from '../../application/terceros/terceros'
import { uuidV7 } from '../../lib/uuid'
import { ErrorDominio, RequiereConexionError, type ResultadoCommit } from '../../infra/sync/writer'
import { Aviso } from '../componentes/Aviso'
import { Boton, BotonEnlace, CLASES_ENLACE } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { Pagina } from '../componentes/Pagina'
import { usePendientesCtx } from '../pendientes/contexto'

const ROLES: Array<{ valor: Exclude<RolForm, ''>; texto: string }> = [
  { valor: 'cliente', texto: 'Cliente' },
  { valor: 'proveedor', texto: 'Proveedor' },
  { valor: 'ambos', texto: 'Ambos' },
]

type Resultado =
  | { tipo: 'aplicado' }
  | { tipo: 'encolado'; aviso?: string; fotoFallo?: boolean }
  | { tipo: 'revision'; encolada: boolean; candidatos: Array<{ nombre?: string; telefono?: string }> }

/** Alta de cliente, proveedor o ambos (RF-TER-01/03/05). Proveedor: offline; cliente: solo con conexión (D-009). */
export function TerceroNuevo() {
  const { escritor, adjuntos } = usePendientesCtx()
  const [form, setForm] = useState<FormTercero>(FORM_VACIO)
  const [errores, setErrores] = useState<ErroresForm>({})
  const [archivo, setArchivo] = useState<File | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorGps, setErrorGps] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const poner = <K extends keyof FormTercero>(k: K, v: FormTercero[K]) => setForm((f) => ({ ...f, [k]: v }))
  const campo = (k: Exclude<keyof FormTercero, 'rol' | 'consentimiento' | 'tipo_documento'>) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => poner(k, e.target.value),
    error: errores[k],
  })

  function usarUbicacion() {
    setErrorGps(null)
    if (!navigator.geolocation) {
      setErrorGps('No pudimos obtener la ubicación. Escribe latitud y longitud a mano.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, latitud: String(p.coords.latitude), longitud: String(p.coords.longitude) })),
      () => setErrorGps('No pudimos obtener la ubicación. Escribe latitud y longitud a mano.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const errs = validarForm(form)
    setErrores(errs)
    if (Object.keys(errs).length > 0 || !escritor) {
      if (!escritor) setAviso('La aplicación aún no está lista. Intenta de nuevo.')
      return
    }
    const id = uuidV7()
    const datos = armarDatos(form, id, new Date())
    setEnviando(true)
    try {
      const r: ResultadoCommit = await escritor.commit({
        tipo: 'tercero.crear',
        datos,
        filasLocales: [{ tabla: 'terceros', fila: filaLocal(datos) }],
        soloEnLinea: esCliente(form.rol), // D-009
      })
      const guardado = r.estado !== 'revision' || r.encolada
      let fotoFallo = false
      if (archivo && adjuntos && guardado) {
        try {
          await adjuntos.guardar({ opId: r.op_id, entidad: 'tercero', entidadId: id, archivo })
          if (r.estado === 'aplicada') await adjuntos.subirListas().catch(() => undefined)
        } catch {
          fotoFallo = true
        }
      }
      if (r.estado === 'aplicada') setResultado({ tipo: 'aplicado' })
      else if (r.estado === 'encolada') setResultado({ tipo: 'encolado', aviso: r.aviso, fotoFallo })
      else
        setResultado({ tipo: 'revision', encolada: r.encolada, candidatos: r.candidatos as Array<{ nombre?: string; telefono?: string }> })
    } catch (err) {
      if (err instanceof RequiereConexionError) setAviso('Requiere conexión. Los clientes solo se crean con internet; no se guardó nada.')
      else if (err instanceof ErrorDominio) setAviso(err.message)
      else setAviso('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (resultado) {
    return (
      <Pagina titulo="Nuevo tercero" volverA="/terceros">
        {resultado.tipo === 'aplicado' && <Aviso>Tercero guardado.</Aviso>}
        {resultado.tipo === 'encolado' && (
          <Aviso tono="advertencia">
            Guardado en este teléfono. Se sube cuando pulses «Subir seleccionados» en{' '}
            <Link to="/pendientes" className={CLASES_ENLACE}>
              Pendientes
            </Link>
            .{resultado.aviso ? ` ${resultado.aviso}` : ''}
            {resultado.fotoFallo ? ' La foto no se pudo guardar.' : ''}
          </Aviso>
        )}
        {resultado.tipo === 'revision' && (
          <Aviso tono="advertencia">
            <p className="font-medium">Posible duplicado: ya existe algo parecido.</p>
            <ul className="my-2">
              {resultado.candidatos.map((c, i) => (
                <li key={i}>
                  {c.nombre}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </li>
              ))}
            </ul>
            {resultado.encolada ? (
              <p>
                Quedó guardado en este teléfono. Decide qué hacer en{' '}
                <Link to="/pendientes" className={CLASES_ENLACE}>
                  Pendientes
                </Link>
                .
              </p>
            ) : (
              <p>No se guardó. Revisa si es la misma persona y vuelve a intentar; también puedes verlo en Pendientes.</p>
            )}
          </Aviso>
        )}
        <BotonEnlace to="/terceros">Ir a la lista</BotonEnlace>
        <Boton
          variante="secundario"
          onClick={() => {
            setForm(FORM_VACIO)
            setArchivo(null)
            setResultado(null)
          }}
        >
          Crear otro
        </Boton>
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Nuevo tercero" volverA="/terceros">
      <form onSubmit={guardar} noValidate className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium text-texto">Es</legend>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <label
                key={r.valor}
                className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border-2 px-2 font-semibold ${
                  form.rol === r.valor ? 'border-acento bg-acento-suave text-acento' : 'border-borde-fuerte text-texto'
                }`}
              >
                <input
                  type="radio"
                  name="rol"
                  className="size-5"
                  checked={form.rol === r.valor}
                  onChange={() => poner('rol', r.valor)}
                />
                {r.texto}
              </label>
            ))}
          </div>
          {errores.rol && (
            <p role="alert" className="text-pequeno font-medium text-peligro">
              {errores.rol}
            </p>
          )}
        </fieldset>

        <CampoTexto etiqueta="Nombre" autoComplete="off" {...campo('nombre')} />
        <CampoTexto etiqueta="Teléfono" type="tel" inputMode="tel" {...campo('telefono')} />

        <div className="flex gap-2">
          <label className="flex w-28 shrink-0 flex-col gap-1.5 font-medium text-texto">
            Tipo
            <select
              className="min-h-12 rounded-control border-2 border-borde-fuerte bg-fondo px-2 text-cuerpo font-normal"
              value={form.tipo_documento}
              onChange={(e) => poner('tipo_documento', e.target.value)}
            >
              {['CC', 'NIT', 'CE', 'PP', 'TI'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="min-w-0 flex-1">
            <CampoTexto etiqueta="Documento" inputMode="numeric" {...campo('numero_documento')} />
          </div>
        </div>

        <CampoTexto etiqueta="Municipio" {...campo('municipio')} />
        <CampoTexto etiqueta="Vereda" {...campo('vereda')} />
        <CampoTexto etiqueta="Dirección" {...campo('direccion')} />

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-texto">Ubicación</legend>
          <Boton variante="secundario" onClick={usarUbicacion}>
            Usar mi ubicación
          </Boton>
          {errorGps && <Aviso tono="advertencia">{errorGps}</Aviso>}
          <div className="flex gap-2">
            <CampoTexto etiqueta="Latitud" inputMode="decimal" {...campo('latitud')} />
            <CampoTexto etiqueta="Longitud" inputMode="decimal" {...campo('longitud')} />
          </div>
        </fieldset>

        {(form.rol === 'proveedor' || form.rol === 'ambos') && (
          <CampoTexto etiqueta="Productos que ofrece" ayuda="Texto libre: panela, café, plátano…" {...campo('productos_ofrecidos')} />
        )}
        <CampoTexto etiqueta="Notas" {...campo('notas')} />
        <CampoTexto
          etiqueta="Foto (opcional)"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />

        {esCliente(form.rol) && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-6 shrink-0"
                checked={form.consentimiento}
                onChange={(e) => poner('consentimiento', e.target.checked)}
                aria-invalid={errores.consentimiento ? true : undefined}
              />
              <span className="text-texto">El cliente autoriza el tratamiento de sus datos personales (Ley 1581).</span>
            </label>
            {errores.consentimiento && (
              <p role="alert" className="text-pequeno font-medium text-peligro">
                {errores.consentimiento}
              </p>
            )}
            <p className="text-pequeno text-texto-secundario">Los clientes solo se crean con conexión.</p>
          </div>
        )}

        {aviso && <Aviso tono="error">{aviso}</Aviso>}
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </form>
    </Pagina>
  )
}
