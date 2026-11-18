import { Link } from 'react-router-dom'
import { BannerPendientes } from './pendientes/BannerPendientes'

export function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-bold text-emerald-800">Camino Col</h1>
      <p className="text-base text-stone-600">Vitrina y gestión de productos campesinos.</p>
      <BannerPendientes />
      <nav className="mt-4 flex gap-6 text-base">
        <Link to="/pendientes" className="py-2 text-emerald-800 underline">
          Pendientes
        </Link>
        <Link to="/instalar" className="py-2 text-emerald-800 underline">
          Cómo instalar
        </Link>
        <Link to="/ajustes" className="py-2 text-emerald-800 underline">
          Ajustes
        </Link>
      </nav>
    </main>
  )
}
