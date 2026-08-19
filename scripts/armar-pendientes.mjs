/**
 * Arma un solo archivo con varias migraciones, para pegarlo de una vez en el
 * editor SQL de Supabase.
 *
 * Se genera y no se escribe a mano por una razón concreta: si se copiaran los
 * archivos a mano, el combinado y los originales se separarían en el primer
 * arreglo que se le haga a uno de los dos, y nadie se enteraría hasta que
 * alguien corriera el equivocado.
 *
 * Las migraciones traen su propio `begin`/`commit`. Acá se les quitan y se
 * envuelve todo en una sola transacción: así el paste entra entero o no entra
 * nada, y no queda la duda de cuáles alcanzaron a aplicarse.
 *
 *   node scripts/armar-pendientes.mjs <archivo…> > salida.sql
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const archivos = process.argv.slice(2);

if (archivos.length === 0) {
  console.error("Uso: node scripts/armar-pendientes.mjs supabase/migrations/*.sql");
  process.exit(1);
}

/** Le saca el `begin;` de arriba y el `commit;` de abajo. */
function sinTransaccion(sql, nombre) {
  const lineas = sql.split("\n");

  const primera = lineas.findIndex((l) => l.trim() !== "");
  if (lineas[primera]?.trim() !== "begin;") {
    throw new Error(`${nombre}: se esperaba que arrancara con «begin;»`);
  }
  lineas.splice(primera, 1);

  let ultima = lineas.length - 1;
  while (ultima >= 0 && lineas[ultima].trim() === "") ultima--;
  if (lineas[ultima]?.trim() !== "commit;") {
    throw new Error(`${nombre}: se esperaba que terminara con «commit;»`);
  }
  lineas.splice(ultima, 1);

  return lineas.join("\n").trim();
}

const partes = archivos.map((ruta) => {
  const nombre = basename(ruta);
  return { nombre, sql: sinTransaccion(readFileSync(ruta, "utf8"), nombre) };
});

const regla = "-".repeat(74);

const salida = [
  `-- Migraciones pendientes de Les Arts Culinaires, todas juntas.`,
  `--`,
  `-- Generado por scripts/armar-pendientes.mjs. No editar a mano: los`,
  `-- originales están en supabase/migrations/ y este archivo sale de ellos.`,
  `--`,
  `-- Va todo en una sola transacción: si algo falla no queda nada a medias.`,
  `-- Las cinco se pueden correr dos veces sin romper nada, así que si hay que`,
  `-- arreglar algo y volver a pegarlo, se puede.`,
  `--`,
  `-- Contiene, en orden:`,
  ...partes.map((p, i) => `--   ${i + 1}. ${p.nombre}`),
  ``,
  `begin;`,
  ``,
  ...partes.flatMap((p) => [
    `-- ${regla}`,
    `-- ${p.nombre}`,
    `-- ${regla}`,
    ``,
    p.sql,
    ``,
  ]),
  `commit;`,
  ``,
].join("\n");

process.stdout.write(salida);
