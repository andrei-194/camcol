// [E1] base (CAM-49, T-M2-09): sin red se crea algo, queda pendiente (⏳), al volver la red solo se AVISA
// (nada se envía solo, regla 5) y se sube al pulsar «Subir seleccionados».
// Corre contra Supabase local real; la app se sirve con `vite preview` en modo e2e. Ver README (npm run test:e2e).
import { expect, test } from '@playwright/test'

const SUPABASE_URL = process.env['E2E_SUPABASE_URL']!
const SERVICE_KEY = process.env['E2E_SERVICE_KEY']!
const EMAIL = process.env['E2E_EMAIL']!
const PASSWORD = process.env['E2E_PASSWORD']!

type Gancho = {
  commit(nueva: { tipo: string; datos: unknown; filasLocales?: unknown[] }): Promise<{ estado: string; op_id: string; motivo?: string }>
  fila(tabla: string, id: string): Promise<{ _pendiente?: string } | undefined>
}

/** Consulta al servidor como administrador (la clave llega por entorno, nunca está en el repo). */
async function gastosEnServidor(id: string): Promise<Array<{ id: string; valor: number; categoria: string }>> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/gastos?id=eq.${id}&select=id,valor,categoria`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  expect(r.ok).toBe(true)
  return (await r.json()) as Array<{ id: string; valor: number; categoria: string }>
}

test('[E1] sin red: se encola con ⏳, al volver la red solo avisa y sube al pulsar', async ({ page, context }) => {
  const subidas: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/rpc/aplicar_ops')) subidas.push(req.method())
  })

  // 1. Primera carga con red: login y app shell precacheado por el service worker.
  await page.goto('/login')
  await page.getByLabel('Correo').fill(EMAIL)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Camino Col' })).toBeVisible()
  await expect(page.getByText('Lista para usarse sin conexión.')).toBeVisible({ timeout: 30_000 })

  // 2. Se corta la red y la app abre igual (RF-OPS-02, RF-AUTH-02).
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Camino Col' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Sin conexión' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sin pendientes' })).toBeVisible()

  // 3. Se crea un gasto con el escritor real (gancho solo de prueba): queda en la outbox y con ⏳ local.
  const id = crypto.randomUUID()
  const r = await page.evaluate(
    ([gastoId]) =>
      (window as unknown as { __camino_e2e: Gancho }).__camino_e2e.commit({
        tipo: 'gasto.registrar',
        datos: { id: gastoId, categoria: 'E2E', concepto: 'Prueba E2E', valor: 12345 },
        filasLocales: [{ tabla: 'gastos', fila: { id: gastoId, categoria: 'E2E', valor: 12345 } }],
      }),
    [id],
  )
  expect(r.estado).toBe('encolada')
  expect(r.motivo).toBe('sin_conexion')
  const local = await page.evaluate(([gastoId]) => (window as unknown as { __camino_e2e: Gancho }).__camino_e2e.fila('gastos', gastoId!), [id])
  expect(local?._pendiente).toBe(r.op_id) // la marca que la UI muestra como ⏳
  await expect(page.getByRole('link', { name: '1 pendiente' })).toBeVisible()
  expect(subidas).toHaveLength(0)

  // 4. Vuelve la red: aparece el banner y NADA se envía solo.
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: 'En línea' })).toBeVisible()
  const banner = page.getByRole('link', { name: /^1 sin subir \(el más viejo: /i })
  await expect(banner).toBeVisible()
  await page.waitForTimeout(2000)
  expect(subidas).toHaveLength(0)
  expect(await gastosEnServidor(id)).toHaveLength(0)

  // 5. El usuario abre Pendientes, selecciona y sube.
  await banner.click()
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible()
  await expect(page.getByText(/Gasto · E2E/)).toBeVisible()
  await page.getByRole('checkbox', { name: /Seleccionar: Gasto/ }).check()
  await page.getByRole('button', { name: 'Subir seleccionados' }).click()
  await expect(page.getByLabel('Resultado de la subida').getByText(/✔ Subido/)).toBeVisible()
  await expect(page.getByText('No tienes nada pendiente.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sin pendientes' })).toBeVisible()

  // 6. El dato existe en el servidor y se envió una sola vez.
  expect(subidas).toHaveLength(1)
  const enServidor = await gastosEnServidor(id)
  expect(enServidor).toHaveLength(1)
  expect(Number(enServidor[0]!.valor)).toBe(12345)
  expect(enServidor[0]!.categoria).toBe('E2E')
})
