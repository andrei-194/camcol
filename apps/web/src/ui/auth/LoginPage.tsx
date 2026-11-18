import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../application/auth/AuthProvider'
import { PantallaCentrada } from './PantallaCentrada'

const mensajes = {
  credenciales: 'Correo o contraseña incorrectos.',
  'sin-conexion': 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.',
  otro: 'No pudimos iniciar sesión. Intenta de nuevo en un momento.',
} as const

/** Login con correo y contraseña (RF-AUTH-01). No hay registro: las cuentas las crea el administrador. */
export function LoginPage() {
  const { estado, iniciarSesion } = useAuth()
  const ubicacion = useLocation()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<keyof typeof mensajes | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (estado.fase === 'activo' || estado.fase === 'sin-acceso' || estado.fase === 'sin-verificar') {
    const desde = (ubicacion.state as { desde?: string } | null)?.desde ?? '/'
    return <Navigate to={desde} replace />
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const r = await iniciarSesion(email.trim(), contrasena)
      if (!r.ok) setError(r.motivo)
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'min-h-12 w-full rounded-lg border border-stone-400 bg-white px-3 text-base'

  return (
    <PantallaCentrada titulo="Camino Col">
      <form onSubmit={(e) => void alEnviar(e)} className="flex flex-col gap-4" noValidate>
        <h2 className="text-xl font-semibold text-stone-800">Iniciar sesión</h2>
        {estado.fase === 'anonimo' && estado.caducada && (
          <p role="status" className="rounded-lg bg-amber-100 p-3 text-stone-800">
            Tu sesión expiró. Vuelve a entrar; tus pendientes en este dispositivo se conservan.
          </p>
        )}
        <label className="flex flex-col gap-1 text-stone-700">
          Correo
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-stone-700">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            className={campo}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {mensajes[error]}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando || !email || !contrasena}
          className="min-h-12 rounded-lg bg-emerald-800 px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </PantallaCentrada>
  )
}
