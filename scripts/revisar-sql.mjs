/**
 * ¿Algún .sql usa comandos de psql, que en Supabase no existen?
 *
 *     node scripts/revisar-sql.mjs
 *
 * Estos archivos se pegan en el editor de SQL de Supabase, que corre SQL y
 * nada más. Los comandos que empiezan con barra invertida —«\set», «\echo»,
 * «\i», «\gset»— son de psql, el cliente de línea de comandos, y el editor ni
 * siquiera llega a ejecutarlos: se planta en la primera con un
 * «syntax error at or near "\"» que no dice de dónde salió el problema.
 *
 * Esto pasó de verdad, y pasó por una trampa que vale la pena nombrar: acá se
 * prueban los archivos con psql, que sí los acepta. O sea que el archivo
 * andaba perfecto de este lado y fallaba del otro, que es la peor forma de
 * fallar. Esta revisión cierra esa diferencia sin depender de acordarse.
 *
 * Se salta lo que está adentro de comillas o de un bloque `$$ ... $$`: una
 * barra invertida en el texto de un mensaje o en una expresión regular
 * —`regexp_replace(t, '\D', '')`— es perfectamente válida.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Las carpetas cuyos .sql termina corriendo una persona en Supabase. */
const CARPETAS = ["supabase", "supabase/migrations"];

const archivos = [];
for (const carpeta of CARPETAS) {
  let entradas;
  try {
    entradas = readdirSync(carpeta);
  } catch {
    continue;
  }
  for (const nombre of entradas) {
    const ruta = join(carpeta, nombre);
    if (nombre.endsWith(".sql") && statSync(ruta).isFile()) archivos.push(ruta);
  }
}

/**
 * Las líneas que empiezan con una barra invertida, fuera de un bloque.
 *
 * Se mira el arranque de la línea porque así es como psql reconoce sus propios
 * comandos: una barra en cualquier otra posición es texto o expresión regular.
 */
function comandosDePsql(sql) {
  const malas = [];
  let dentroDeBloque = false;

  sql.split("\n").forEach((linea, i) => {
    // `$$` abre y cierra el cuerpo de una función o de un `do`. Adentro puede
    // haber lo que sea, incluida una barra invertida al principio de línea.
    const marcas = (linea.match(/\$\$/g) ?? []).length;
    if (marcas % 2 === 1) dentroDeBloque = !dentroDeBloque;
    if (dentroDeBloque) return;

    if (/^\s*\\/.test(linea)) malas.push({ n: i + 1, texto: linea.trim() });
  });

  return malas;
}

let fallas = 0;
for (const ruta of archivos) {
  const malas = comandosDePsql(readFileSync(ruta, "utf8"));
  if (malas.length === 0) continue;
  fallas += malas.length;
  console.log(`\n${ruta}`);
  for (const m of malas) console.log(`  línea ${m.n}: ${m.texto}`);
}

if (fallas > 0) {
  console.log(
    `\n${fallas} línea(s) con comandos de psql. En el editor de Supabase esto falla con` +
      '\n«syntax error at or near "\\"». Reescribilo en SQL: lo que se decide, adentro de un' +
      "\nbloque `do $$ ... $$`; lo que se muestra, en la consulta del final.",
  );
  process.exit(1);
}

console.log(`Ningún .sql usa comandos de psql (${archivos.length} archivos revisados).`);
