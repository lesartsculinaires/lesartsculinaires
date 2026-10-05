/**
 * Ponerle un techo al tiempo de una promesa.
 *
 * ============================================================================
 * POR QUÉ NO ALCANZA CON EL PLAZO DE CADA `fetch`
 * ============================================================================
 *
 * Es el error que ya se cometió una vez, y vale la pena dejarlo escrito porque
 * desde afuera las dos cosas parecen la misma.
 *
 * `AbortSignal.timeout()` acota UNA llamada. Pero las librerías reintentan por
 * su cuenta: `supabase.auth.getUser()`, cuando el token toca renovarse, llama
 * por dentro a `_refreshAccessToken`, que reintenta con espera creciente —200
 * ms, 400, 800…— mientras quepa en su propio presupuesto de TREINTA SEGUNDOS, y
 * un `fetch` abortado le parece justo de los errores que conviene reintentar.
 *
 * O sea que acotar cada intento no acota nada: con Supabase frío la cuenta era
 * 3 s de corte, espera, 3 s, espera… hasta los treinta. Medido en el banco:
 * 36,2 segundos para contestar una redirección, y Netlify cortando mucho antes
 * con una pantalla que no habla de Supabase.
 *
 * Esto acota la OPERACIÓN. Los plazos de cada intento siguen haciendo falta
 * —liberan la conexión— pero quien decide cuándo basta es éste.
 *
 * ============================================================================
 * LO QUE PIERDE LA CARRERA SIGUE CORRIENDO
 * ============================================================================
 *
 * No se puede cancelar una promesa ajena, así que el trabajo descartado termina
 * cuando termine. Por eso `trabajo` TIENE que ser una promesa que nunca
 * rechaza: un rechazo sin nadie que lo escuche tumba la función entera, que es
 * exactamente lo que esto viene a evitar.
 */

/** Marca de «se acabó el tiempo», que no puede confundirse con un resultado. */
export const SE_PASO = Symbol("se pasó el tiempo");

export async function conTope<T>(
  trabajo: Promise<T>,
  ms: number,
): Promise<T | typeof SE_PASO> {
  let avisar: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<typeof SE_PASO>((listo) => {
    avisar = setTimeout(() => listo(SE_PASO), ms);
  });

  try {
    return await Promise.race([trabajo, reloj]);
  } finally {
    clearTimeout(avisar);
  }
}
