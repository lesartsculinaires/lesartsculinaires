/**
 * Mantener despierto a Supabase.
 *
 * ============================================================================
 * QUÉ PROBLEMA RESUELVE
 * ============================================================================
 *
 * El proyecto de Supabase se enfría cuando pasa un rato sin uso. Medido contra
 * el de la escuela el 5 de octubre de 2026: dos intentos que ni conectaron, y
 * después 11,3 s en `/auth/v1/settings` y 15,9 s en `/rest`. En caliente, 230
 * ms. O sea un pozo de diez o quince segundos para el primero que entra después
 * de un rato —y el CRM tiene gente entrando a las siete de la mañana—.
 *
 * El código ya aprendió a no morirse esperando: el middleware y el cliente del
 * servidor tienen topes, así que un Supabase frío devuelve una pantalla honesta
 * en vez de un error de Netlify. Pero eso hace que el CRM FALLE BIEN, no que
 * ande rápido. Esto es lo otro: que no se enfríe.
 *
 * ============================================================================
 * POR QUÉ TIENE QUE SER DE AFUERA
 * ============================================================================
 *
 * Lo natural sería programarlo dentro de la base —`pg_cron`— y no se puede: si
 * el cómputo está dormido, `pg_cron` también lo está. Nada que viva adentro
 * puede despertar a quien lo aloja. Tiene que llamar alguien de afuera, y
 * Netlify ya está ahí.
 *
 * ============================================================================
 * SE TOCAN LAS DOS PUERTAS, NO UNA
 * ============================================================================
 *
 * Porque son dos servicios distintos y se enfrían por separado. Lo medido:
 * `/auth/v1/settings` tardó 11,3 s y `/rest` 15,9 s en la misma tanda. Tocar
 * sólo una dejaría la otra dormida, y la sesión pasa por auth antes de que
 * ninguna consulta llegue a PostgREST.
 *
 * La llave que se usa es la PÚBLICA, la misma que ya viaja al navegador. No
 * hace falta más: despertar no es leer nada, y meter acá la llave de servicio
 * sería guardar un riesgo a cambio de nada.
 *
 * ============================================================================
 * NUNCA FALLA RUIDOSAMENTE, PERO SÍ LO DEJA ESCRITO
 * ============================================================================
 *
 * Contesta 200 aunque el ping salga mal, para que Netlify no lo reintente en
 * cadena ni lo marque como roto cada vez que Supabase tosa. Lo que pasó queda
 * en el registro con los milisegundos, que es donde uno mira cuando alguien
 * dice «el CRM tardó un montón en abrir». Un ping que tarda 12 segundos es la
 * prueba de que ESTABA dormido: si eso empieza a aparecer seguido, el período
 * de abajo se quedó corto.
 */

/** Cuánto se le da a cada llamada. Despertar tarda; el pozo medido fue de 16 s. */
const ESPERA_MS = 20_000;

const limpiar = (v) => (v ?? "").trim().replace(/\/+$/, "");

/**
 * Los proyectos de Supabase que hay que mantener despiertos.
 *
 * El sitio de una marca tiene uno solo, con los nombres de siempre. El CRM
 * unificado (crm-peñagroup, 18/11/2026) tiene dos —el de LAC y el de HC— con
 * el nombre de la marca en el medio, y con los nombres de siempre vacíos: por
 * eso acá avisaba que «faltaba» la dirección de Supabase. Se despiertan los
 * dos, porque cualquiera de las marcas puede ser la primera en abrirse.
 */
export function proyectos(entorno = process.env) {
  const lista = [];
  const uno = (marca, url, llave) => {
    const base = limpiar(url);
    const clave = (llave ?? "").trim();
    if (base && clave) lista.push({ marca, base, llave: clave });
  };
  uno(null, entorno.NEXT_PUBLIC_SUPABASE_URL, entorno.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  uno("lac", entorno.NEXT_PUBLIC_LAC_SUPABASE_URL, entorno.NEXT_PUBLIC_LAC_SUPABASE_ANON_KEY);
  uno("hc", entorno.NEXT_PUBLIC_HC_SUPABASE_URL, entorno.NEXT_PUBLIC_HC_SUPABASE_ANON_KEY);
  return lista;
}

/**
 * Las dos puertas que hay que tocar.
 *
 * `canales` es un catálogo chico y la consulta pide una sola fila: alcanza para
 * que Postgres levante y no mueve nada. Si la política de filas no la deja
 * pasar, da cero filas y sirve igual —lo que despierta es haber ejecutado la
 * consulta, no lo que devuelva—.
 */
export const PUERTAS = [
  { nombre: "auth", camino: "/auth/v1/settings" },
  { nombre: "rest", camino: "/rest/v1/canales?select=id&limit=1" },
];

/** Llama una puerta y cuenta qué pasó. Nunca lanza. */
export async function tocar(base, llave, puerta, fetchImpl = fetch) {
  const arranque = Date.now();
  try {
    const r = await fetchImpl(`${base}${puerta.camino}`, {
      headers: { apikey: llave, authorization: `Bearer ${llave}` },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    return { puerta: puerta.nombre, ok: r.ok, estado: r.status, ms: Date.now() - arranque };
  } catch (e) {
    return {
      puerta: puerta.nombre,
      ok: false,
      estado: 0,
      ms: Date.now() - arranque,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * El ping entero.
 *
 * Las dos puertas en paralelo: son servicios distintos y esperar a una para
 * empezar la otra duplicaría el tiempo del caso que importa, que es justamente
 * el lento.
 */
export async function pingear(base, llave, fetchImpl = fetch) {
  if (!base || !llave) {
    return {
      ok: false,
      motivo:
        "falta la dirección o la llave pública de Supabase (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY, " +
        "o en el CRM unificado NEXT_PUBLIC_LAC_… / NEXT_PUBLIC_HC_…)",
      puertas: [],
    };
  }

  const puertas = await Promise.all(PUERTAS.map((p) => tocar(base, llave, p, fetchImpl)));
  return { ok: puertas.every((p) => p.ok), puertas };
}

export default async function handler() {
  const lista = proyectos();
  const hechos = lista.length
    ? await Promise.all(lista.map(async (p) => ({ marca: p.marca, ...(await pingear(p.base, p.llave)) })))
    : [{ marca: null, ...(await pingear("", "")) }];

  /*
   * Los milisegundos van SIEMPRE al registro, salga bien o mal.
   *
   * Es lo único que convierte «el CRM abrió lento» en un dato: si los pings
   * vienen en 300 ms y uno salió en 12.000, ese es el momento en que estuvo
   * dormido, y está anotado con su hora.
   */
  const ok = hechos.every((h) => h.ok);

  // Una sola línea por ejecución, con las dos marcas: Netlify guardaba sólo
  // una de las dos cuando salían por separado en el mismo instante.
  const linea = hechos
    .map((hecho) => {
      const quien = hecho.marca ? `${hecho.marca} ` : "";
      const resumen = hecho.puertas.map((p) => `${p.puerta}=${p.estado}/${p.ms}ms`).join(" ");
      return hecho.ok ? `${quien}${resumen}` : `${quien}algo no contestó: ${hecho.motivo ?? resumen}`;
    })
    .join(" · ");
  if (ok) {
    console.log(`[despierto] ${linea}`);
  } else {
    console.warn(`[despierto] ${linea}`);
  }

  return new Response(JSON.stringify(hechos.length === 1 ? hechos[0] : { ok, proyectos: hechos }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
