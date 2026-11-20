import { useRegisterSW } from 'virtual:pwa-register/react'
import { Boton } from '../ui/componentes/Boton'

type Props = {
  necesitaActualizar: boolean
  listoOffline: boolean
  onActualizar: () => void
  onCerrar: () => void
}

/** Aviso visual (RF-OPS-03). La recarga solo ocurre al tocar "Actualizar". */
export function AvisoActualizacionVista({ necesitaActualizar, listoOffline, onActualizar, onCerrar }: Props) {
  if (!necesitaActualizar && !listoOffline) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-tarjeta border-2 border-texto bg-fondo p-4 shadow-flotante"
    >
      <p className="text-texto">
        {necesitaActualizar
          ? 'Nueva versión disponible. Termina lo que estás haciendo y toca Actualizar.'
          : 'Lista para usarse sin conexión.'}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>
          {necesitaActualizar ? 'Después' : 'Cerrar'}
        </Boton>
        {necesitaActualizar && <Boton onClick={onActualizar}>Actualizar</Boton>}
      </div>
    </div>
  )
}

export function AvisoActualizacion() {
  const {
    offlineReady: [listoOffline, setListoOffline],
    needRefresh: [necesitaActualizar, setNecesitaActualizar],
    updateServiceWorker,
  } = useRegisterSW()

  return (
    <AvisoActualizacionVista
      necesitaActualizar={necesitaActualizar}
      listoOffline={listoOffline}
      onActualizar={() => void updateServiceWorker(true)}
      onCerrar={() => {
        setListoOffline(false)
        setNecesitaActualizar(false)
      }}
    />
  )
}
