import { Route, Routes } from 'react-router-dom'
import { Ajustes } from './ui/Ajustes'
import { ComoInstalar } from './ui/ComoInstalar'
import { Home } from './ui/Home'
import { LoginPage } from './ui/auth/LoginPage'
import { Pendientes } from './ui/pendientes/Pendientes'
import { RequireAuth } from './ui/auth/RequireAuth'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/instalar" element={<ComoInstalar />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/pendientes" element={<Pendientes />} />
      </Route>
    </Routes>
  )
}
