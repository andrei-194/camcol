import { Route, Routes } from 'react-router-dom'
import { Ajustes } from './ui/Ajustes'
import { ComoInstalar } from './ui/ComoInstalar'
import { Home } from './ui/Home'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/instalar" element={<ComoInstalar />} />
      <Route path="/ajustes" element={<Ajustes />} />
    </Routes>
  )
}
