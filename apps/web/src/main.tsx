import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './application/auth/AuthProvider'
import { SyncProvider } from './application/sync/SyncProvider'
import { db } from './infra/db/db'
import { crearOpsApi } from './infra/supabase/opsApi'
import { crearAlmacenSoportes } from './infra/supabase/soportes'
import { crearPullApi } from './infra/supabase/pullApi'
import { ServiciosApp } from './ui/pendientes/ServiciosApp'
import { crearServicioAuth } from './infra/auth/servicioAuth'
import { obtenerClienteSupabase } from './infra/supabase/client'
import { iniciarPersistenciaAlmacenamiento } from './pwa/almacenamiento'
import { AvisoActualizacion } from './pwa/AvisoActualizacion'
import { AppRoutes } from './routes'
import './index.css'

// Gancho solo de prueba E2E: `import.meta.env.MODE` se reemplaza al construir, así que fuera del modo `e2e` esta
// rama (y el import dinámico) desaparece del bundle. Lo verifica `src/e2e/bundle.test.ts`.
const GanchoE2E = import.meta.env.MODE === 'e2e' ? lazy(() => import('./e2e/GanchoE2E')) : null

iniciarPersistenciaAlmacenamiento()

const clienteSupabase = obtenerClienteSupabase()
const servicioAuth = crearServicioAuth(clienteSupabase)
const pullApi = crearPullApi(clienteSupabase)
const opsApi = crearOpsApi(clienteSupabase)
const almacenSoportes = crearAlmacenSoportes(clienteSupabase)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider servicio={servicioAuth}>
      <SyncProvider db={db} api={pullApi}>
        <ServiciosApp db={db} api={opsApi} almacen={almacenSoportes}>
          {GanchoE2E && (
            <Suspense fallback={null}>
              <GanchoE2E />
            </Suspense>
          )}
          <BrowserRouter>
            <AppRoutes />
            <AvisoActualizacion />
          </BrowserRouter>
        </ServiciosApp>
      </SyncProvider>
    </AuthProvider>
  </StrictMode>,
)
