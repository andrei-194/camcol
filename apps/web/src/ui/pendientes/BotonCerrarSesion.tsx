import { useState } from 'react'
import { useAuth } from '../../application/auth/AuthProvider'
import { usePendientesOpcional } from './contexto'
import { exportarPendientes } from './exportarJson'

/**
 * Cerrar sesión (RF-AUTH-03, E13). Con pendientes locales advierte cuántos y ofrece exportar o cancelar.
 * Cerrar sesión nunca borra los datos locales (PLAN §9).
 */
export function BotonCerrarSesion() {
  const { cerrarSesion } = useAuth()
  const ctx = usePendientesOpcional()
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function pedir() {
    setError('')
    const n = ctx ? await ctx.db.outbox.count() : 0
    if (n === 0) await cerrarSesion()
    else setPendientes(n)
  }

  async function exportar() {
    try {
      await exportarPendientes(ctx!.db)
    } catch {
      setError('No se pudo exportar el archivo.')
    }
  }

  return (
    <section aria-labelledby="sesion" className="flex flex-col items-start gap-2">
      <h2 id="sesion" className="text-lg font-semibold text-stone-900">
        Sesión
      </h2>
      <button
        type="button"
        onClick={() => void pedir()}
        className="min-h-11 rounded-lg border border-stone-400 px-4 py-2 text-base font-medium text-stone-900"
      >
        Cerrar sesión
      </button>
      {pendientes !== null && (
        <div role="alertdialog" aria-labelledby="aviso-salida" className="flex w-full flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p id="aviso-salida" className="text-base text-amber-900">
            {`Tienes ${pendientes} ${pendientes === 1 ? 'registro' : 'registros'} sin subir. Siguen guardados en este teléfono, pero aún no están en el servidor: si se borran los datos del navegador se perderían. Exporta una copia antes de salir.`}
          </p>
          <button type="button" onClick={() => void exportar()} className="min-h-11 rounded-lg bg-emerald-800 px-4 text-base font-medium text-white">
            Exportar JSON
          </button>
          <button type="button" onClick={() => void cerrarSesion()} className="min-h-11 rounded-lg border border-red-700 px-4 text-base font-medium text-red-800">
            Cerrar sesión de todos modos
          </button>
          <button type="button" onClick={() => setPendientes(null)} className="min-h-11 rounded-lg border border-stone-400 px-4 text-base text-stone-900">
            Cancelar
          </button>
          {error && <p role="alert" className="text-base text-red-800">{error}</p>}
        </div>
      )}
    </section>
  )
}
