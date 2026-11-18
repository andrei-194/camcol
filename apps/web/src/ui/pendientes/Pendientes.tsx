// Centro de pendientes (PLAN §5.3, RF-SYN-03/04/10). Nada se envía solo: solo «Subir seleccionados» llama al
// servidor (regla 5). Sin Editar ni Importar (D-009): se descarta y se rehace.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSync } from '../../application/sync/SyncProvider'
import type { OpOutbox } from '../../infra/db/db'
import type { ResultadoSubida } from '../../infra/sync/pendientesService'
import { BannerPendientes } from './BannerPendientes'
import { usePendientesCtx, useOutbox } from './contexto'
import { exportarPendientes } from './exportarJson'
import { hace, resumirOp } from './resumen'

const ESTADO: Record<OpOutbox['estado'], string> = {
  pendiente: 'Sin subir',
  error: 'Error',
  revision: 'Requiere decisión',
}

interface Candidato {
  id: string
  nombre: string
  telefono?: string
}

function candidatosDe(op: OpOutbox): Candidato[] {
  const c = (op.resultado as { candidatos?: unknown } | undefined)?.candidatos
  if (!Array.isArray(c)) return []
  return c.filter((x): x is Candidato => !!x && typeof (x as Candidato).id === 'string')
}

function lineaResultado(r: ResultadoSubida): string {
  switch (r.status) {
    case 'ok':
      return '✔ Subido'
    case 'ya_aplicada':
      return '✔ Subido (ya estaba aplicado)'
    case 'revision':
      return '⚠ Requiere decisión'
    case 'red':
      return '✖ Sin conexión: sigue pendiente'
    case 'no_aplicado':
      return '✖ El servidor no pudo aplicarlo ahora: sigue pendiente'
    case 'error':
      return `✖ ${r.error?.mensaje ?? 'El servidor rechazó la operación'}`
  }
}

export function Pendientes() {
  const ctx = usePendientesCtx()
  const sync = useSync()
  const carga = useOutbox(ctx)
  const [resumenes, setResumenes] = useState<Record<string, string>>({})
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [subiendo, setSubiendo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [decidiendo, setDecidiendo] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Array<{ op_id: string; texto: string }> | null>(null)
  const [aviso, setAviso] = useState('')

  const ops = carga.fase === 'listo' ? carga.ops : []

  useEffect(() => {
    let vigente = true
    void Promise.all(ops.map(async (op) => [op.op_id, await resumirOp(ctx.db, op)] as const)).then((pares) => {
      if (vigente) setResumenes(Object.fromEntries(pares))
    }).catch(() => {
      /* sin resumen se muestra el tipo de la operación */
    })
    return () => {
      vigente = false
    }
    // `ops` cambia de identidad solo cuando se recarga la outbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga])

  const resumen = (op: OpOutbox) => resumenes[op.op_id] ?? op.tipo

  function alternar(id: string) {
    setElegidos((previo) => {
      const nuevo = new Set(previo)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  async function subir() {
    // Las filas en revisión no se envían hasta decidir: detendrían la subida de las demás.
    const ids = ops.filter((o) => elegidos.has(o.op_id) && o.estado !== 'revision').map((o) => o.op_id)
    if (ids.length === 0) return
    setSubiendo(true)
    setAviso('')
    try {
      const r = await ctx.servicio.subir(ids)
      const hechos = new Set(r.resultados.map((x) => x.op_id))
      const fotos = r.adjuntos
      setResultados([
        ...(fotos && (fotos.vinculadas || fotos.fallidas || fotos.esperando)
          ? [{ op_id: 'fotos', texto: `Fotos: ${fotos.vinculadas} subidas · ${fotos.fallidas} con error (se reintentan al volver a subir) · ${fotos.esperando} esperando su registro` }]
          : []),
        ...r.resultados.map((x) => ({ op_id: x.op_id, texto: `${lineaResultado(x)} · ${resumenes[x.op_id] ?? ''}` })),
        ...ids.filter((id) => !hechos.has(id)).map((id) => ({ op_id: id, texto: `Sin intentar · ${resumenes[id] ?? ''}` })),
      ])
      setElegidos(new Set())
      ctx.avisarCambio()
      if (r.resultados.some((x) => x.status === 'ok' || x.status === 'ya_aplicada') || r.adjuntos?.vinculadas) void sync?.actualizar()
    } catch {
      setAviso('No se pudo subir. Inténtalo de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  async function descartar() {
    const ids = [...elegidos]
    setConfirmando(false)
    try {
      await ctx.servicio.descartar(ids)
      setElegidos(new Set())
      setResultados(null)
      ctx.avisarCambio()
    } catch {
      setAviso('No se pudo descartar. Inténtalo de nuevo.')
    }
  }

  async function resolver(opId: string, resolucion: Parameters<typeof ctx.servicio.resolver>[1]) {
    try {
      await ctx.servicio.resolver(opId, resolucion)
      setDecidiendo(null)
      ctx.avisarCambio()
    } catch {
      setAviso('No se pudo guardar la decisión.')
    }
  }

  async function exportar() {
    try {
      await exportarPendientes(ctx.db)
    } catch {
      setAviso('No se pudo exportar el archivo.')
    }
  }

  const boton = 'min-h-11 rounded-lg px-4 py-2 text-base font-medium disabled:opacity-50'

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <Link to="/" className="text-sm text-emerald-800 underline">
        Volver
      </Link>
      <h1 className="text-2xl font-bold text-emerald-800">Pendientes</h1>
      <BannerPendientes />

      {carga.fase === 'cargando' && (
        <p role="status" className="text-stone-600">
          Cargando…
        </p>
      )}
      {carga.fase === 'error' && (
        <p role="alert" className="text-red-800">
          No se pudieron leer los pendientes de este teléfono.
        </p>
      )}
      {carga.fase === 'listo' && ops.length === 0 && <p className="text-base text-stone-700">No tienes nada pendiente.</p>}

      {ops.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {ops.map((op) => (
              <li key={op.op_id} className="flex flex-col gap-2 rounded-lg border border-stone-300 bg-white p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-6 shrink-0"
                    checked={elegidos.has(op.op_id)}
                    onChange={() => alternar(op.op_id)}
                    aria-label={`Seleccionar: ${resumen(op)}`}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="break-words text-base text-stone-900">{`${resumen(op)} · ${hace(op.created_at)}`}</span>
                    <span className="text-sm text-stone-700">
                      {ESTADO[op.estado]}
                      {op.estado === 'error' && op.error ? `: ${(op.error as { mensaje?: string }).mensaje ?? ''}` : ''}
                    </span>
                  </span>
                </label>
                {op.estado === 'revision' && (
                  <>
                    <button type="button" className={`${boton} border border-amber-600 text-amber-900`} onClick={() => setDecidiendo(decidiendo === op.op_id ? null : op.op_id)}>
                      Decidir
                    </button>
                    {decidiendo === op.op_id && (
                      <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3">
                        <p className="text-base text-amber-900">Ya existe algo parecido. ¿Qué hacemos?</p>
                        {candidatosDe(op).map((c) => (
                          <div key={c.id} className="flex flex-col gap-1">
                            <span data-candidato className="text-base text-stone-900">
                              {c.nombre}
                              {c.telefono ? ` · ${c.telefono}` : ''}
                            </span>
                            <button
                              type="button"
                              className={`${boton} bg-emerald-800 text-white`}
                              onClick={() => void resolver(op.op_id, { tipo: 'usar_existente', tercero_id: c.id })}
                            >
                              Usar existente
                            </button>
                          </div>
                        ))}
                        <button type="button" className={`${boton} border border-stone-400 text-stone-900`} onClick={() => void resolver(op.op_id, { tipo: 'crear_igual' })}>
                          Crear igual
                        </button>
                        <p className="text-sm text-stone-700">Después pulsa «Subir seleccionados».</p>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <button type="button" className={`${boton} bg-emerald-800 text-white`} disabled={subiendo || elegidos.size === 0} onClick={() => void subir()}>
              {subiendo ? 'Subiendo…' : 'Subir seleccionados'}
            </button>
            <button type="button" className={`${boton} border border-red-700 text-red-800`} disabled={subiendo || elegidos.size === 0} onClick={() => setConfirmando(true)}>
              {`Descartar${elegidos.size ? ` (${elegidos.size})` : ''}`}
            </button>
          </div>
        </>
      )}

      {confirmando && (
        <div role="alertdialog" aria-labelledby="confirma-descartar" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <p id="confirma-descartar" className="text-base text-red-900">
            {`¿Descartar ${elegidos.size} ${elegidos.size === 1 ? 'pendiente' : 'pendientes'}? Se borran de este teléfono y no se puede deshacer.`}
          </p>
          <button type="button" className={`${boton} bg-red-700 text-white`} onClick={() => void descartar()}>
            Sí, descartar
          </button>
          <button type="button" className={`${boton} border border-stone-400 text-stone-900`} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      )}

      {resultados && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-stone-900">Resultado</h2>
          <ul aria-label="Resultado de la subida" className="flex flex-col gap-1">
            {resultados.map((r) => (
              <li key={r.op_id} className="break-words text-base text-stone-900">
                {r.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      {aviso && (
        <p role="alert" className="text-base text-red-800">
          {aviso}
        </p>
      )}

      <button type="button" className={`${boton} border border-stone-400 text-stone-900`} onClick={() => void exportar()}>
        Exportar JSON
      </button>
    </main>
  )
}
