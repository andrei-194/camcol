// @vitest-environment node
// T-M5-01 (CAM-61). PARIDAD cliente↔servidor (PLAN §10, regla 3): `totalCompra` contra el total REAL que calcula Postgres
// (`oc_recalcular`: suma de `round(cantidad × costo, 2)` por línea), con las migraciones de supabase/migrations en PGlite.
// Una compra inmediata exige que el pago sume EXACTAMENTE ese total (E_PAGO): sin tolerancia.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { lineaVacia, totalCompra, type LineaCompra } from './compras'

const MIGRACIONES = [
  '0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0005_sync_pull.sql', '0006_fix_touch_padre.sql',
  '0011_candado_finalizados.sql', '0012_compra_apertura.sql', '0013_cerrar_escritura_directa.sql',
  '0015_validaciones_pedido.sql', '0016_movimientos_solo_internos.sql', '0017_reembolsos.sql',
]

let db: PGlite
let proveedor: string
let articulos: string[]
const one = async (sql: string, params: unknown[] = []) => ((await db.query(sql, params)).rows as Record<string, unknown>[])[0]!

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } })
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `)
  for (const f of MIGRACIONES) {
    await db.exec(readFileSync(new URL(`../../../../../supabase/migrations/${f}`, import.meta.url), 'utf8'))
  }
  proveedor = (await one(`insert into terceros (nombre, es_proveedor) values ('Proveedor', true) returning id`)).id as string
  const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id as string
  articulos = []
  for (let i = 0; i < 3; i++) {
    articulos.push(
      (
        await one(`insert into articulos (producto_id, nombre, presentacion_cantidad, presentacion_unidad) values ($1,$2,500,'g') returning id`, [prod, `Café ${i}`])
      ).id as string,
    )
  }
}, 60_000)

/** Total que calcula el servidor para esas líneas (cantidad y costo ya interpretados por el cliente). */
async function totalServidor(lineas: Array<{ cantidad: string; costo: number }>): Promise<number> {
  const orden = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [proveedor])).id as string
  for (const [i, l] of lineas.entries()) {
    await db.query(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,$3,$4)`, [
      orden,
      articulos[i],
      l.cantidad.replace(',', '.'),
      l.costo,
    ])
  }
  return Number((await one(`select total from ordenes_compra where id = $1`, [orden])).total)
}

const linea = (cantidad: string, costo: number): LineaCompra => ({ ...lineaVacia(), articuloId: 'x', cantidad, costo: String(costo) })

describe('[paridad] totalCompra frente a oc_recalcular', () => {
  it.each([
    [[['1,005', 1]], 1.01],
    [[['0,125', 12345], ['0,125', 12345]], 3086.26],
    [[['0,333', 1000]], 333],
    [[['2,5', 10000], ['20', 30000]], 625000],
    [[['0,001', 1]], 0], // fracción de centavo que se redondea a cero: el servidor da 0,00
  ] as Array<[Array<[string, number]>, number]>)('ejemplo %j da %d en cliente y servidor', async (datos, esperado) => {
    const cliente = totalCompra(datos.map(([c, k]) => linea(c, k)))
    const servidor = await totalServidor(datos.map(([c, k]) => ({ cantidad: c, costo: k })))
    expect(servidor).toBe(esperado)
    expect(cliente).toBe(esperado)
  })

  it('[propiedad] el total del cliente es igual al del servidor para cualquier compra', async () => {
    const milesimas = fc.integer({ min: 1, max: 99_999_999 }) // hasta 99.999,999 unidades por línea
    const costo = fc.integer({ min: 1, max: 4_000_000 })
    const texto = (mil: number) => `${Math.floor(mil / 1000)},${String(mil % 1000).padStart(3, '0')}`
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(milesimas, costo), { minLength: 1, maxLength: 2 }), async (pares) => {
        const lineas = pares.map(([m, k]) => ({ cantidad: texto(m), costo: k }))
        const servidor = await totalServidor(lineas)
        const cliente = totalCompra(lineas.map((l) => linea(l.cantidad, l.costo)))
        expect(cliente).toBe(servidor)
      }),
      { numRuns: 150 },
    )
  }, 120_000)
})
