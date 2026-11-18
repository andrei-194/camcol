/** Tipos de autenticación y acceso (RF-AUTH-01/02/04). Sin dependencias de librerías. */

export interface UsuarioSesion {
  id: string
  email: string
}

/** Resultado de consultar si el usuario está en `miembros` (RF-AUTH-04). */
export type Membresia = 'si' | 'no' | 'desconocido'

export type ResultadoCargaSesion =
  /** Hay sesión; `sinConexion` indica que no se pudo refrescar el token por falta de red. */
  | { tipo: 'sesion'; usuario: UsuarioSesion; sinConexion: boolean }
  /** No hay sesión; `caducada` si el servidor rechazó el refresco (invalid_grant). */
  | { tipo: 'ninguna'; caducada: boolean }

export type ResultadoInicioSesion =
  | { ok: true; usuario: UsuarioSesion }
  | { ok: false; motivo: 'credenciales' | 'sin-conexion' | 'otro' }

export type EventoSesion = { tipo: 'abierta'; usuario: UsuarioSesion } | { tipo: 'cerrada' }

/** Puerto de autenticación: la UI y la aplicación solo conocen esto. */
export interface ServicioAuth {
  cargarSesion(): Promise<ResultadoCargaSesion>
  iniciarSesion(email: string, contrasena: string): Promise<ResultadoInicioSesion>
  /** Cierre explícito pedido por el usuario. Nunca se invoca por errores de red. */
  cerrarSesion(): Promise<void>
  esMiembro(usuarioId: string): Promise<Membresia>
  /** Devuelve la función para cancelar la suscripción. */
  suscribir(alCambiar: (evento: EventoSesion) => void): () => void
}
