/**
 * ¿Algún archivo «use server» exporta algo que no sea una función asíncrona?
 *
 *     node scripts/revisar-use-server.mjs
 *
 * Next reemplaza las exportaciones de esos archivos por referencias al
 * servidor. Con una función eso es justo lo que se quiere; con cualquier otra
 * cosa —una constante, un arreglo— lo que llega al navegador deja de ser lo
 * que era, y el error aparece al usarlo: «i.map is not a function» al abrir
 * una pantalla, con el rastro apuntando a código compilado que no se parece a
 * nada del repositorio.
 *
 * Existe porque el compilador no siempre lo ve. Una vez el build falló y lo
 * atajó; otra pasó limpio y reventó recién al hacer clic, ya en producción.
 * Esa diferencia es la que hace falta cubrir acá.
 *
 * Los `export type` y `export interface` no cuentan: se borran al compilar y
 * nunca llegan al navegador.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "src";

/** Todos los archivos .ts/.tsx bajo `src`. */
function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.tsx?$/.test(ruta)) salida.push(ruta);
  }
  return salida;
}

const problemas = [];

for (const ruta of archivos(RAIZ)) {
  const texto = readFileSync(ruta, "utf8");

  // La directiva tiene que estar en las primeras líneas para valer.
  if (!/^\s*(["'])use server\1/m.test(texto.slice(0, 200))) continue;

  texto.split("\n").forEach((linea, i) => {
    if (!/^export\b/.test(linea)) return;

    // Lo que sí puede exportarse: una función asíncrona, escrita como
    // declaración o como constante con flecha. Las dos formas son válidas para
    // Next; lo que no puede viajar es cualquier otro valor.
    if (/^export\s+async\s+function\b/.test(linea)) return;
    if (/^export\s+const\s+\w+[^=]*=\s*async\s*[(<]/.test(linea)) return;
    // Los tipos se borran al compilar: nunca llegan al navegador.
    if (/^export\s+(type|interface)\b/.test(linea)) return;
    // `export type { X }` y `export { type X }`, la forma con llaves.
    if (/^export\s+type\s*\{/.test(linea)) return;

    problemas.push({ ruta, linea: i + 1, texto: linea.trim() });
  });
}

if (problemas.length === 0) {
  console.log("Ningún archivo «use server» exporta algo que no sea una función asíncrona.");
  process.exit(0);
}

console.error(
  "Estas exportaciones no sobreviven el viaje al navegador. Movelas a un módulo\n" +
    "normal (por ejemplo `src/lib/`) y importalas desde ahí:\n",
);
for (const p of problemas) {
  console.error(`  ${p.ruta}:${p.linea}\n    ${p.texto}`);
}
process.exit(1);
