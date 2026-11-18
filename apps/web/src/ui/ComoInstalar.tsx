import { Link } from 'react-router-dom'
import { estaInstalada } from '../pwa/almacenamiento'

export function ComoInstalar() {
  const instalada = estaInstalada()
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-6">
      <Link to="/" className="text-sm text-emerald-800 underline">
        Volver
      </Link>
      <h1 className="text-2xl font-bold text-emerald-800">Cómo instalar</h1>
      {instalada && (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Camino Col ya está instalada en este teléfono.
        </p>
      )}
      <p className="text-base text-stone-700">
        Instalar la app te da un ícono en la pantalla de inicio y la deja abrir sin conexión. Hazlo en cada teléfono.
      </p>

      <section aria-labelledby="iphone" className="flex flex-col gap-2">
        <h2 id="iphone" className="text-lg font-semibold text-stone-900">
          iPhone (Safari)
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-base text-stone-700">
          <li>Abre la dirección de Camino Col en Safari. Otros navegadores no instalan la app.</li>
          <li>Toca el botón Compartir (el cuadrado con una flecha hacia arriba).</li>
          <li>Desliza y elige "Añadir a pantalla de inicio".</li>
          <li>Toca "Añadir". Abre la app desde el nuevo ícono.</li>
        </ol>
      </section>

      <section aria-labelledby="android" className="flex flex-col gap-2">
        <h2 id="android" className="text-lg font-semibold text-stone-900">
          Android (Chrome)
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-base text-stone-700">
          <li>Abre la dirección de Camino Col en Chrome.</li>
          <li>Toca el menú de tres puntos, arriba a la derecha.</li>
          <li>Elige "Instalar aplicación" (o "Añadir a la pantalla de inicio").</li>
          <li>Confirma con "Instalar". Abre la app desde el nuevo ícono.</li>
        </ol>
      </section>

      <p className="text-sm text-stone-600">
        Después de instalar, abre siempre la app desde el ícono. En el iPhone, así el teléfono cuida mejor los datos
        guardados.
      </p>
    </main>
  )
}
