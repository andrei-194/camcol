import { useState } from 'react'
import { useCatalogo, useCatalogoCtx, useEnLinea } from '../../application/catalogo/contexto'
import { Aviso } from '../componentes/Aviso'
import { AVISO_SIN_RED, CampoSelect, texto } from './campos'

/**
 * Selector reutilizable de la lista de precios de un cliente (RF-CAT-03). Al elegir, guarda `lista_precio_id`
 * del tercero con RLS (sin `aplicar_ops`) y pide un pull. «Pública» = sin lista propia (null). Solo con conexión.
 * Lo usa la pantalla de listas y puede incrustarse en la ficha del tercero (CAM-50).
 */
export function SelectorListaPrecio({
  terceroId,
  valor,
  onGuardado,
}: {
  terceroId: string
  valor: string | null
  onGuardado?: (listaId: string | null) => void
}) {
  const { api, refrescar } = useCatalogoCtx()
  const carga = useCatalogo()
  const enLinea = useEnLinea()
  const [elegida, setElegida] = useState<string | null>(valor)
  const [estado, setEstado] = useState<{ tono: 'info' | 'error'; texto: string } | null>(null)
  const adicionales = carga.fase === 'listo' ? carga.datos.listas.filter((l) => !l.es_publica) : []

  async function cambiar(nuevo: string) {
    const lista = nuevo === '' ? null : nuevo
    const anterior = elegida
    setElegida(lista)
    setEstado(null)
    const r = await api.asignarListaCliente(terceroId, lista)
    if (!r.ok) {
      setElegida(anterior)
      setEstado({ tono: 'error', texto: r.mensaje })
      return
    }
    setEstado({ tono: 'info', texto: 'Lista de precios guardada.' })
    onGuardado?.(lista)
    void refrescar()
  }

  return (
    <div className="flex flex-col gap-2">
      <CampoSelect etiqueta="Lista de precios" value={elegida ?? ''} disabled={!enLinea} onChange={(e) => void cambiar(e.target.value)}>
        <option value="">Pública (por defecto)</option>
        {adicionales.map((l) => (
          <option key={l.id} value={l.id}>
            {texto(l, 'nombre')}
          </option>
        ))}
      </CampoSelect>
      {!enLinea && <p className="text-pequeno text-texto-secundario">{AVISO_SIN_RED}</p>}
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
    </div>
  )
}
