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

/** Traduce un fallo de conexión a la base local en una instrucción. Otros errores se relanzan. */
export function explicarFalloConexion(e) {
  if (e?.code === 'ECONNREFUSED' || e?.code === 'ENOTFOUND') {
    console.error('No se pudo conectar a la base de datos. ¿Está levantado Supabase local?');
    console.error('Abre Docker Desktop y corre:  npm run db:start');
    process.exit(2);
  }
  throw e;
}
