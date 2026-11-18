import { useAuth } from '../../application/auth/AuthProvider'
import type { UsuarioSesion } from '../../domain/auth/tipos'
import { PantallaCentrada } from './PantallaCentrada'

/** Usuario autenticado que no está en `miembros` (RF-AUTH-04). */
export function SinAcceso({ usuario }: { usuario: UsuarioSesion }) {
  const { cerrarSesion } = useAuth()
  return (
    <PantallaCentrada titulo="Sin acceso">
      <p className="text-stone-700">
        La cuenta <strong className="break-all">{usuario.email}</strong> no tiene permiso para usar Camino Col.
      </p>
      <p className="text-stone-600">Pídele a un socio que te dé acceso o entra con otra cuenta.</p>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="min-h-12 rounded-lg bg-emerald-800 px-4 text-base font-semibold text-white"
      >
        Cerrar sesión
      </button>
    </PantallaCentrada>
  )
}
