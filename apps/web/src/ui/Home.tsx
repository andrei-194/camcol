import { Link } from 'react-router-dom'
import { Pagina } from './componentes/Pagina'
import { BannerPendientes } from './pendientes/BannerPendientes'

const ENLACES = [
  { a: '/catalogo', texto: 'Catálogo' },
  { a: '/pendientes', texto: 'Pendientes' },
  { a: '/instalar', texto: 'Cómo instalar' },
  { a: '/ajustes', texto: 'Ajustes' },
]

export function Home() {
  return (
    <Pagina titulo="Camino Col" subtitulo="Vitrina y gestión de productos campesinos." marca>
      <BannerPendientes />
      <nav aria-label="Secciones">
        <ul className="flex flex-col divide-y divide-borde rounded-tarjeta border border-borde">
          {ENLACES.map((e) => (
            <li key={e.a}>
              <Link to={e.a} className="flex min-h-14 items-center justify-between px-4 text-seccion text-texto">
                {e.texto}
                <span aria-hidden="true" className="text-acento">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Pagina>
  )
}
