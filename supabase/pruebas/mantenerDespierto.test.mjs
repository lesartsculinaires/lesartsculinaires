/**
 * El ping que mantiene despierto a Supabase.
 *
 *     node --test supabase/pruebas/mantenerDespierto.test.mjs
 *
 * ============================================================================
 * QUÉ SE VIGILA
 * ============================================================================
 *
 * Esto corre solo, cada cinco minutos, sin nadie mirando. Un ping roto no avisa
 * —contesta 200 igual, a propósito— así que lo que tiene que estar bien es lo
 * que nadie va a ir a comprobar a mano:
 *
 *   QUE TOQUE LAS DOS PUERTAS   Auth y PostgREST se enfrían por separado. Lo
 *                               medido: 11,3 s en una y 15,9 s en la otra, en la
 *                               misma tanda. Tocar una sola deja la otra
 *                               dormida, y la sesión pasa por auth antes de que
 *                               ninguna consulta llegue a PostgREST.
 *
 *   QUE NO SE CAIGA NUNCA       Si Supabase no contesta, el ping tiene que
 *                               anotarlo y seguir. Una excepción que sube deja
 *                               la función marcada como rota y Netlify la
 *                               reintenta en cadena.
 *
 *   QUE NO USE LA LLAVE BUENA   Despertar no es leer nada. La llave de servicio
 *                               acá sería guardar un riesgo a cambio de nada.
 */
const { pingear, tocar, PUERTAS } = await import(
  "../../netlify/functions/mantener-despierto.mjs"
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un `fetch` de mentira que anota a dónde lo llamaron y con qué. */
const falso = (responder) => {
  const visto = [];
  const impl = async (url, opciones) => {
    visto.push({ url: String(url), cabeceras: opciones?.cabeceras ?? opciones?.headers ?? {} });
    return responder(String(url));
  };
  return { impl, visto };
};

const ok = () => ({ ok: true, status: 200 });

console.log("── se tocan las dos puertas, no una ──");
{
  const { impl, visto } = falso(ok);
  const r = await pingear("https://proyecto.supabase.co", "llave-publica", impl);

  es("salió bien", r.ok, true);
  es("DOS LLAMADAS, NO UNA", visto.length, 2);
  es(
    "una al servidor de sesiones",
    visto.some((v) => v.url.includes("/auth/v1/")),
    true,
  );
  es(
    "y otra a la base",
    visto.some((v) => v.url.includes("/rest/v1/")),
    true,
  );
  es("las dos declaradas en PUERTAS", PUERTAS.length, 2);
}

console.log("\n── la llave que viaja es la pública ──");
{
  const { impl, visto } = falso(ok);
  await pingear("https://proyecto.supabase.co", "sb_publishable_loquesea", impl);
  const cabeceras = visto.map((v) => v.cabeceras);
  es(
    "va como apikey",
    cabeceras.every((c) => c.apikey === "sb_publishable_loquesea"),
    true,
  );
  /*
   * No hay forma de que una llave de servicio llegue acá sin que alguien la
   * pase a mano: la función lee la pública del entorno. Esto deja escrito que
   * es lo que se espera.
   */
  es(
    "y NINGUNA cabecera trae una llave de servicio",
    JSON.stringify(cabeceras).includes("service_role"),
    false,
  );
}

console.log("\n── si una puerta no contesta, se anota y se sigue ──");
{
  const { impl } = falso((url) => {
    if (url.includes("/rest/v1/")) throw new Error("ECONNREFUSED");
    return ok();
  });
  const r = await pingear("https://proyecto.supabase.co", "llave", impl);

  es("el ping NO lanza", typeof r, "object");
  es("y dice que algo falló", r.ok, false);
  es("la que sí contestó queda en verde", r.puertas.find((p) => p.puerta === "auth")?.ok, true);
  es("la que no, en rojo", r.puertas.find((p) => p.puerta === "rest")?.ok, false);
  es(
    "con el motivo anotado",
    /ECONNREFUSED/.test(r.puertas.find((p) => p.puerta === "rest")?.error ?? ""),
    true,
  );
}

console.log("\n── un 500 de Supabase tampoco lo tumba ──");
{
  const { impl } = falso(() => ({ ok: false, status: 503 }));
  const r = await pingear("https://proyecto.supabase.co", "llave", impl);
  es("no lanza", r.ok, false);
  es("y guarda el código", r.puertas[0].estado, 503);
}

console.log("\n── sin configurar, no inventa una llamada ──");
{
  const { impl, visto } = falso(ok);
  const r = await pingear("", "", impl);
  es("dice qué falta", /NEXT_PUBLIC_SUPABASE_URL/.test(r.motivo ?? ""), true);
  es("Y NO LLAMA A NINGÚN LADO", visto.length, 0);
}

console.log("\n── siempre devuelve cuánto tardó ──");
{
  /*
   * Es lo único que convierte «el CRM abrió lento» en un dato: si los pings
   * vienen en 300 ms y uno salió en 12.000, ese es el momento en que estuvo
   * dormido, anotado con su hora en el registro de Netlify.
   */
  const { impl } = falso(ok);
  const r = await tocar("https://proyecto.supabase.co", "llave", PUERTAS[0], impl);
  es("trae los milisegundos", typeof r.ms, "number");
  es("y no son negativos", r.ms >= 0, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
