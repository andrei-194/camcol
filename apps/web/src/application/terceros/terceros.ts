// Lógica de terceros para la UI: búsqueda local, validación del formulario y armado de la op `tercero.crear`
// (PLAN §4.3). El servidor revalida todo (regla 3); esto solo da mensajes rápidos, también sin señal.
import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { CaminoDB, Tercero } from '../../infra/db/db'

export type FiltroRol = 'todos' | 'cliente' | 'proveedor'

export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
const soloDigitos = (t: unknown) => String(t ?? '').replace(/\D/g, '')

/** Búsqueda instantánea por nombre, teléfono o documento (sin tildes ni mayúsculas) y filtro por rol. */
export function filtrarTerceros(todos: Tercero[], texto: string, rol: FiltroRol): Tercero[] {
  const q = normalizar(texto)
  const d = soloDigitos(texto)
  return todos
    .filter((t) => rol === 'todos' || (t.roles ?? []).includes(rol))
    .filter((t) => {
      if (!q) return true
      if (normalizar(String(t['nombre'] ?? '')).includes(q)) return true
      if (normalizar(String(t['numero_documento'] ?? '')).includes(q)) return true
      if (normalizar(String(t['telefono'] ?? '')).includes(q)) return true
      return d.length > 0 && (soloDigitos(t['telefono']).includes(d) || soloDigitos(t['numero_documento']).includes(d))
    })
    .sort((a, b) => String(a['nombre'] ?? '').localeCompare(String(b['nombre'] ?? ''), 'es'))
}

export type CargaTerceros = { fase: 'cargando' } | { fase: 'error' } | { fase: 'listo'; terceros: Tercero[] }

/** Todos los terceros locales, vivos: se actualizan solos cuando cambia Dexie (pull o captura local). */
export function useTerceros(db: CaminoDB): CargaTerceros {
  const [carga, setCarga] = useState<CargaTerceros>({ fase: 'cargando' })
  useEffect(() => {
    const sub = liveQuery(() => db.terceros.toArray()).subscribe({
      next: (terceros) => setCarga({ fase: 'listo', terceros }),
      error: () => setCarga({ fase: 'error' }),
    })
    return () => sub.unsubscribe()
  }, [db])
  return carga
}

export type RolForm = '' | 'cliente' | 'proveedor' | 'ambos'
export interface FormTercero {
  rol: RolForm
  nombre: string
  telefono: string
  tipo_documento: string
  numero_documento: string
  municipio: string
  vereda: string
  direccion: string
  latitud: string
  longitud: string
  productos_ofrecidos: string
  notas: string
  consentimiento: boolean
}

export const FORM_VACIO: FormTercero = {
  rol: '',
  nombre: '',
  telefono: '',
  tipo_documento: 'CC',
  numero_documento: '',
  municipio: '',
  vereda: '',
  direccion: '',
  latitud: '',
  longitud: '',
  productos_ofrecidos: '',
  notas: '',
  consentimiento: false,
}

export type ErroresForm = Partial<Record<keyof FormTercero, string>>

export const esCliente = (r: RolForm) => r === 'cliente' || r === 'ambos'
export const esProveedor = (r: RolForm) => r === 'proveedor' || r === 'ambos'

function numero(t: string): number | null {
  const v = t.trim().replace(',', '.')
  if (v === '') return null
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN
}

export function validarForm(f: FormTercero): ErroresForm {
  const e: ErroresForm = {}
  if (!f.nombre.trim()) e.nombre = 'Escribe el nombre.'
  if (!f.rol) e.rol = 'Elige si es cliente, proveedor o ambos.'
  if (f.telefono.trim()) {
    const d = soloDigitos(f.telefono)
    if (/[a-zA-Z]/.test(f.telefono) || d.length < 7 || d.length > 15) e.telefono = 'El teléfono debe tener entre 7 y 15 dígitos.'
  }
  const lat = numero(f.latitud)
  const lng = numero(f.longitud)
  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) e.latitud = 'La latitud debe estar entre -90 y 90.'
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) e.longitud = 'La longitud debe estar entre -180 y 180.'
  if ((lat === null) !== (lng === null) && !e.latitud && !e.longitud) e.longitud = 'Escribe latitud y longitud, o ninguna.'
  if (esCliente(f.rol) && !f.consentimiento) e.consentimiento = 'El consentimiento de datos es obligatorio para clientes.'
  return e
}

const opc = (t: string) => (t.trim() ? t.trim() : undefined)

/** Payload de `tercero.crear` (PLAN §4.3). `id` lo crea el cliente para poder ligar la foto. */
export function armarDatos(f: FormTercero, id: string, ahora: Date): Record<string, unknown> {
  const cliente = esCliente(f.rol)
  const doc = opc(f.numero_documento)
  return {
    id,
    nombre: f.nombre.trim(),
    es_cliente: cliente,
    es_proveedor: esProveedor(f.rol),
    telefono: f.telefono.trim() ? soloDigitos(f.telefono) : undefined,
    tipo_documento: doc ? f.tipo_documento : undefined,
    numero_documento: doc,
    municipio: opc(f.municipio),
    vereda: opc(f.vereda),
    direccion: opc(f.direccion),
    latitud: numero(f.latitud) ?? undefined,
    longitud: numero(f.longitud) ?? undefined,
    productos_ofrecidos: esProveedor(f.rol) ? opc(f.productos_ofrecidos) : undefined,
    notas: opc(f.notas),
    ...(cliente ? { consentimiento_datos: true, consentimiento_en: ahora.toISOString() } : {}),
  }
}

/** Fila local provisional (se muestra con ⏳ hasta que la op se aplique). */
export function filaLocal(datos: Record<string, unknown>): Tercero {
  const roles: Array<'cliente' | 'proveedor'> = []
  if (datos['es_cliente']) roles.push('cliente')
  if (datos['es_proveedor']) roles.push('proveedor')
  return { ...(datos as { id: string }), roles }
}
