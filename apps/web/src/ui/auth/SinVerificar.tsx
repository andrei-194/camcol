import { useState } from 'react'
import { useAuth } from '../../application/auth/AuthProvider'
import type { UsuarioSesion } from '../../domain/auth/tipos'
import { PantallaCentrada } from './PantallaCentrada'

/** Hay sesión, pero sin red no se pudo comprobar el acceso. La sesión se conserva. */
export function SinVerificar({ usuario }: { usuario: UsuarioSesion }) {
  const { reintentar } = useAuth()
  const [ocupado, setOcupado] = useState(false)

  async function alReintentar() {
    setOcupado(true)
    try {
      await reintentar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <PantallaCentrada titulo="Sin conexión">
      <p role="alert" className="text-stone-700">
        No pudimos comprobar tu acceso porque no hay conexión con el servidor. Tu sesión sigue abierta
        como <strong className="break-all">{usuario.email}</strong>.
      </p>
      <button
        type="button"
        onClick={() => void alReintentar()}
        disabled={ocupado}
        className="min-h-12 rounded-lg bg-emerald-800 px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        {ocupado ? 'Comprobando…' : 'Reintentar'}
      </button>
    </PantallaCentrada>
  )
}
