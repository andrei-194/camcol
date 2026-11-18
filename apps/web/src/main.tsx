import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './application/auth/AuthProvider'
import { crearServicioAuth } from './infra/auth/servicioAuth'
import { obtenerClienteSupabase } from './infra/supabase/client'
import { iniciarPersistenciaAlmacenamiento } from './pwa/almacenamiento'
import { AvisoActualizacion } from './pwa/AvisoActualizacion'
import { AppRoutes } from './routes'
import './index.css'

iniciarPersistenciaAlmacenamiento()

const servicioAuth = crearServicioAuth(obtenerClienteSupabase())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider servicio={servicioAuth}>
      <BrowserRouter>
        <AppRoutes />
        <AvisoActualizacion />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
