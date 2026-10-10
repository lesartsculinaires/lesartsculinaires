import { compilar } from "./compilar.mjs";
/**
 * Traer una tabla entera sin encadenar una tanda detrás de otra.
 *
 *     node supabase/pruebas/paginarEnParalelo.test.mjs
 *
 * Lo de siempre —que trae todas, sin el techo de mil— lo cuida
 * `paginar.test.mjs`. Esto es lo que se agregó encima: el orden en que salen.
 *
 * ============================================================================
 * POR QUÉ IMPORTA EL ORDEN EN QUE SALEN LAS TANDAS
 * ============================================================================
 *
 * El 10 de octubre de 2026, entre las 10:32 y las 10:42, la base tardaba de
 * tres a siete segundos por consulta. La portada pedía el embudo (tres tandas),
 * los programas (dos), las etiquetas (una) y el último toque (tres), CADA UNA
 * ESPERANDO A LA ANTERIOR: nueve viajes en fila. Pasaban los sesenta segundos en
 * que Netlify corta la respuesta, y un refresco cortado a la mitad es la
 * pantalla blanca de «Application error».
 *
 * Esto comprueba que las tandas que faltan salen JUNTAS en cuanto se sabe el
 * total, y que nada de lo que `traerTodo` ya garantizaba se perdió: que trae
 * todo, en orden, y que un error no se disfraza de tabla corta.
 */

const { traerTodo, POR_TANDA } = await compilar("src/lib/supabase/paginar.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/**
 * Una tabla de mentira que se comporta como supabase-js: `armar(conTotal)` da
 * una consulta y `range` la ejecuta. Cada pedido tarda `ms` y se anota cuándo
 * empezó y cuándo terminó, que es lo que permite ver si iban en fila.
 */
function tabla(filas, { ms = 30, falla = null, creceA = null } = {}) {
  const log = [];
  let reloj = 0;
  const t0 = Date.now();
  const armar = (conTotal) => ({
    range(desde, hasta) {
      const empieza = Date.now() - t0;
      const n = ++reloj;
      return new Promise((listo) =>
        setTimeout(() => {
          log.push({ n, desde, conTotal, empieza, termina: Date.now() - t0 });
          if (falla === desde) return listo({ data: null, error: { message: "se cayó la tanda" } });
          // Las filas que entraron después de contar: el total ya no las incluye.
          const hay = creceA != null && !conTotal ? creceA : filas;
          const datos = Array.from({ length: Math.max(0, Math.min(hasta, hay - 1) - desde + 1) }, (_, i) => desde + i);
          listo({ data: datos, error: null, count: conTotal ? filas : null });
        }, ms),
      );
    },
  });
  return { armar, log };
}

const enFila = (log) => log.every((p, i) => i === 0 || p.empieza >= log[i - 1].termina);

console.log("── 1. CON EL TOTAL, LAS TANDAS QUE FALTAN SALEN JUNTAS ──");
{
  const { armar, log } = tabla(2592);
  const r = await traerTodo(armar);
  es("trae las 2592", r.data.length, 2592);
  es("en orden", r.data.every((x, i) => x === i), true);
  es("sin error", r.error, null);
  es("tres pedidos", log.length, 3);
  es("sólo el primero pide el total", log.map((p) => p.conTotal), [true, false, false]);
  const [, b, c] = log.sort((x, y) => x.desde - y.desde);
  es("LA SEGUNDA Y LA TERCERA EMPEZARON JUNTAS", Math.abs(b.empieza - c.empieza) < 15, true);
  es("y no esperaron una a la otra", c.empieza < b.termina, true);
}

console.log("\n── 2. SIN EL TOTAL, COMO ANTES: DE A UNA ──");
{
  const { armar, log } = tabla(2592);
  const sinTotal = () => armar(false); // quien no pide el total
  const r = await traerTodo(sinTotal);
  es("trae las 2592", r.data.length, 2592);
  es("en orden", r.data.every((x, i) => x === i), true);
  es("tres pedidos", log.length, 3);
  es("en fila", enFila(log), true);
}

console.log("\n── 3. SI ENTRARON FILAS ENTRE EL CONTEO Y LAS TANDAS, NO SE PIERDEN ──");
{
  // Contó 1800 (dos tandas justas) pero cuando salieron las demás ya había 1900.
  const { armar, log } = tabla(1800, { creceA: 1900 });
  const r = await traerTodo(armar);
  es("trae las 1900", r.data.length, 1900);
  es("sin repetir ni saltear", r.data.every((x, i) => x === i), true);
  es("pidió una más de las contadas", log.length, 3);
}

console.log("\n── 4. UN ERROR EN UNA TANDA NO SE DISFRAZA DE TABLA CORTA ──");
{
  const { armar } = tabla(2592, { falla: POR_TANDA * 2 });
  const r = await traerTodo(armar);
  es("sin datos", r.data.length, 0);
  es("con el error", r.error, "se cayó la tanda");
}
{
  const { armar } = tabla(2592, { falla: 0 });
  const r = await traerTodo(armar);
  es("también si falla la primera", [r.data.length, r.error], [0, "se cayó la tanda"]);
}

console.log("\n── 5. LO CHICO SIGUE COSTANDO UN SOLO VIAJE ──");
{
  const { armar, log } = tabla(10);
  const r = await traerTodo(armar);
  es("trae las 10", r.data.length, 10);
  es("un pedido", log.length, 1);
}
{
  const { armar, log } = tabla(POR_TANDA);
  const r = await traerTodo(armar);
  es("justo una tanda llena: trae todas", r.data.length, POR_TANDA);
  es("y confirma con una vacía", log.length, 2);
}

console.log("\n── 6. EL TOPE DE TANDAS SIGUE AVISANDO, AUNQUE SE SEPA EL TOTAL ──");
{
  const { armar } = tabla(POR_TANDA * 80, { ms: 1 });
  const r = await traerTodo(armar);
  es("trae lo que puede", r.data.length, POR_TANDA * 50);
  es("Y AVISA QUE PUEDE HABER MÁS", /puede haber más/.test(r.error ?? ""), true);
}

console.log("\n── 7. EL TIEMPO: LA LISTA MÁS LARGA CUESTA DOS VIAJES, NO TRES ──");
{
  const MS = 80;
  const t0 = Date.now();
  await Promise.all([2592, 1700, 300, 2592].map((n) => traerTodo(tabla(n, { ms: MS }).armar)));
  const tarda = Date.now() - t0;
  console.log(`   las cuatro listas del embudo, a ${MS} ms por consulta: ${tarda} ms`);
  // Antes: la lista de tres tandas tardaba tres viajes (240 ms). Ahora, dos.
  es("tarda como dos viajes, no como tres", tarda < MS * 2.6, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
