import { Route, Routes } from 'react-router-dom'
import { Home } from './ui/Home'
import { LoginPage } from './ui/auth/LoginPage'
import { RequireAuth } from './ui/auth/RequireAuth'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
      </Route>
    </Routes>
  )
}
