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
      className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base font-medium text-amber-900"
    >
      {`${carga.ops.length} sin subir (el más viejo: ${hace(viejo.created_at)})`}
    </Link>
  )
}
