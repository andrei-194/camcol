import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CLASES_ENLACE } from './componentes/Boton'
import { Pagina } from './componentes/Pagina'
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
    <Pagina titulo="Ajustes" volverA="/">
      <section aria-labelledby="almacenamiento" className="flex flex-col gap-1">
        <h2 id="almacenamiento" className="font-titulo text-seccion font-semibold">
          Almacenamiento
        </h2>
        <p className="text-texto-secundario">{estado ? TEXTO_ALMACENAMIENTO[estado] : 'Revisando…'}</p>
      </section>
      <BotonActualizar />
      <BotonCerrarSesion />
      <Link to="/instalar" className={`${CLASES_ENLACE} inline-flex min-h-12 items-center`}>
        Cómo instalar la app
      </Link>
    </Pagina>
  )
}
