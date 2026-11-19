import { useState } from 'react'
import { useAuth } from '../../application/auth/AuthProvider'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
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
      <h2 id="sesion" className="font-titulo text-seccion font-semibold">
        Sesión
      </h2>
      <Boton variante="secundario" onClick={() => void pedir()}>
        Cerrar sesión
      </Boton>
      {pendientes !== null && (
        <div role="alertdialog" aria-labelledby="aviso-salida" className="flex w-full flex-col gap-3 rounded-tarjeta border-2 border-advertencia bg-advertencia-suave p-4">
          <p id="aviso-salida" className="text-advertencia">
            {`Tienes ${pendientes} ${pendientes === 1 ? 'registro' : 'registros'} sin subir. Siguen guardados en este teléfono, pero aún no están en el servidor: si se borran los datos del navegador se perderían. Exporta una copia antes de salir.`}
          </p>
          <Boton onClick={() => void exportar()}>Exportar JSON</Boton>
          <Boton variante="peligro" onClick={() => void cerrarSesion()}>
            Cerrar sesión de todos modos
          </Boton>
          <Boton variante="secundario" onClick={() => setPendientes(null)}>
            Cancelar
          </Boton>
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      )}
    </section>
  )
}
