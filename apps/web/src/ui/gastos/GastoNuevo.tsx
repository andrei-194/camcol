import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIAS_GASTO, armarDatos, filaLocal, formVacio, validarForm, type ErroresGasto, type FormGasto } from '../../application/gastos/gastos'
import { hoyBogota } from '../../lib/formato'
import { uuidV7 } from '../../lib/uuid'
import { ErrorDominio, type ResultadoCommit } from '../../infra/sync/writer'
import { Aviso } from '../componentes/Aviso'
import { Boton, BotonEnlace, CLASES_ENLACE } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { Chips } from '../componentes/Chips'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { usePendientesCtx } from '../pendientes/contexto'

type Resultado = { tipo: 'aplicado'; fotoFallo: boolean } | { tipo: 'encolado'; aviso?: string; fotoFallo: boolean }

/** Registro de un gasto operativo (RF-PAG-03). Funciona sin conexión (D-009): sin señal queda en Pendientes. */
export function GastoNuevo() {
  const { escritor, adjuntos } = usePendientesCtx()
  const [form, setForm] = useState<FormGasto>(() => formVacio(hoyBogota()))
  const [errores, setErrores] = useState<ErroresGasto>({})
  const [archivo, setArchivo] = useState<File | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [version, setVersion] = useState(0) // cambia al «Registrar otro gasto»: limpia también el campo de archivo

  const poner = <K extends keyof FormGasto>(k: K, v: FormGasto[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const hoy = hoyBogota()
    const errs = validarForm(form, hoy)
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    if (!escritor) {
      setAviso('La aplicación aún no está lista. Intenta de nuevo.')
      return
    }
    const datos = armarDatos(form, uuidV7())
    setEnviando(true)
    try {
      const r: ResultadoCommit = await escritor.commit({
        tipo: 'gasto.registrar',
        datos,
        filasLocales: [{ tabla: 'gastos', fila: filaLocal(datos) }],
      })
      let fotoFallo = false
      if (archivo && adjuntos) {
        try {
          await adjuntos.guardar({ opId: r.op_id, entidad: 'gasto', entidadId: datos.id, archivo })
          if (r.estado === 'aplicada') await adjuntos.subirListas().catch(() => undefined)
        } catch {
          fotoFallo = true
        }
      }
      setResultado(r.estado === 'aplicada' ? { tipo: 'aplicado', fotoFallo } : { tipo: 'encolado', aviso: r.estado === 'encolada' ? r.aviso : undefined, fotoFallo })
    } catch (err) {
      setAviso(err instanceof ErrorDominio ? err.message : 'No se pudo guardar. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  function otro() {
    setForm(formVacio(hoyBogota()))
    setErrores({})
    setArchivo(null)
    setAviso(null)
    setResultado(null)
    setVersion((v) => v + 1)
  }

  if (resultado) {
    return (
      <Pagina titulo="Nuevo gasto" volverA="/gastos">
        {resultado.tipo === 'aplicado' ? (
          <Aviso>{`Gasto guardado.${resultado.fotoFallo ? ' La foto no se pudo guardar.' : ''}`}</Aviso>
        ) : (
          <Aviso tono="advertencia">
            Guardado en este teléfono. Se sube cuando pulses «Subir seleccionados» en{' '}
            <Link to="/pendientes" className={CLASES_ENLACE}>
              Pendientes
            </Link>
            .{resultado.aviso ? ` ${resultado.aviso}` : ''}
            {resultado.fotoFallo ? ' La foto no se pudo guardar.' : ''}
          </Aviso>
        )}
        <div className="flex flex-col gap-3">
          <Boton onClick={otro}>Registrar otro gasto</Boton>
          <BotonEnlace to="/gastos" variante="secundario">
            Ver gastos
          </BotonEnlace>
        </div>
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Nuevo gasto" volverA="/gastos">
      <Aviso tono="info">Funciona sin conexión: si no hay señal, se guarda en este teléfono y lo subes después.</Aviso>
      <Tarjeta>
        <form key={version} onSubmit={(e) => void guardar(e)} noValidate className="flex flex-col gap-4">
          <Chips etiqueta="Categoría" opciones={CATEGORIAS_GASTO} valor={form.categoria} alCambiar={(c) => poner('categoria', c)} error={errores.categoria} />
          <CampoTexto
            etiqueta="Valor en pesos"
            inputMode="numeric"
            autoComplete="off"
            ayuda="Solo números, sin decimales. Ejemplo: 45.000"
            value={form.valor}
            onChange={(e) => poner('valor', e.target.value)}
            error={errores.valor}
          />
          <CampoTexto etiqueta="Concepto (opcional)" autoComplete="off" value={form.concepto} onChange={(e) => poner('concepto', e.target.value)} />
          <CampoTexto etiqueta="Fecha" type="date" max={hoyBogota()} value={form.fecha} onChange={(e) => poner('fecha', e.target.value)} error={errores.fecha} />
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
            {enviando ? 'Guardando…' : 'Guardar gasto'}
          </Boton>
        </form>
      </Tarjeta>
    </Pagina>
  )
}
