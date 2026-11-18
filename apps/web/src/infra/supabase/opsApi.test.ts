import { describe, expect, it } from 'vitest'
import { clasificarRespuestaRpc } from './opsApi'

const ok = { detener_cola: false, resultados: [{ op_id: 'a', status: 'ok' }] }

describe('[RF-SYN-02] clasificación de la respuesta de aplicar_ops', () => {
  it('éxito de la llamada → ok', () => {
    expect(clasificarRespuestaRpc({ data: ok, error: null, status: 200 })).toMatchObject({ clase: 'ok' })
  })
  it('respuesta con forma inesperada → no_aplicado', () => {
    expect(clasificarRespuestaRpc({ data: { x: 1 }, error: null, status: 200 })).toMatchObject({ clase: 'no_aplicado' })
  })
  it.each([
    ['TypeError: Failed to fetch', 0],
    ['AbortError: signal is aborted without reason', 0],
    ['Bad Gateway', 502],
    ['Gateway Timeout', 504],
  ])('%s (%i) → red', (message, status) => {
    expect(clasificarRespuestaRpc({ data: null, error: { message, code: '' }, status })).toEqual({ clase: 'red' })
  })
  it('error con SQLSTATE → rechazo', () => {
    expect(clasificarRespuestaRpc({ data: null, error: { message: 'bad', code: '22P02' }, status: 400 })).toEqual({
      clase: 'rechazo',
      codigo: '22P02',
      mensaje: 'bad',
    })
  })
  it.each([401, 429, 500, 501, 505])('HTTP %i → no_aplicado', (status) => {
    expect(clasificarRespuestaRpc({ data: null, error: { message: 'x', code: 'PGRST301' }, status })).toMatchObject({
      clase: 'no_aplicado',
      http: status,
    })
  })
  it('un 5xx con código SQLSTATE sigue siendo no_aplicado (no es rechazo de negocio)', () => {
    expect(clasificarRespuestaRpc({ data: null, error: { message: 'x', code: '57014' }, status: 500 })).toMatchObject({
      clase: 'no_aplicado',
    })
  })
})
