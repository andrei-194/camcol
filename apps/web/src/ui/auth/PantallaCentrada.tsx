import type { ReactNode } from 'react'

/** Contenedor de las pantallas de acceso. Pensado para 360 px de ancho. */
export function PantallaCentrada({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-3xl font-bold text-emerald-800">{titulo}</h1>
      {children}
    </main>
  )
}
