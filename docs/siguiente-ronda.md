# Siguiente ronda (H1, parte 3): operaciones sobre `aplicar_ops`

Estado a 2026-11-18. Ya en `main`: esquema (0001–0006), `aplicar_ops` (0003), endurecimiento (0004), `sync_pull` (0005) y `tercero.crear` (0007, CAM-34, PR #10). 98 pruebas de base de datos en 6 suites. Esta ronda añade el resto de las operaciones de negocio y los candados que salieron de la auditoría (`docs/auditoria-h1-2026-11-18.md`).

## Tareas (una por agente)

| Issue | Tarea | Migración reservada | Archivo de pruebas |
|---|---|---|---|
| ~~CAM-34~~ | ~~`tercero.crear` con revisión de duplicados~~ **hecha (PR #10)** | `0007_op_tercero.sql` | `tests/db/op_tercero.test.mjs` |
| CAM-36 | `orden_compra.registrar` | `0008_op_compra.sql` | `tests/db/op_compra.test.mjs` |
| CAM-37 | `gasto.registrar` y `adjunto.vincular` | `0009_op_gasto_adjunto.sql` | `tests/db/op_gasto_adjunto.test.mjs` |
| CAM-35 | `pedido_venta.crear` (solo con conexión) | `0010_op_pedido_venta.sql` | `tests/db/op_pedido_venta.test.mjs` |
| CAM-88 | Candado de pedidos finalizados (H-02) | `0011_candado_finalizados.sql` | `tests/db/candado_finalizados.test.mjs` (rama `CAM-88-candado-pedido-finalizado`, en rojo) |
| CAM-90 | Compra de apertura para el inventario inicial (H-01, D-014) | `0013_compra_apertura.sql` | `tests/db/compra_apertura.test.mjs` (rama `CAM-90-compra-apertura`, en rojo) |
| CAM-89 | Cerrar la escritura directa (H-03) | `0012_cerrar_escritura_directa.sql` | `tests/db/escritura_directa.test.mjs` (rama `CAM-89-cerrar-escritura-directa`, en rojo) |

El alcance, las pruebas y el criterio de "hecho" de cada una están en su issue de Linear. Después, en serie: CAM-40 (integración real con Supabase local, T-M1-10), que cierra H1.

## Cómo trabajar

1. Lee `AGENTS.md`, `docs/DECISIONS.md` (D-009, D-012, D-013), `docs/spec/PLAN.md` §4.3 (contrato de `aplicar_ops`) y la tarea en `docs/spec/TASKS.md`.
2. Pasa el issue a *In Progress*. Crea la rama `CAM-n-descripcion-corta` **desde `main` actualizado** (`git fetch && git checkout -B CAM-n-... origin/main`). Comprueba con `git log --oneline -1` que ves el último merge.
3. **TDD:** primero el archivo de pruebas (nombres que citan los IDs, `[RF-SYN-06]`, `[E14]`), míralo fallar, haz un commit `test: ... (rojo) (CAM-n)`, luego la migración y el commit `feat: ...`.
4. Cada operación es una función `f(datos jsonb) returns jsonb` en `public` con `search_path` fijo, más un `insert into tipos_op` en tu migración. Para pedir revisión devuelve `{"_revision": true, ...}`. Para fallar usa `RAISE EXCEPTION 'CODIGO: mensaje'`. No modifiques el núcleo de `aplicar_ops`.
5. No edites migraciones existentes ni `package.json` (`test:db` descubre tu archivo solo). No toques las migraciones reservadas a otras tareas.
6. Documenta el contrato de tu op en `PLAN.md` §4.3 y marca la tarea `[x]` en `TASKS.md`. Decisiones nuevas, en `DECISIONS.md` sin número (usa "Nota T-M1-0n") para no chocar.
7. Verifica con `npm run test:db`. La app web no hace falta tocarla (corre en Docker, ver D-011). Todo en el disco D:.
8. Commits en español `tipo: resumen (CAM-n)` con el trailer `Co-Authored-By`. Abre un PR por tarea con la plantilla y menciona `CAM-n`. Pasa el issue a *In Review*; al fusionar, a *Done*.
9. Un hallazgo fuera del alcance (como el de `touch_padre`) se abre como issue propio con prueba en rojo; no se arregla a escondidas dentro de tu PR.

## Orden de fusión

1. ~~CAM-34~~ (hecha).
2. **CAM-88** y **CAM-37**, en paralelo (independientes entre sí).
3. **CAM-36** y después **CAM-35** (reutilizan `crear_tercero_desde_payload` de 0007).
4. **CAM-90**, después de CAM-36 (la op de compra debe aceptar `modalidad: "apertura"`).
5. **CAM-89**, con todas las operaciones ya fusionadas (los candados se prueban contra los flujos reales).
6. **CAM-40** (integración real con Supabase), que cierra H1.

Las ramas de CAM-88, 89 y 90 ya existen con su prueba en rojo y `main` fusionado; el agente que tome cada tarea sigue esa rama (rebasando o fusionando `main` de nuevo) y abre el PR. Las migraciones `0011`–`0013` están reservadas. Hallazgos de la auditoría sin tarea: ver la nota «auditoría H1» en `docs/DECISIONS.md`.

## Fuera de esta ronda

T-M2-00 (spike en iPhone real) necesita un iPhone físico y lo hace el socio desarrollador. La protección de la rama `main` (CAM-10) requiere permisos de administrador en GitHub.
