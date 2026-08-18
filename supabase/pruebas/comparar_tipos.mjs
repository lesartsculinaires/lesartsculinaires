/**
 * ¿La lista de tipos de archivo dice lo mismo en los dos lados?
 *
 *     node supabase/pruebas/comparar_tipos.mjs
 *
 * Los tipos permitidos están escritos dos veces a la fuerza: en
 * `src/lib/adjuntos.ts`, que es lo que revisa el navegador antes de subir, y
 * en la migración, que es lo que hace cumplir el balde de Supabase. No hay
 * forma de que un archivo de TypeScript configure un balde, así que la única
 * defensa contra que se separen es compararlas.
 *
 * Y separarse es feo: si el navegador acepta un tipo que el balde no, el
 * archivo se elige bien, se ve el «Subiendo…», y falla recién al llegar
 * arriba. Al revés es sólo un tipo que nadie puede usar aunque esté permitido.
 */

import { readFileSync } from "node:fs";

const TS = "src/lib/adjuntos.ts";
const SQL = "supabase/migrations/20260818120000_adjuntos.sql";

/** Los `'text/plain'` que hay entre `array[` y su `]`. */
function delSql(texto) {
  const desde = texto.indexOf("allowed_mime_types");
  const abre = texto.indexOf("array[", desde);
  const cierra = texto.indexOf("]", abre);
  if (desde === -1 || abre === -1 || cierra === -1) return null;
  return [...texto.slice(abre, cierra).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Los `"text/plain"` de la constante TIPOS. */
function delTs(texto) {
  const abre = texto.indexOf("export const TIPOS");
  const cierra = texto.indexOf("];", abre);
  if (abre === -1 || cierra === -1) return null;
  return [...texto.slice(abre, cierra).matchAll(/"([^"]+\/[^"]+)"/g)].map((m) => m[1]);
}

const enTs = delTs(readFileSync(TS, "utf8"));
const enSql = delSql(readFileSync(SQL, "utf8"));

if (!enTs || !enSql) {
  console.error(
    "No se pudo leer alguna de las dos listas. ¿Cambió la forma del archivo?\n" +
      `  ${TS}: ${enTs ? `${enTs.length} tipos` : "no encontrada"}\n` +
      `  ${SQL}: ${enSql ? `${enSql.length} tipos` : "no encontrada"}`,
  );
  process.exit(2);
}

const soloEnTs = enTs.filter((t) => !enSql.includes(t));
const soloEnSql = enSql.filter((t) => !enTs.includes(t));

if (soloEnTs.length === 0 && soloEnSql.length === 0) {
  console.log(`Las dos listas coinciden: ${enTs.length} tipos permitidos.`);
  process.exit(0);
}

if (soloEnTs.length > 0) {
  console.error(
    "La pantalla los acepta pero el balde los va a rechazar al subir:\n  " +
      soloEnTs.join("\n  "),
  );
}
if (soloEnSql.length > 0) {
  console.error(
    "El balde los permite pero la pantalla no deja ni elegirlos:\n  " +
      soloEnSql.join("\n  "),
  );
}
process.exit(1);
