/**
 * Tirar el catálogo guardado, para las pruebas del banco.
 *
 * ============================================================================
 * PARA QUÉ HACE FALTA ESTO
 * ============================================================================
 *
 * El catálogo —vendedores, programas, territorios, canales, etapas, estados,
 * motivos y tipos de evento— se lee una vez y se guarda cinco minutos, porque
 * son ocho consultas que no cambian casi nunca y se repetían en cada refresco.
 * Lo que lo tira es `revalidateTag` desde las acciones de la aplicación: quien
 * crea un programa desde el CRM lo ve al instante.
 *
 * Pero una prueba del banco que siembra con `insert into public.productos ...`
 * NO pasa por ninguna acción, así que no tira nada: la pantalla sigue
 * mostrando el catálogo de antes y la prueba se pone roja sin que nadie haya
 * roto nada.
 *
 * ESO YA PASÓ. `prueba-editar-programa` siembra un «Diplomado de Alfarería» por
 * SQL y después lo busca en la pantalla; con el catálogo guardado dejó de
 * encontrarlo. Y `prueba-programas-por-mes`, que no siembra programas, se puso
 * roja igual porque OTRA prueba había dejado el catálogo sucio: el rojo salía
 * en un archivo que nadie había tocado.
 *
 * ============================================================================
 * POR QUÉ REARRANCA LA APLICACIÓN
 * ============================================================================
 *
 * Lo guardado vive en dos lados: en `.next/cache/fetch-cache`, en el disco, y
 * en la memoria del proceso que ya lo leyó. Borrar el disco y no rearrancar no
 * alcanza —comprobado: siguió mostrando el catálogo viejo—. Y desde afuera no
 * hay forma de llamar a `revalidateTag`.
 *
 * Se podría haber dejado una puerta en la aplicación para tirarlo desde fuera.
 * No: una puerta que vacía cachés, abierta en producción para comodidad del
 * banco, es exactamente la clase de cosa que después nadie se acuerda de cerrar.
 *
 * ============================================================================
 * CÓMO SE USA
 * ============================================================================
 *
 *     import { tirarCatalogo } from "./tirarCatalogo.mjs";
 *
 *     sql(`insert into public.productos ...`);
 *     await tirarCatalogo();        // ← y recién ahí abrir la pantalla
 *
 * Tarda unos segundos, los que tarde la aplicación en levantar. Sólo hace
 * falta después de escribir por SQL en una de las ocho tablas del catálogo; si
 * la prueba siembra leads, clientes o mensajes, no hace nada y no se llama.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO = 3142;
const GUARDADO = `${RAIZ}/.next/cache/fetch-cache`;

/**
 * Los procesos de la aplicación que están corriendo.
 *
 * Se leen de `/proc` y no con `ps aux | grep`, a propósito: el `grep` aparece
 * en la lista con el patrón en su propia línea de comando y se mata a sí mismo
 * o a quien lo invocó. Eso ya costó dos sesiones caídas en este banco.
 */
function procesosDeLaApp() {
  const pids = [];
  for (const entrada of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entrada)) continue;
    let cmd;
    try {
      cmd = fs.readFileSync(`/proc/${entrada}/cmdline`, "utf8").replace(/\0/g, " ").trim();
    } catch {
      continue; // se murió entre el listado y la lectura
    }
    if (!cmd) continue;
    const esLaApp =
      cmd.includes("next-server") || /next start -p\s*3142/.test(cmd) || cmd.includes("next exec next start");
    // Nunca a uno mismo, ni al proceso que nos lanzó.
    if (esLaApp && Number(entrada) !== process.pid && Number(entrada) !== process.ppid) {
      pids.push(Number(entrada));
    }
  }
  return pids;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera hasta que la aplicación contesta, o se rinde. */
async function esperarQueLevante(segundos = 40) {
  for (let i = 0; i < segundos; i++) {
    try {
      // Contesta 307 sin sesión; cualquier respuesta sirve, la cosa es que haya.
      await fetch(`http://127.0.0.1:${PUERTO}/`, { redirect: "manual" });
      return true;
    } catch {
      await dormir(1000);
    }
  }
  return false;
}

/**
 * Deja el catálogo guardado en nada y la aplicación en pie.
 *
 * Si la aplicación no estaba corriendo, no la levanta: no es su trabajo
 * adivinar si el banco está armado. Devuelve qué hizo, para que la prueba
 * pueda decirlo si algo sale mal.
 */
export async function tirarCatalogo() {
  const antes = procesosDeLaApp();

  for (const pid of antes) {
    try {
      process.kill(pid);
    } catch {
      /* ya no estaba */
    }
  }
  if (antes.length > 0) await dormir(2000);

  fs.rmSync(GUARDADO, { recursive: true, force: true });

  if (antes.length === 0) {
    return { rearrancada: false, motivo: "la aplicación no estaba corriendo" };
  }

  const registro = fs.openSync(`${RAIZ}/supabase/pruebas/banco/next.log`, "a");
  spawn("npx", ["next", "start", "-p", String(PUERTO)], {
    cwd: RAIZ,
    detached: true,
    stdio: ["ignore", registro, registro],
  }).unref();

  const levantó = await esperarQueLevante();
  if (!levantó) {
    throw new Error(
      `la aplicación no volvió a levantar en el puerto ${PUERTO} — mirá supabase/pruebas/banco/next.log`,
    );
  }
  return { rearrancada: true, motivo: null };
}
