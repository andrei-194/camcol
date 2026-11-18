import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { iniciarPersistenciaAlmacenamiento } from './pwa/almacenamiento'
import { AvisoActualizacion } from './pwa/AvisoActualizacion'
import { AppRoutes } from './routes'
import './index.css'

iniciarPersistenciaAlmacenamiento()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
      <AvisoActualizacion />
    </BrowserRouter>
  </StrictMode>,
)
