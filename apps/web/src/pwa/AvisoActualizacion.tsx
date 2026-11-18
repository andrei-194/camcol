import { useRegisterSW } from 'virtual:pwa-register/react'

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
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-stone-300 bg-white p-4 shadow-lg"
    >
      <p className="text-sm text-stone-800">
        {necesitaActualizar
          ? 'Nueva versión disponible. Termina lo que estás haciendo y toca Actualizar.'
          : 'Lista para usarse sin conexión.'}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="min-h-11 rounded-md px-4 text-sm text-stone-600">
          {necesitaActualizar ? 'Después' : 'Cerrar'}
        </button>
        {necesitaActualizar && (
          <button
            type="button"
            onClick={onActualizar}
            className="min-h-11 rounded-md bg-emerald-800 px-4 text-sm font-medium text-white"
          >
            Actualizar
          </button>
        )}
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
