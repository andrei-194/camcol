import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotonActualizar } from './BotonActualizar'
import { BotonCerrarSesion } from './pendientes/BotonCerrarSesion'
import { estadoAlmacenamiento, type EstadoAlmacenamiento } from '../pwa/almacenamiento'

export const TEXTO_ALMACENAMIENTO: Record<EstadoAlmacenamiento, string> = {
  persistente: 'Protegido: el teléfono no borrará los datos guardados por falta de espacio.',
  'no-persistente': 'No protegido: el teléfono podría borrar los datos guardados. Instala la app y úsala seguido.',
  'no-soportado': 'Este navegador no informa si el almacenamiento está protegido.',
}

export function Ajustes() {
  const [estado, setEstado] = useState<EstadoAlmacenamiento | null>(null)

  useEffect(() => {
    let activo = true
    void estadoAlmacenamiento().then((e) => {
      if (activo) setEstado(e)
    })
    return () => {
      activo = false
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-6">
      <Link to="/" className="text-sm text-emerald-800 underline">
        Volver
      </Link>
      <h1 className="text-2xl font-bold text-emerald-800">Ajustes</h1>
      <section aria-labelledby="almacenamiento" className="flex flex-col gap-1">
        <h2 id="almacenamiento" className="text-lg font-semibold text-stone-900">
          Almacenamiento
        </h2>
        <p className="text-base text-stone-700">{estado ? TEXTO_ALMACENAMIENTO[estado] : 'Revisando…'}</p>
      </section>
      <BotonActualizar />
      <BotonCerrarSesion />
      <Link to="/instalar" className="text-base text-emerald-800 underline">
        Cómo instalar la app
      </Link>
    </main>
  )
}
