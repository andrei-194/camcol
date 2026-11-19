import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../application/auth/AuthProvider'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
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

  return (
    <PantallaCentrada titulo="Camino Col">
      <form onSubmit={(e) => void alEnviar(e)} className="flex flex-col gap-4" noValidate>
        <h2 className="font-titulo text-seccion font-semibold text-texto">Iniciar sesión</h2>
        {estado.fase === 'anonimo' && estado.caducada && (
          <Aviso tono="advertencia">Tu sesión expiró. Vuelve a entrar; tus pendientes en este dispositivo se conservan.</Aviso>
        )}
        <CampoTexto
          etiqueta="Correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <CampoTexto
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        {error && <Aviso tono="error">{mensajes[error]}</Aviso>}
        <Boton type="submit" disabled={enviando || !email || !contrasena}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>
    </PantallaCentrada>
  )
}
