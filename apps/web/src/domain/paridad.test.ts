// @vitest-environment node
// T-M4-01 (CAM-55). PARIDAD cliente↔servidor (PLAN §10, regla 3): `domain/totals` y `domain/pedidoEstados` contra
// los triggers REALES de Postgres (PGlite con las migraciones de supabase/migrations), con fast-check.
// Cierra RF-VEN-03 y RN-COS-03. Sin tolerancia: dinero exacto, mismas reglas de redondeo que el servidor.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ESTADOS_PEDIDO, requiereMotivo, transicionValida } from './pedidoEstados'
import {
  calcularTotales,
  calcularUtilidadBruta,
  precioConDescuento,
  validarCobro,
  validarDescuento,
  validarReembolso,
} from './totals'

const MIGRACIONES = [
  '0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0005_sync_pull.sql', '0006_fix_touch_padre.sql',
  '0011_candado_finalizados.sql', '0012_compra_apertura.sql', '0013_cerrar_escritura_directa.sql',
  '0015_validaciones_pedido.sql', '0016_movimientos_solo_internos.sql', '0017_reembolsos.sql',
]
const NUM_RUNS = 120

let db: PGlite
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[]
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0]!
const n = (x: unknown) => Number(x)
let cliente: string
let articulos: string[]

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } })
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `)
  for (const f of MIGRACIONES) {
    await db.exec(readFileSync(new URL(`../../../../supabase/migrations/${f}`, import.meta.url), 'utf8'))
  }
  cliente = (await one(`insert into terceros (nombre, es_cliente) values ('Cliente', true) returning id`)).id as string
  const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id as string
  articulos = []
  for (let i = 0; i < 3; i++) {
    const a = (
      await one(
        `insert into articulos (producto_id, nombre, presentacion_cantidad, presentacion_unidad) values ($1,$2,500,'g') returning id`,
        [prod, `Café ${i}`],
      )
    ).id as string
    await q(`insert into movimientos_inventario (articulo_id, tipo, cantidad, motivo) values ($1,'ajuste',1000000000,'stock inicial')`, [a])
    articulos.push(a)
  }
}, 60_000)

// ---- generadores (los rangos son los que admiten las columnas numeric del esquema) ----
const cantidad = fc.integer({ min: 1, max: 50_000 }).map((v) => v / 1000) // numeric(12,3)
const dinero = (maxPesos: number) => fc.integer({ min: 0, max: maxPesos * 100 }).map((v) => v / 100) // numeric(14,2)
const pct = fc.integer({ min: 0, max: 10_000 }).map((v) => v / 100) // numeric(5,2) entre 0 y 100
const tasa = fc.integer({ min: 0, max: 3_000 }).map((v) => v / 100) // numeric(5,2)
const costo = fc.integer({ min: 0, max: 2_000_000_000 }).map((v) => v / 10_000) // numeric(14,4)
const itemArb = fc.record({
  art: fc.integer({ min: 0, max: 2 }),
  cantidad,
  precioLista: dinero(500_000),
  descuentoPct: pct,
  tasaImpuesto: tasa,
})
const pedidoArb = fc.record({
  items: fc.array(itemArb, { maxLength: 6 }),
  descuentoValor: dinero(2_000_000),
  envioCobrado: dinero(100_000),
  envioCosto: dinero(100_000),
  costos: fc.tuple(costo, costo, costo),
})
type Pedido = typeof pedidoArb extends fc.Arbitrary<infer T> ? T : never

const crearPedido = async (p: Pedido) => {
  const id = (
    await one(
      `insert into pedidos_venta (cliente_id, descuento_valor, envio_cobrado, envio_costo, entrega_tipo)
       values ($1,$2,$3,$4,'recoge') returning id`,
      [cliente, p.descuentoValor, p.envioCobrado, p.envioCosto],
    )
  ).id as string
  for (const it of p.items) {
    await q(
      `insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, descuento_pct, precio_unitario, tasa_impuesto)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, articulos[it.art], it.cantidad, it.precioLista, it.descuentoPct, precioConDescuento(it.precioLista, it.descuentoPct), it.tasaImpuesto],
    )
  }
  return id
}
const itemsDominio = (p: Pedido) =>
  p.items.map((it) => ({
    cantidad: it.cantidad,
    precioUnitario: precioConDescuento(it.precioLista, it.descuentoPct),
    tasaImpuesto: it.tasaImpuesto,
  }))

describe('paridad con Postgres', () => {
  it('[RN-PRE-01] precioConDescuento = round(precio_lista * (1 - pct/100), 2) del servidor (0010)', async () => {
    await fc.assert(
      fc.asyncProperty(dinero(500_000), pct, async (lista, p) => {
        const r = await one(`select round($1::numeric * (1 - $2::numeric / 100), 2) v`, [lista, p])
        expect(precioConDescuento(lista, p)).toBe(n(r.v))
      }),
      { numRuns: NUM_RUNS * 2 },
    )
  }, 120_000)

  it('[RF-VEN-03] subtotal, impuestos y total = lo que calculan los triggers pvi_recalc y pv_totales (±0)', async () => {
    await fc.assert(
      fc.asyncProperty(pedidoArb, async (p) => {
        const id = await crearPedido(p)
        const s = await one(`select subtotal, impuestos, total, descuento_valor, envio_cobrado from pedidos_venta where id = $1`, [id])
        const t = calcularTotales({ items: itemsDominio(p), descuentoValor: p.descuentoValor, envioCobrado: p.envioCobrado })
        expect([t.subtotal, t.impuestos, t.total, t.descuentoValor, t.envioCobrado]).toEqual([
          n(s.subtotal), n(s.impuestos), n(s.total), n(s.descuento_valor), n(s.envio_cobrado),
        ])
      }),
      { numRuns: NUM_RUNS },
    )
  }, 120_000)

  it('[RF-VEN-03][RN-COS-03] finalizar: el servidor rechaza exactamente lo que validarDescuento rechaza y la utilidad bruta coincide con v_ventas_pedido', async () => {
    await fc.assert(
      fc.asyncProperty(pedidoArb.filter((p) => p.items.length > 0), async (p) => {
        const id = await crearPedido(p)
        for (let i = 0; i < 3; i++) await q(`update articulos set costo_promedio = $2 where id = $1`, [articulos[i], p.costos[i]])
        await q(`update pedidos_venta set estado = 'confirmado' where id = $1`, [id])
        const t = calcularTotales({ items: itemsDominio(p), descuentoValor: p.descuentoValor, envioCobrado: p.envioCobrado })
        if (t.total > 0) {
          await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',$2)`, [id, t.total])
        }
        const esperado = validarDescuento(t)
        let error: string | null = null
        try {
          await q(`update pedidos_venta set estado = 'finalizado' where id = $1`, [id])
        } catch (e) {
          error = (e as Error).message
        }
        if (esperado) {
          expect(error).toMatch(/RF-VEN-03/)
          return
        }
        expect(error).toBeNull()
        const items = await q(`select cantidad, precio_unitario, tasa_impuesto, costo_unitario from pedidos_venta_items where pedido_id = $1`, [id])
        const v = await one(`select ventas_netas, utilidad_bruta from v_ventas_pedido where pedido_id = $1`, [id])
        const u = calcularUtilidadBruta({
          items: items.map((i) => ({
            cantidad: n(i.cantidad), precioUnitario: n(i.precio_unitario), tasaImpuesto: n(i.tasa_impuesto), costoUnitario: n(i.costo_unitario),
          })),
          descuentoValor: p.descuentoValor,
          envioCobrado: p.envioCobrado,
          envioCosto: p.envioCosto,
        })
        expect(t.ventasNetas).toBe(n(v.ventas_netas))
        expect(u).toBe(n(v.utilidad_bruta))
      }),
      { numRuns: NUM_RUNS },
    )
  }, 180_000)

  it('[RN-PAG-02][RN-PAG-04] validarCobro y validarReembolso aceptan y rechazan lo mismo que los triggers de pagos (0017)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 300_000 }), { maxLength: 4 }),
        fc.integer({ min: 1, max: 400_000 }),
        fc.integer({ min: 1, max: 400_000 }),
        async (total, cobros, intento, reembolso) => {
          const id = (
            await one(`insert into pedidos_venta (cliente_id, envio_cobrado, entrega_tipo) values ($1,$2,'recoge') returning id`, [cliente, total])
          ).id as string
          let neto = 0
          const cobrar = async (valor: number) => {
            const esperado = validarCobro(total, neto, valor)
            try {
              await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',$2)`, [id, valor])
              expect(esperado).toBeNull()
              neto += valor
            } catch (e) {
              expect(esperado).toBe('E_SOBREPAGO')
              expect((e as Error).message).toMatch(/E_SOBREPAGO/)
            }
          }
          for (const c of cobros) await cobrar(c)
          await cobrar(intento)

          await q(`update pedidos_venta set estado = 'cancelado', motivo_estado = 'prueba' where id = $1`, [id])
          const esperadoRe = validarReembolso(neto, reembolso)
          let errRe: string | null = null
          try {
            await q(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',$2,'prueba')`, [id, reembolso])
          } catch (e) {
            errRe = (e as Error).message
          }
          expect(errRe === null ? null : 'E_SOBREPAGO').toBe(esperadoRe)
        },
      ),
      { numRuns: NUM_RUNS },
    )
  }, 180_000)

  it('[RN-VEN-02] transicionValida = pv_transicion_valida para los 25 pares de estados', async () => {
    for (const a of ESTADOS_PEDIDO) {
      for (const b of ESTADOS_PEDIDO) {
        const r = await one(`select pv_transicion_valida($1, $2) v`, [a, b])
        expect(transicionValida(a, b), `${a} -> ${b}`).toBe(r.v)
      }
    }
  })

  it('[RN-VEN-02] ESTADOS_PEDIDO = los valores que admite el CHECK de pedidos_venta.estado', async () => {
    const r = await one(
      `select pg_get_constraintdef(oid) d from pg_constraint
        where conrelid = 'pedidos_venta'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%estado%'`,
    )
    const enSql = [...String(r.d).matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]).sort()
    expect(enSql).toEqual([...ESTADOS_PEDIDO].sort())
  })

  it('[RF-VEN-05] requiereMotivo coincide con el trigger pv_a_validar: cancelar sin motivo se rechaza, con motivo se acepta', async () => {
    expect(requiereMotivo('cancelado')).toBe(true)
    expect(requiereMotivo('confirmado')).toBe(false)
    for (const vacio of [null, '', '   ']) {
      const id = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cliente])).id as string
      await expect(q(`update pedidos_venta set estado = 'cancelado', motivo_estado = $2 where id = $1`, [id, vacio])).rejects.toThrow(/RF-VEN-05/)
    }
    const id = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cliente])).id as string
    await q(`update pedidos_venta set estado = 'cancelado', motivo_estado = 'cliente desistió' where id = $1`, [id])
    // confirmar no exige motivo en el servidor
    const c = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cliente])).id as string
    await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,1000,1000)`, [c, articulos[0]])
    await q(`update pedidos_venta set estado = 'confirmado' where id = $1`, [c])
  })
})
