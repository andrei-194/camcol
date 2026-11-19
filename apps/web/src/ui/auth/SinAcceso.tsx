import { useAuth } from '../../application/auth/AuthProvider'
import type { UsuarioSesion } from '../../domain/auth/tipos'
import { Boton } from '../componentes/Boton'
import { PantallaCentrada } from './PantallaCentrada'

/** Usuario autenticado que no está en `miembros` (RF-AUTH-04). */
export function SinAcceso({ usuario }: { usuario: UsuarioSesion }) {
  const { cerrarSesion } = useAuth()
  return (
    <PantallaCentrada titulo="Sin acceso">
      <p>
        La cuenta <strong className="break-all">{usuario.email}</strong> no tiene permiso para usar Camino Col.
      </p>
      <p className="text-texto-secundario">Pídele a un socio que te dé acceso o entra con otra cuenta.</p>
      <Boton onClick={() => void cerrarSesion()}>Cerrar sesión</Boton>
    </PantallaCentrada>
  )
}
