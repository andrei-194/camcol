import { Route, Routes } from 'react-router-dom'
import { Ajustes } from './ui/Ajustes'
import { ComoInstalar } from './ui/ComoInstalar'
import { Home } from './ui/Home'
import { CompraNueva } from './ui/compras/CompraNueva'
import { GastoNuevo } from './ui/gastos/GastoNuevo'
import { Gastos } from './ui/gastos/Gastos'
import { Mas } from './ui/Mas'
import { Proximamente } from './ui/Proximamente'
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
        <Route path="/mas" element={<Mas />} />
        <Route path="/ventas" element={<Proximamente titulo="Ventas" detalle="Aquí verás tus pedidos por confirmar y por cobrar." />} />
        <Route path="/ventas/nuevo" element={<Proximamente titulo="Nuevo pedido" volverA="/ventas" detalle="Aquí registrarás un pedido de WhatsApp o de la web." />} />
        <Route path="/compras" element={<Proximamente titulo="Compras" detalle="Aquí verás tus compras y encargos." accion={{ a: '/compras/nueva', texto: 'Nueva compra' }} />} />
        <Route path="/compras/nueva" element={<CompraNueva />} />
        <Route path="/inventario" element={<Proximamente titulo="Inventario" detalle="Aquí verás el stock, el kardex y los lotes." />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/gastos/nuevo" element={<GastoNuevo />} />
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
