/**
 * El reloj desfasado: ¿el CRM reintenta, o muestra «JWT issued at future»?
 *
 *     npx esbuild src/lib/supabase/enCastellano.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/castellano.mjs
 *     node supabase/pruebas/reloj-desfasado.test.mjs
 *
 * ============================================================================
 * QUÉ REPORTÓ LA ESCUELA
 * ============================================================================
 *
 * Una barra amarilla arriba del Inbox: «No se pudieron cargar los datos: JWT
 * issued at future», con la cabecera diciendo «0 oportunidades» y la bandeja,
 * abajo, llena de 268 conversaciones.
 *
 * ============================================================================
 * QUÉ ES
 * ============================================================================
 *
 * Cada token que emite Supabase lleva adentro la hora en que se emitió. Quien
 * lo recibe comprueba que no sea futura —un token emitido dentro de un rato
 * sería señal de que alguien lo fabricó—. Pero quien emite y quien comprueba
 * son dos máquinas distintas, y cuando el reloj del que comprueba va un segundo
 * atrasado rechaza un token perfectamente válido.
 *
 * Por eso fallaron las oportunidades y no la bandeja: se cayó la consulta que
 * salió primero. Las demás, un instante después, ya entraron. No era la sesión
 * y no se perdió nada.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 *   REINTENTA Y ENTRA          El desfase se cierra solo con el tiempo, así que
 *                              esperar y volver a pedir es el arreglo.
 *   NO REINTENTA LO DEMÁS      Una sesión vencida o un permiso denegado no se
 *                              arreglan repitiendo: repetirlo sería esconder el
 *                              problema detrás de tres segundos de espera.
 *   NO TOCA LO QUE SALE BIEN   Una respuesta buena no puede pasar por acá y
 *                              salir distinta.
 *   SE DICE EN CASTELLANO      Lo lee una asesora, no quien mantiene la base.
 */
import assert from "node:assert";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/*
 * La copia exacta de `conReintentoDeReloj`, de `lib/supabase/server.ts`.
 *
 * Se copia porque ese archivo lleva `server-only` y arrastra las cookies de
 * Next: importarlo desde acá levantaría medio framework para probar veinte
 * líneas. La contrapartida es que si allá cambia y acá no, esto deja de probar
 * lo que corre de verdad —por eso las dos listas van juntas al principio de
 * los dos archivos y con los mismos nombres—.
 */
const RELOJ_DESFASADO = /issued at future|JWTIssuedAtFuture|not yet valid|nbf/i;
const ESPERAS = [400, 800, 1600];

const hacerFetchConReintento = (fetchDeMentira) =>
  async function conReintentoDeReloj(entrada, opciones) {
    for (let intento = 0; ; intento += 1) {
      const respuesta = await fetchDeMentira(entrada, opciones);
      if (respuesta.ok || respuesta.status < 400 || respuesta.status > 403) {
        return respuesta;
      }
      if (intento >= ESPERAS.length) return respuesta;
      const cuerpo = await respuesta.text();
      if (!RELOJ_DESFASADO.test(cuerpo)) {
        return new Response(cuerpo, {
          status: respuesta.status,
          statusText: respuesta.statusText,
          headers: respuesta.headers,
        });
      }
      // En la prueba no se espera de verdad: interesa cuántas veces reintenta,
      // no cuánto tarda.
    }
  };

const rechazoDeReloj = () =>
  new Response(JSON.stringify({ message: "JWT issued at future" }), { status: 401 });

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL CASO DE LA ESCUELA: FALLA UNA VEZ Y DESPUÉS ENTRA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  let llamadas = 0;
  const fetchDeMentira = async () => {
    llamadas += 1;
    // El desfase dura un instante: el primer pedido se rechaza, el siguiente no.
    return llamadas === 1
      ? rechazoDeReloj()
      : new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
  };

  const r = await hacerFetchConReintento(fetchDeMentira)("http://x");
  es("SALIÓ BIEN, SIN QUE NADIE TOQUE NADA", r.status, 200);
  es("y trae los datos de verdad", await r.json(), [{ id: 1 }]);
  es("hizo falta un reintento y uno solo", llamadas, 2);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. SI EL DESFASE NO SE CIERRA, SE DICE ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Un desfase de más de tres segundos ya no es ruido: es algo roto, y esconderlo
// detrás de reintentos infinitos sería peor que mostrarlo.
{
  let llamadas = 0;
  const fetchDeMentira = async () => {
    llamadas += 1;
    return rechazoDeReloj();
  };

  const r = await hacerFetchConReintento(fetchDeMentira)("http://x");
  es("después de agotar los reintentos, el error pasa", r.status, 401);
  es("y fueron cuatro intentos, no infinitos", llamadas, ESPERAS.length + 1);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. LO QUE NO ES EL RELOJ NO SE REINTENTA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Repetir una sesión vencida no la revive: sólo agrega tres segundos de espera
// antes de decir lo mismo. Y repetir un permiso denegado esconde el problema.
{
  for (const [que, cuerpo, estado] of [
    ["una sesión vencida", { message: "JWT expired" }, 401],
    ["un permiso denegado", { message: "permission denied for table clientes" }, 403],
  ]) {
    let llamadas = 0;
    const fetchDeMentira = async () => {
      llamadas += 1;
      return new Response(JSON.stringify(cuerpo), { status: estado });
    };

    const r = await hacerFetchConReintento(fetchDeMentira)("http://x");
    es(`${que}: no se reintenta`, llamadas, 1);
    es(`${que}: el error llega entero`, await r.json(), cuerpo);
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. LO QUE SALE BIEN NO SE TOCA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Es lo que hace el 99,9% de las veces. Si esto se rompiera, el arreglo sería
// muchísimo peor que el problema.
{
  let llamadas = 0;
  const fetchDeMentira = async () => {
    llamadas += 1;
    return new Response(JSON.stringify([{ id: 7, nombre: "Litzy" }]), { status: 200 });
  };

  const r = await hacerFetchConReintento(fetchDeMentira)("http://x");
  es("una sola llamada", llamadas, 1);
  es("y los datos llegan intactos", await r.json(), [{ id: 7, nombre: "Litzy" }]);

  // Un 404 tampoco se reintenta: está fuera del rango de autorización.
  let otras = 0;
  const noEncontrado = async () => {
    otras += 1;
    return new Response("", { status: 404 });
  };
  await hacerFetchConReintento(noEncontrado)("http://x");
  es("un 404 tampoco se reintenta", otras, 1);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. Y SI LLEGA A LA PANTALLA, SE ENTIENDE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { enCastellano } = await import("/tmp/castellano.mjs");

  const reloj = enCastellano("JWT issued at future");
  es("NO DICE «JWT ISSUED AT FUTURE»", /JWT/i.test(reloj.texto), false);
  es("dice que no se perdió nada", /no se perdió nada/i.test(reloj.texto), true);
  es("y qué hacer", /actualizar/i.test(reloj.texto), true);
  es("y que se puede reintentar", reloj.reintentable, true);

  const vencida = enCastellano("JWT expired");
  es("una sesión vencida dice entrar de nuevo", /volvé a entrar/i.test(vencida.texto), true);
  es("y que reintentar NO sirve", vencida.reintentable, false);

  /*
   * Lo que no se reconoce se devuelve tal cual.
   *
   * Inventarle una explicación amable a un error que no se entiende es peor
   * que el texto en inglés: manda a buscar el problema donde no está.
   */
  es(
    "lo que no se reconoce pasa tal cual",
    enCastellano("algo rarísimo que nadie previó").texto,
    "algo rarísimo que nadie previó",
  );
  es("y sin error no hay aviso", enCastellano(null), null);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
