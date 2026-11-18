import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './application/auth/AuthProvider'
import { crearServicioAuth } from './infra/auth/servicioAuth'
import { obtenerClienteSupabase } from './infra/supabase/client'
import { AppRoutes } from './routes'
import './index.css'

const servicioAuth = crearServicioAuth(obtenerClienteSupabase())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider servicio={servicioAuth}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
