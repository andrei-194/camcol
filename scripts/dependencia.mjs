// Ayudas de arranque para los scripts que corren en el PC (no en Docker).
// Quien clona el repo no tiene un agente al lado: si falta algo, el mensaje dice qué comando correr.

/** Carga un paquete; si no está instalado, explica cómo instalarlo y sale con código 2. */
export async function requerir(paquete) {
  try {
    return await import(paquete);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(`'${paquete}'`)) {
      console.error(`Falta instalar dependencias del PC (no se encontró «${paquete}»).`);
      console.error('Corre una vez, en la carpeta del proyecto:  npm run setup');
      process.exit(2);
    }
    throw e;
  }
}

/** Host de una URL de conexión, sin usuario ni contraseña. Devuelve '' si no se puede leer. */
export function hostDe(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Traduce un fallo de la base en una instrucción y sale con código 2. Los errores que no reconoce se relanzan.
 * `esLocal` evita recomendar `db:start` o `db:reset` cuando la base es remota; `host` dice cuál falló.
 */
export function explicarFalloConexion(e, { esLocal = true, host = '' } = {}) {
  const donde = host ? ` (${host})` : '';
  const salir = (...lineas) => {
    for (const l of lineas) console.error(l);
    process.exit(2);
  };
  switch (e?.code) {
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
      return esLocal
        ? salir('No se pudo conectar a la base de datos. ¿Está levantado Supabase local?', 'Abre Docker Desktop y corre:  npm run db:start')
        : salir(`No se pudo conectar a la base${donde}. Revisa DATABASE_URL (host y puerto) y tu red.`);
    case '57P03':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return salir(`La base${donde} no respondió o todavía está arrancando.`, 'Espera unos segundos y repite el comando.');
    case '42P01':
      return esLocal
        ? salir(
            'La base está viva pero le faltan tablas (¿se omitió el reset?).',
            'Corre:  npm run db:reset',
            'Ojo: el reset borra usuarios y datos. Después crea tu usuario de nuevo (README, «Crear tu usuario») y repite:  npm run db:catalogo',
          )
        : salir(`A la base${donde} le faltan tablas: aplica primero las migraciones de supabase/migrations.`);
    default:
      throw e;
  }
}
