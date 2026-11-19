import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../application/auth/AuthProvider'
import { MarcoApp } from '../marco/MarcoApp'
import { SinAcceso } from './SinAcceso'
import { SinVerificar } from './SinVerificar'

/** Guardia de rutas: solo deja pasar a socios con sesión (RF-AUTH-01/04). */
export function RequireAuth() {
  const { estado } = useAuth()
  const ubicacion = useLocation()

  switch (estado.fase) {
    case 'cargando':
      return (
        <main className="flex min-h-screen items-center justify-center px-4">
          <p role="status" className="text-texto-secundario">
            Cargando…
          </p>
        </main>
      )
    case 'anonimo':
      return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
    case 'sin-acceso':
      return <SinAcceso usuario={estado.usuario} />
    case 'sin-verificar':
      return <SinVerificar usuario={estado.usuario} />
    case 'activo':
      return (
        <MarcoApp>
          <Outlet />
        </MarcoApp>
      )
  }
}
