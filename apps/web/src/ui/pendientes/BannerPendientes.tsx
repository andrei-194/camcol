import { Link } from 'react-router-dom'
import { usePendientesOpcional, useOutbox } from './contexto'
import { hace } from './resumen'

/** Aviso «N sin subir (el más viejo: hace X)» (RF-SYN-03). Solo avisa: nunca sube nada. Sin pendientes no se muestra. */
export function BannerPendientes() {
  const ctx = usePendientesOpcional()
  const carga = useOutbox(ctx)
  if (carga.fase !== 'listo' || carga.ops.length === 0) return null
  const viejo = carga.ops[0]!
  return (
    <Link
      to="/pendientes"
      className="block rounded-control border-2 border-advertencia bg-advertencia-suave px-4 py-3 font-semibold text-advertencia"
    >
      {`${carga.ops.length} sin subir (el más viejo: ${hace(viejo.created_at)})`}
    </Link>
  )
}
