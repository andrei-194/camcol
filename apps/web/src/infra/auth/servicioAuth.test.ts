import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearServicioAuth } from './servicioAuth'

const usuario = { id: 'u-1', email: 'socio@camino.co' }

function clienteFalso(auth: Record<string, unknown>, miembros?: () => unknown) {
  const maybeSingle = vi.fn(async () => (miembros ? miembros() : { data: null, error: null }))
  return {
    auth,
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  } as unknown as SupabaseClient
}

beforeEach(() => localStorage.clear())

describe('[RF-AUTH-01] iniciar sesión', () => {
  it('con credenciales válidas devuelve el usuario', async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { user: usuario }, error: null }))
    const svc = crearServicioAuth(clienteFalso({ signInWithPassword }))
    expect(await svc.iniciarSesion('socio@camino.co', 'secreto')).toEqual({ ok: true, usuario })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'socio@camino.co', password: 'secreto' })
  })

  it('credenciales incorrectas se distinguen de un fallo de red', async () => {
    const malas = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    const svc = crearServicioAuth(
      clienteFalso({ signInWithPassword: async () => ({ data: { user: null }, error: malas }) }),
    )
    expect(await svc.iniciarSesion('a@b.co', 'x')).toEqual({ ok: false, motivo: 'credenciales' })
  })

  it('un fallo de red no se confunde con credenciales incorrectas', async () => {
    const red = new AuthRetryableFetchError('Failed to fetch', 0)
    const svc = crearServicioAuth(
      clienteFalso({ signInWithPassword: async () => ({ data: { user: null }, error: red }) }),
    )
    expect(await svc.iniciarSesion('a@b.co', 'x')).toEqual({ ok: false, motivo: 'sin-conexion' })
  })

  it('una excepción de fetch (TypeError) cuenta como sin conexión', async () => {
    const svc = crearServicioAuth(
      clienteFalso({
        signInWithPassword: async () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    )
    expect(await svc.iniciarSesion('a@b.co', 'x')).toEqual({ ok: false, motivo: 'sin-conexion' })
  })
})

describe('[RF-AUTH-02] cargar sesión persistida', () => {
  it('con sesión válida la devuelve', async () => {
    const getSession = vi.fn(async () => ({ data: { session: { user: usuario } }, error: null }))
    const svc = crearServicioAuth(clienteFalso({ getSession }))
    expect(await svc.cargarSesion()).toEqual({ tipo: 'sesion', usuario, sinConexion: false })
  })

  it('sin red y con token expirado recuerda al usuario y NO cierra sesión', async () => {
    const signOut = vi.fn()
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: { user: usuario } }, error: null })
      .mockResolvedValueOnce({
        data: { session: null },
        error: new AuthRetryableFetchError('Failed to fetch', 0),
      })
    const cliente = clienteFalso({ getSession, signOut })
    await crearServicioAuth(cliente).cargarSesion() // primera vez: recuerda al usuario
    const resultado = await crearServicioAuth(cliente).cargarSesion()
    expect(resultado).toEqual({ tipo: 'sesion', usuario, sinConexion: true })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('sin red y sin usuario recordado no inventa una sesión', async () => {
    const getSession = async () => ({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    const svc = crearServicioAuth(clienteFalso({ getSession }))
    expect(await svc.cargarSesion()).toEqual({ tipo: 'ninguna', caducada: false })
  })

  it('invalid_grant con el servidor alcanzable pide volver a entrar y olvida al usuario', async () => {
    const buena = { data: { session: { user: usuario } }, error: null }
    const caducada = {
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    }
    const getSession = vi.fn().mockResolvedValueOnce(buena).mockResolvedValueOnce(caducada)
    const cliente = clienteFalso({ getSession })
    await crearServicioAuth(cliente).cargarSesion()
    expect(await crearServicioAuth(cliente).cargarSesion()).toEqual({ tipo: 'ninguna', caducada: true })
    expect(localStorage.getItem('camino.auth.usuario')).toBeNull()
  })

  it('suscribir ignora TOKEN_REFRESHED y reenvía SIGNED_IN / SIGNED_OUT', () => {
    let callback: (evento: string, sesion: unknown) => void = () => {}
    const unsubscribe = vi.fn()
    const onAuthStateChange = vi.fn((cb) => {
      callback = cb
      return { data: { subscription: { unsubscribe } } }
    })
    vi.useFakeTimers()
    const recibidos: unknown[] = []
    const baja = crearServicioAuth(clienteFalso({ onAuthStateChange })).suscribir((e) => recibidos.push(e))
    callback('TOKEN_REFRESHED', { user: usuario })
    callback('SIGNED_IN', { user: usuario })
    callback('SIGNED_OUT', null)
    vi.runAllTimers()
    vi.useRealTimers()
    expect(recibidos).toEqual([{ tipo: 'abierta', usuario }, { tipo: 'cerrada' }])
    baja()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

describe('[RF-AUTH-04] pertenencia a miembros', () => {
  it('fila presente: miembro', async () => {
    const svc = crearServicioAuth(clienteFalso({}, () => ({ data: { user_id: 'u-1' }, error: null })))
    expect(await svc.esMiembro('u-1')).toBe('si')
  })

  it('sin fila (RLS la oculta): no es miembro', async () => {
    const svc = crearServicioAuth(clienteFalso({}, () => ({ data: null, error: null })))
    expect(await svc.esMiembro('u-1')).toBe('no')
  })

  it('error de red: desconocido, nunca "no"', async () => {
    const svc = crearServicioAuth(
      clienteFalso({}, () => ({
        data: null,
        error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      })),
    )
    expect(await svc.esMiembro('u-1')).toBe('desconocido')
  })

  it('excepción de red: desconocido', async () => {
    const svc = crearServicioAuth(
      clienteFalso({}, () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await svc.esMiembro('u-1')).toBe('desconocido')
  })

  it('error del servidor (5xx / permisos): desconocido, nunca "no"', async () => {
    const svc = crearServicioAuth(
      clienteFalso({}, () => ({ data: null, error: { message: 'boom', code: '500', details: '', hint: '' } })),
    )
    expect(await svc.esMiembro('u-1')).toBe('desconocido')
  })
})
