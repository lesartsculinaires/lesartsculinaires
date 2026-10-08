import { compilar } from "./compilar.mjs";
/**
 * Cuánto se espera antes de mandarle a Meta por dónde hablar.
 *
 *     node supabase/pruebas/esperarCandidatos.test.mjs
 *
 * ============================================================================
 * LOS DOS SEGUNDOS QUE SE PAGABAN SIEMPRE
 * ============================================================================
 *
 * Con Meta el SDP se manda UNA vez, dentro de la orden de contestar: lo que no
 * esté ahí no llega nunca. Por eso hay que juntar los caminos antes de mandar.
 *
 * Pero se esperaba a que el navegador terminara DEL TODO, o dos segundos. Y
 * terminar del todo tarda porque sigue preguntando por caminos de más mucho
 * después de que llegó el que importa. O sea que casi siempre se pagaba el tope
 * entero con el SDP ya listo —dos segundos de una llamada que suena veintiséis,
 * como la que se perdió el 8 de octubre de 2026—.
 *
 * ============================================================================
 * LAS DOS MITADES, Y POR QUÉ NINGUNA SIRVE SOLA
 * ============================================================================
 *
 *   QUE CORTE ANTES   En cuanto llega un camino que sirve para salir, más un
 *                     respiro corto. Si no, este cambio no existe.
 *
 *   PERO NO DEMASIADO Los primeros que aparecen son los `host` —la IP de la
 *   ANTES             máquina en la oficina— y con ésos solos la llamada se
 *                     conecta y NO SE OYE NADA: desde fuera de la red no hay
 *                     forma de llegar. Cortar ahí cambiaría dos segundos por
 *                     llamadas mudas, que es muchísimo peor que esperar.
 */
const { esperarCandidatos, RESPIRO_MS } = await compilar("src/lib/audioLlamada.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un `RTCPeerConnection` de mentira: sólo lo que la función toca. */
function conexionFalsa(estadoInicial = "gathering") {
  const oyentes = new Map();
  return {
    iceGatheringState: estadoInicial,
    addEventListener(tipo, fn) {
      if (!oyentes.has(tipo)) oyentes.set(tipo, new Set());
      oyentes.get(tipo).add(fn);
    },
    removeEventListener(tipo, fn) {
      oyentes.get(tipo)?.delete(fn);
    },
    /** Cuántos oyentes quedan: sirve para comprobar que se limpian. */
    cuantosOyentes() {
      let n = 0;
      for (const s of oyentes.values()) n += s.size;
      return n;
    },
    /** Llega un camino. `null` es el aviso de que no viene ninguno más. */
    candidato(c) {
      for (const fn of oyentes.get("icecandidate") ?? []) fn({ candidate: c });
    },
    terminar() {
      this.iceGatheringState = "complete";
      for (const fn of oyentes.get("icegatheringstatechange") ?? []) fn();
    },
  };
}

const alSalir = (c) => c.type ?? "(del texto)";
const HOST = { type: "host", candidate: "candidate:1 1 udp 2130706431 192.168.1.5 50000 typ host" };
const SRFLX = { type: "srflx", candidate: "candidate:2 1 udp 1694498815 190.0.0.9 50001 typ srflx" };
const RELAY = { type: "relay", candidate: "candidate:3 1 udp 16777215 5.6.7.8 50002 typ relay" };
void alSalir;

const cronometrar = async (fn) => {
  const t0 = Date.now();
  await fn();
  return Date.now() - t0;
};

console.log("── si ya terminó, no se espera nada ──");
{
  const pc = conexionFalsa("complete");
  const ms = await cronometrar(() => esperarCandidatos(pc, 2000, 50));
  es("vuelve al instante", ms < 40, true);
}

console.log("\n── un camino que SIRVE corta temprano ──");
{
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 3000, 60);
  setTimeout(() => pc.candidato(SRFLX), 20);

  const ms = await cronometrar(() => espera);
  /*
   * Lo que importa: que NO se hayan pagado los 3000 del tope. El respiro de 60
   * se suma a los 20 del candidato, así que ronda los 80.
   */
  es("NO SE ESPERA EL TOPE", ms < 800, true);
  es("pero sí el respiro", ms >= 60, true);
  es("y se limpian los oyentes", pc.cuantosOyentes(), 0);
}

console.log("\n── un `relay` también sirve ──");
{
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 3000, 40);
  setTimeout(() => pc.candidato(RELAY), 10);
  const ms = await cronometrar(() => espera);
  es("corta temprano", ms < 800, true);
}

console.log("\n── PERO UN `host` SOLO NO ALCANZA ──");
{
  /*
   * La mitad que no se puede perder. Con sólo caminos locales la llamada se
   * conecta y no se oye nada desde fuera de la oficina.
   */
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 400, 40);
  setTimeout(() => pc.candidato(HOST), 10);
  setTimeout(() => pc.candidato(HOST), 20);

  const ms = await cronometrar(() => espera);
  es("NO CORTA: se espera el tope", ms >= 380, true);
}

console.log("\n── y el `host` no estorba cuando después llega el bueno ──");
{
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 3000, 50);
  setTimeout(() => pc.candidato(HOST), 10);
  setTimeout(() => pc.candidato(SRFLX), 30);
  const ms = await cronometrar(() => espera);
  es("corta cuando llega el que sirve", ms < 800, true);
}

console.log("\n── el tipo se lee del texto si no viene aparte ──");
{
  /*
   * Según el navegador, el candidato trae `type` o no. Quedarse sólo con la
   * propiedad dejaría de cortar temprano justo en los que no la traen.
   */
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 3000, 40);
  setTimeout(
    () => pc.candidato({ candidate: "candidate:2 1 udp 1694498815 190.0.0.9 50001 typ srflx" }),
    10,
  );
  const ms = await cronometrar(() => espera);
  es("también corta", ms < 800, true);
}

console.log("\n── los finales de siempre siguen funcionando ──");
{
  const pc = conexionFalsa();
  const espera = esperarCandidatos(pc, 3000, 50);
  setTimeout(() => pc.terminar(), 20);
  const ms = await cronometrar(() => espera);
  es("terminar la recolección corta", ms < 800, true);

  // Un candidato nulo es el otro aviso de «no viene ninguno más».
  const pc2 = conexionFalsa();
  const espera2 = esperarCandidatos(pc2, 3000, 50);
  setTimeout(() => pc2.candidato(null), 20);
  const ms2 = await cronometrar(() => espera2);
  es("y el candidato nulo también", ms2 < 800, true);

  // Y sin nada, el tope.
  const pc3 = conexionFalsa();
  const ms3 = await cronometrar(() => esperarCandidatos(pc3, 300, 50));
  es("sin nada, se respeta el tope", ms3 >= 280, true);
  es("y se limpia igual", pc3.cuantosOyentes(), 0);
}

console.log("\n── el respiro por omisión es corto ──");
{
  es("existe y es de décimas", RESPIRO_MS > 0 && RESPIRO_MS <= 500, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
