import { Aviso } from './componentes/Aviso'
import { Pagina } from './componentes/Pagina'
import { estaInstalada } from '../pwa/almacenamiento'

export function ComoInstalar() {
  const instalada = estaInstalada()
  return (
    <Pagina titulo="Cómo instalar" volverA="/">
      {instalada && <Aviso tono="info">Camino Col ya está instalada en este teléfono.</Aviso>}
      <p className="text-texto-secundario">
        Instalar la app te da un ícono en la pantalla de inicio y la deja abrir sin conexión. Hazlo en cada teléfono.
      </p>

      <section aria-labelledby="iphone" className="flex flex-col gap-2">
        <h2 id="iphone" className="font-titulo text-seccion font-semibold">
          iPhone (Safari)
        </h2>
        <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-acento">
          <li>Abre la dirección de Camino Col en Safari. Otros navegadores no instalan la app.</li>
          <li>Toca el botón Compartir (el cuadrado con una flecha hacia arriba).</li>
          <li>Desliza y elige "Añadir a pantalla de inicio".</li>
          <li>Toca "Añadir". Abre la app desde el nuevo ícono.</li>
        </ol>
      </section>

      <section aria-labelledby="android" className="flex flex-col gap-2">
        <h2 id="android" className="font-titulo text-seccion font-semibold">
          Android (Chrome)
        </h2>
        <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-acento">
          <li>Abre la dirección de Camino Col en Chrome.</li>
          <li>Toca el menú de tres puntos, arriba a la derecha.</li>
          <li>Elige "Instalar aplicación" (o "Añadir a la pantalla de inicio").</li>
          <li>Confirma con "Instalar". Abre la app desde el nuevo ícono.</li>
        </ol>
      </section>

      <p className="text-pequeno text-texto-secundario">
        Después de instalar, abre siempre la app desde el ícono. En el iPhone, así el teléfono cuida mejor los datos
        guardados.
      </p>
    </Pagina>
  )
}
