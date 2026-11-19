# Goldfish Review Report

**Target:** `docs/spec/SPEC.md` (líneas 1-392, todo el archivo). Preset «Feature spec only», Etapa 5 (Initial Zoom Out Review).

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed (segundo intento; el primero cortó por límite de API) |
| `egm-inventive-catalyst` | completed (segundo intento; el primero no dejó hallazgos recuperables) |

Notas:
- Ningún reviewer leyó PLAN.md completo (solo greps dirigidos). `egm-zoom-out` leyó DECISIONS hasta la línea 282 y no leyó catalogo.md. Lo que depende de PLAN queda con menor confianza.
- Los números de línea son los que reportó cada reviewer; no se verificaron de nuevo.
- Excluido por decisión previa: alcance offline (D-009), reembolsos totales (D-015), compra de apertura (D-014), estados recibido→confirmado→finalizado (D-004).
- Resumen: 0 Blocker. Los 17 hallazgos fusionados son 9 Major y 8 Nit, tras deduplicar los 12 de `zoom_out` (6 Major, 6 Nit) y los 16 de `inventive_catalyst` (11 Major, 5 Nit).
- El mensaje del coordinador mencionaba 18 Major y 8 Nit (ids 1-1 a 1-26) para `inventive_catalyst`. Ese informe no llegó y no se pudo recuperar. Los hallazgos de abajo vienen de la relanzada, que entregó 16.

## Prioritized Findings (Blockers -> Major -> Nits)

### F-1 Residuos de pedido de venta offline - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-1), `egm-inventive-catalyst` (inventive_catalyst-1-1)
* **Affected Scope:** L244, L106 (RF-CAT-04), L110 (RF-VEN-02); contrasta con L116, L69 (D10), L262
* **Discrepancy Description:** L244 dice que `recibido` nace "también offline", y eso contradice RF-VEN-08, D10 y §10.1, que exigen conexión. RF-CAT-04 cachea el catálogo "para tomar pedidos offline". RF-VEN-02 usa el "cache local si no hay conexión" para `precio_para`.
* **Rationale & Recommendation:** Son restos previos a D-009. Borra "(también offline)", cambia RF-CAT-04 a "para consultar" y quita el cache local de RF-VEN-02.

### F-2 Forma de la op y `device_id` desactualizados - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-2), `egm-inventive-catalyst` (inventive_catalyst-1-4)
* **Affected Scope:** L274 (§10.2), L171 (RF-SYN-11), L54 (D-016)
* **Discrepancy Description:** §10.2 define `{op_id, device_id, tipo, payload, client_created_at}`. D-013 lo reemplazó por `{op_id, tipo, datos}`. RF-SYN-11 exige `device_id` para ordenar, pero el servidor ya no lo recibe y ningún requisito lo usa.
* **Rationale & Recommendation:** La spec gana sobre el contrato, así que se contradicen. Reemplaza el esquema inline por una referencia a PLAN §4.3 y quita RF-SYN-11 o redúcelo a "el servidor ordena".

### F-3 "Toda escritura pasa por `aplicar_ops`" no se cumple - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-3), `egm-inventive-catalyst` (inventive_catalyst-1-3)
* **Affected Scope:** L161-163 (RF-SYN-01), L285 (§10.3); AGENTS regla 4
* **Discrepancy Description:** §10.3 lista 6 ops. Cobros, cambios de estado, emisión y anulación de documentos, ajustes y edición de maestros van por UPDATE o RPC con triggers. Hay una asimetría: el reembolso tiene op y el cobro no. §10.3 tampoco detalla qué escriben `tercero.crear` y `gasto.registrar`.
* **Rationale & Recommendation:** El requisito no es verificable tal cual. Acótalo a "las escrituras que admiten offline, la creación de PV y el reembolso pasan por `aplicar_ops`; el resto va por UPDATE o RPC y los triggers deciden". Ajusta la regla 4 de AGENTS.

### F-4 Comprobante de compra para el campesino sin consecutivo offline - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-4)
* **Affected Scope:** L127 (RF-COM-07), L267 (§10.1), L326 (E1)
* **Discrepancy Description:** El comprobante es "para el campesino", pero emitirlo exige consecutivo del servidor y no se puede offline. En una finca sin señal no hay comprobante, y la spec no dice qué recibe el campesino en el momento.
* **Rationale & Recommendation:** Declara que el comprobante se emite al sincronizar, o recorta RF-COM-07.

### F-5 `confirmacion` offline contradice "fila inmutable" y D10 - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-5), `egm-inventive-catalyst` (inventive_catalyst-1-6)
* **Affected Scope:** L147 (RF-DOC-02), L151 (RF-DOC-06), L269 (§10.1)
* **Discrepancy Description:** RF-DOC-02 dice que el documento es una fila inmutable con snapshot y consecutivo. La `confirmacion` offline no tendría ninguna de las dos cosas y no hay op de documentos en §10.3. Como el PV solo se crea online, offline solo se puede confirmar un pedido ya cacheado.
* **Rationale & Recommendation:** Elige una opción. Generarla solo con conexión, o declararla un PDF de cliente sin fila ni consecutivo y justificar la excepción en D10.

### F-6 Regla de flete y doble conteo no verificable - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-6)
* **Affected Scope:** L192 (RN-COS-04), L140 (RF-PAG-03)
* **Discrepancy Description:** La regla prohíbe un gasto vinculado a un PV con categoría "flete/envío/transporte/transportadora". La categoría es texto libre, y DECISIONS L202 admite que no detecta otros nombres ni gastos sin vínculo.
* **Rationale & Recommendation:** Quita la vinculación gasto→PV y deja gasto→OC o suelto, así el doble conteo es imposible por diseño. Si se mantiene, hazla una lista cerrada.

### F-7 `envio_costo` exigido al finalizar choca con el flujo - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-2)
* **Affected Scope:** L113, L109, L202, L385
* **Discrepancy Description:** `finalizado` significa pago más stock, no entrega, y se finaliza al cobrar, cuando el flete real quizá no se conoce. La spec exige `envio_costo > 0`, y 0 se trata como "sin dato", así que un flete gratis no puede finalizarse. El candado 0011 impide corregirlo después.
* **Rationale & Recommendation:** Usa NULL como "sin dato" y no exijas el flete al finalizar. La utilidad lo toma como 0 hasta que se complete. Alternativa: permitir editar `envio_costo` en un pedido finalizado.
* **Riesgo del cambio:** requiere migración nueva. Mientras falte el flete, el margen queda sobrestimado.

### F-8 Encargo offline sin op de recepción ni de pago posterior - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-5); `egm-zoom-out` lo menciona dentro de zoom_out-1-11
* **Affected Scope:** L123-125 (RF-COM-03/04/05), L263 (§10.1); nota T-M1-06 y T-M5-02
* **Discrepancy Description:** RF-COM-03 dice "Offline permitido" para el encargo, pero la recepción y el pago ocurren después. No hay op para eso (DECISIONS admite que el pago posterior no tiene op propia).
* **Rationale & Recommendation:** Deja el offline solo para la compra inmediata, que es el caso de campo (E1). Marca encargo, recepción posterior y pago posterior como online. Si hacen falta offline, hay que definir 2 ops más.

### F-9 Invariantes de stock y costo promedio inconsistentes - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-7, 1-8), `egm-zoom-out` (parte de zoom_out-1-11)
* **Affected Scope:** L341 (E6), L184 (RN-INV-03), L133 (RF-INV-03), L186 (RN-INV-05), L189-190
* **Discrepancy Description:**
  - D-015/H-09 acepta mermas y ajustes que dejen stock negativo, con alerta. La spec y E6 dicen "el stock nunca queda negativo".
  - RN-INV-05 llama "conmutativas" a las entradas offline, pero el costo promedio ponderado depende del orden. Una compra subida tarde cambia el promedio de las ventas posteriores.
* **Rationale & Recommendation:** Limita el invariante a ventas y agrega la alerta de negativo a RF-DSH-04 o RF-INV-01. Quita "conmutativas", declara que el costo se calcula en el orden de aplicación en el servidor y que los snapshots ya finalizados no se recalculan, y añade una prueba que lo cite.

### F-10 Lotes y vencimiento sin perecederos (YAGNI) - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-9), `egm-zoom-out` (parte de zoom_out-1-12)
* **Affected Scope:** L21, L63 (D4), L124, L134 (RF-INV-04), L207 (RN-COM-02), L382; catalogo.md L43
* **Discrepancy Description:** D4 reconoce que "hoy no hay perecederos" y catalogo.md arranca todo sin lote. Aun así se piden captura de lote, alerta a 60 días y la tarea T-M6-04. No hay FEFO, así que la alerta no se conecta a ninguna venta.
* **Rationale & Recommendation:** Deja las banderas del esquema y difiere la UI de lotes y la alerta hasta el primer perecedero. Corrige el ejemplo de D4 y el objetivo 3.

### F-11 Dos numeraciones de decisiones chocan y hay duplicados - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-10), `egm-zoom-out` (zoom_out-1-8, como Nit)
* **Affected Scope:** L56-L79 (§5), L62, L72, L203
* **Discrepancy Description:** La SPEC usa D1-D14 y DECISIONS usa D-001-D-017 con otro significado. RN-VEN-05 cita "D-005" y RF-PAG-02 cita "D13" para lo mismo. D3 está contenido en D13, y D9 más D10 repiten RF-SYN-02 y §10.1. El orden es 14, 12, 13, 11.
* **Rationale & Recommendation:** Renombra la tabla de la SPEC (`S-1..S-14`) o cita solo D-nnn. Fusiona D3 en D13 y deja el offline en un solo lugar (§10.1). Hay que actualizar las referencias en TASKS y PLAN.

### F-12 Cabecera, fuente de verdad y TASKS desactualizados - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-11), `egm-zoom-out` (zoom_out-1-7, como Nit)
* **Affected Scope:** L3-L7, L82, §6; TASKS L54, L118, L120, L128
* **Discrepancy Description:**
  - La cabecera dice "v1.1" pero lista cambios hasta 1.3, y dice que `0001_core.sql` "aún implementa el flujo anterior" cuando T-M1-00 está hecha. Sigue citando "24 pruebas".
  - Declara `0001` como fuente de verdad cuando el esquema vigente son las migraciones 0001-0017. §6 omite `adjuntos`, `configuracion` y `v_por_reembolsar`. RF-PAG-02 dice "no hay cuentas por pagar" mientras §6 lista `v_cuentas_por_pagar`.
  - En TASKS: el UAT (pasos 3 y 5) contradice RF-INV-05 y RF-SYN-08, T-M8-07 dice E1-E15 y la spec llega a E18, "M5.5" no existe, y T-M2-00 sigue `[ ]` aunque H2 está hecho.
* **Rationale & Recommendation:** Deja un estado de una línea ("v1.3, migraciones en `supabase/migrations/`") y remite §6 a las migraciones. Corrige el changelog y los puntos de TASKS.

### F-13 Detalle de implementación y de proceso dentro de la spec - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-10), `egm-inventive-catalyst` (parte de inventive_catalyst-1-14)
* **Affected Scope:** L3, L113, L192, L235, RN-PAG y E16-E18, RF-VEN-05
* **Discrepancy Description:** Hay referencias a tareas y hallazgos (T-M1-15, H-08), a migraciones (0001, 0011, 0017), a funciones (`pv_transicion_valida`, `precio_para`), a nombres de columnas y vistas, y a códigos de error (`E_SOBREPAGO`, `E_ESTADO`, `DATOS_INVALIDOS`). La spec describe el "qué", y esto es "cómo".
* **Rationale & Recommendation:** Mueve códigos y nombres a PLAN §4.3 y deja el comportamiento observable.

### F-14 Requisitos ambiguos o no verificables - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-11), `egm-inventive-catalyst` (inventive_catalyst-1-13, 1-16)
* **Affected Scope:** L155 (RF-DSH-02), L153, L191, L109, L122, L126, L98, L169, L313-314, L321
* **Discrepancy Description:**
  - RF-DSH-02: "semana" sin inicio ni zona, margen % sin denominador, "ticket promedio" y "faltantes" sin fórmula, y "ganancia" difiere de RN-COS-03.
  - RF-COM-02 dice que la OC queda `pedida` y E1 dice `recibida`.
  - "Nombre muy similar" sin umbral (DECISIONS dice trigramas ≥ 0,5). "≤ 6 toques principales" sin definir.
  - "~300 KB" y "~150 KB" no son verificables en una prueba. RNF-PERF-01 exige 5.000 registros con virtualización para 2 socios.
* **Rationale & Recommendation:** Define semana lunes-domingo en `America/Bogota` y margen % = ganancia / ventas netas sin envío, con un ejemplo en E10. Indica que `pedida` es transitorio. Pon los umbrales o quítalos, y baja PERF-01 a un volumen realista.

### F-15 Colisión RF-VEN-02 / RN-PRE-02 y duplicados menores - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst` (inventive_catalyst-1-12, 1-14), `egm-zoom-out` (parte de zoom_out-1-11 y 1-12)
* **Affected Scope:** L110, L196, L111, L109, L143, L146-147, L219-222, L66, L177
* **Discrepancy Description:**
  - RF-VEN-02 dice que el usuario aplica `descuento_pct` y RN-PRE-02 dice que el precio del cliente se ignora. No se dice qué precio recibe un ítem agregado al editar un pedido.
  - RF-VEN-03 es redundante con "descuento ≤ subtotal". RF-PAG-06 repite RN-PAG-06(c), y RN-PAG-07 repite RF-SYN-05. RF-OPS-04 repite RNF-REL-01/02.
  - `origen` y `referencia_origen` no tienen sentido tras D-006. D6 omite `recoge`.
  - `remision` y `factura_interna` son el mismo documento con otro prefijo y no se explica la diferencia.
* **Rationale & Recommendation:** Fija que el servidor recalcula `precio_unitario = precio_lista × (1 − pct)` y que un ítem nuevo toma el precio vigente. Elimina los duplicados, quita `origen` o déjalo como texto libre, y fusiona `factura_interna` en `remision` hasta que la DIAN lo exija.

### F-16 Supuestos y preguntas ya resueltos - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-9, 1-12), `egm-inventive-catalyst` (inventive_catalyst-1-15)
* **Affected Scope:** L74-78 (S1-S5), L90, L99 (RF-TER-05), L221, L62
* **Discrepancy Description:**
  - S2 define "deducciones", que ya no existe tras D-008. S5 ("pull automático por confirmar") ya es RF-SYN-08. El encabezado dice "listo para implementación" con S1 y S4 abiertos.
  - RN-PAG-06 cita la pregunta abierta P-008, que el addendum de DECISIONS cerró.
  - RF-TER-05 menciona una excepción de "clientes anónimos de mostrador, no contemplados".
  - RF-AUTH-02 dice que "nunca" cierra sesión y "opera sin conexión", pero el primer arranque exige conexión (PLAN §9).
* **Rationale & Recommendation:** Borra S2, S5 y la excepción de RF-TER-05, actualiza S1, S4 y P-003, y añade "el primer arranque exige conexión" en RF-AUTH-02.

### F-17 Orden roto de secciones y escenarios - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (zoom_out-1-12), `egm-inventive-catalyst` (parte de inventive_catalyst-1-15)
* **Affected Scope:** §13 (L8 antes de L5), E16-E18 antes de E12-E15
* **Discrepancy Description:** Las limitaciones de §13 y los escenarios tienen el orden alterado.
* **Rationale & Recommendation:** Reordena.
