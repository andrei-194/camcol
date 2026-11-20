import { Link } from 'react-router-dom'
import { FilaLista } from './componentes/FilaLista'
import { Pagina } from './componentes/Pagina'

const ENLACES = [
  { a: '/pendientes', texto: 'Pendientes' },
  { a: '/catalogo', texto: 'Catálogo y precios' },
  { a: '/terceros', texto: 'Clientes y proveedores' },
  { a: '/gastos', texto: 'Gastos' },
  { a: '/ajustes', texto: 'Ajustes' },
  { a: '/instalar', texto: 'Cómo instalar' },
]

/** Lo que se usa menos que las cuatro pantallas de la barra inferior. */
export function Mas() {
  return (
    <Pagina titulo="Más">
      <nav aria-label="Más opciones">
        <ul className="rounded-tarjeta bg-superficie px-4">
          {ENLACES.map((e) => (
            <FilaLista key={e.a} className="py-0">
              <Link to={e.a} className="flex min-h-12 flex-1 items-center justify-between text-texto">
                {e.texto}
                <span aria-hidden="true" className="text-texto-secundario">
                  ›
                </span>
              </Link>
            </FilaLista>
          ))}
        </ul>
      </nav>
    </Pagina>
  )
}
