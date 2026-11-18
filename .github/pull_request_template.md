<!-- Un solo PR por release (D-017): de `release/<hito>` a `main`. No se abre PR por tarea. -->

## Release

- Hito: H?
- Rama: `release/h?`

## Tareas incluidas

<!-- Una línea por tarea integrada: `T-M?-??` · CAM-n · resumen · IDs que cierra (RF-, RN-, E?) -->

-

## Estado de las pruebas

- [ ] `npm run test:db` en verde
- [ ] `npm run test:integration` en verde (si hubo cambios de base de datos; requiere Supabase local)
- [ ] App web: `npm test`, `typecheck`, `lint` y `build` en verde (dentro de Docker)
- [ ] CI verde en esta rama

## Lista de verificación (definición de hecho)

- [ ] Cada tarea escribió su prueba primero y la vio fallar (excepciones anotadas abajo)
- [ ] Cada prueba nueva cita el ID que cubre (`[RN-INV-03]`, `[E5]`)
- [ ] UI probada en 360 px, con estados vacío, cargando y error
- [ ] Sin secretos en el repo
- [ ] Si cambió un contrato o el esquema, se actualizó `docs/spec/PLAN.md`
- [ ] Si cambió una regla de negocio, se actualizó `SPEC.md` y se anotó en `docs/DECISIONS.md`
- [ ] `TASKS.md` actualizado; los issues pasan a *Done* al fusionar

## Verificación manual pendiente

<!-- Lo que solo se comprueba en navegador o dispositivo real -->

## Excepciones y decisiones a revisar

<!-- Tareas sin rojo primero, valores por defecto tomados, etc. -->
