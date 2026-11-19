import { Route, Routes } from 'react-router-dom'
import { Ajustes } from './ui/Ajustes'
import { ComoInstalar } from './ui/ComoInstalar'
import { Home } from './ui/Home'
import { LoginPage } from './ui/auth/LoginPage'
import { Catalogo } from './ui/catalogo/Catalogo'
import { FormularioArticulo } from './ui/catalogo/FormularioArticulo'
import { ListasPrecio } from './ui/catalogo/ListasPrecio'
import { Pendientes } from './ui/pendientes/Pendientes'
import { TerceroDetalle } from './ui/terceros/TerceroDetalle'
import { TerceroNuevo } from './ui/terceros/TerceroNuevo'
import { Terceros } from './ui/terceros/Terceros'
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
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/catalogo/listas" element={<ListasPrecio />} />
        <Route path="/catalogo/articulos/nuevo" element={<FormularioArticulo />} />
        <Route path="/catalogo/articulos/:id" element={<FormularioArticulo />} />
        <Route path="/terceros" element={<Terceros />} />
        <Route path="/terceros/nuevo" element={<TerceroNuevo />} />
        <Route path="/terceros/:id" element={<TerceroDetalle />} />
      </Route>
    </Routes>
  )
}
