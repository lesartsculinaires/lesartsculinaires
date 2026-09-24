/**
 * Compilar un módulo del CRM para poder probarlo con `node --test`.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA
 * ============================================================================
 *
 * Las reglas del CRM viven en TypeScript y usan el atajo `@/lib/…`. Node no
 * entiende ninguna de las dos cosas, así que hay que traducirlas antes.
 *
 * Esto estaba resuelto, pero a mano: varias pruebas viejas piden en su
 * encabezado que uno corra `npx esbuild …` antes de correrlas. Funciona, pero
 * significa que `node --test supabase/pruebas/*.test.mjs` no las puede correr
 * solo —y una prueba que no entra en la corrida de todas es una prueba que
 * nadie corre—. Acá el mismo esbuild se invoca desde la prueba.
 *
 * Se empaqueta todo junto (`--bundle`) a propósito: así se prueba el módulo
 * con sus dependencias de verdad y no con imitaciones, que es donde aparecen
 * las diferencias que importan.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = "/home/user/lesartsculinaires";

/**
 * Devuelve lo que exporta ese módulo, ya listo para usar.
 *
 * `ruta` va relativa a la raíz del repo: `src/lib/bases.ts`.
 */
export async function compilar(ruta) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "crm-prueba-"));
  const salida = path.join(carpeta, `${path.basename(ruta, ".ts")}.mjs`);

  execFileSync(
    "npx",
    [
      "esbuild",
      path.join(RAIZ, ruta),
      "--bundle",
      "--format=esm",
      "--platform=node",
      `--alias:@=${path.join(RAIZ, "src")}`,
      // `server-only` no es un paquete: lo resuelve el empaquetador de Next y
      // su único trabajo es romper el build si alguien importa un módulo de
      // servidor desde el navegador. Acá se apunta a un archivo vacío, porque
      // estas pruebas corren en Node, que es donde ese módulo sí puede estar.
      `--alias:server-only=${path.join(RAIZ, "supabase/pruebas/server-only-vacio.mjs")}`,
      `--outfile=${salida}`,
      // Lo del navegador no se ejecuta en estas pruebas, pero si un módulo lo
      // importa de paso, sin esto el empaquetado falla entero.
      "--external:react",
      "--external:next/*",
      "--log-level=warning",
    ],
    { cwd: RAIZ, stdio: "pipe" },
  );

  return import(salida);
}
