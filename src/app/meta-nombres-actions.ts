"use server";

import { revalidatePath } from "next/cache";

import { perfilDe } from "@/lib/instagram/enviar";
import { completarPerfilSiFalta, type CanalParaPerfil } from "@/lib/meta/bandeja";
import { perfilDeMsn } from "@/lib/messenger/enviar";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

/**
 * «Los hilos de Instagram y Messenger salen con un número en vez del nombre.»
 *
 * ============================================================================
 * QUÉ ES ESTO Y POR QUÉ ES UN BOTÓN Y NO UNA TAREA AUTOMÁTICA
 * ============================================================================
 *
 * Los nombres de Instagram y Messenger no vienen en el mensaje: hay que ir a
 * pedirlos a Meta. Cuando esa consulta falla —modo desarrollo, revisión sin
 * aprobar, token vencido— el hilo se guarda igual, sin nombre, y la bandeja
 * muestra el identificador.
 *
 * Desde `meta/bandeja.ts` eso ya se arregla solo: mientras al hilo le falte el
 * nombre, se vuelve a preguntar cada vez que esa persona escribe. Pero eso
 * depende de que vuelva a escribir, y los hilos que entraron durante la espera
 * pueden quedarse así meses.
 *
 * Este botón hace dos cosas que valen por separado:
 *
 * 1. Resuelve de una todos los hilos que se puedan resolver ahora.
 *
 * 2. Y cuando NO se puede, dice POR QUÉ, con la respuesta de Meta traducida.
 *    Eso es la mitad del valor: la diferencia entre «no funciona» y «falta que
 *    Meta apruebe la revisión» no se puede adivinar desde la pantalla, y hasta
 *    hoy había que ir a leer los registros del servidor para saberlo.
 */

/**
 * Los dos canales que necesitan preguntar el nombre.
 *
 * Es sólo lo que hace falta para buscar un perfil y guardar el resultado: nada
 * de carpetas de archivos ni de leer cargas, que acá no se usa. Las fichas
 * completas de cada canal siguen viviendo en sus rutas de webhook, que son
 * quienes las necesitan enteras.
 */
const CANALES: Record<string, CanalParaPerfil> = {
  instagram: {
    clave: "instagram",
    migracion: "20261024120000_instagram.sql",
    perfilDe,
    rpcCliente: {
      nombre: "cliente_de_instagram",
      argumentos: (igsid, perfil) => ({
        p_igsid: igsid,
        p_usuario: perfil.usuario,
        p_nombre: perfil.nombre,
      }),
    },
  },
  messenger: {
    clave: "messenger",
    migracion: "20261027120000_messenger.sql",
    perfilDe: perfilDeMsn,
    rpcCliente: {
      nombre: "cliente_de_canal",
      argumentos: (psid, perfil) => ({
        p_canal: "Messenger",
        p_identificador: psid,
        p_usuario: perfil.usuario,
        p_nombre: perfil.nombre,
      }),
    },
  },
};

export interface ResultadoNombres {
  ok: boolean;
  /** Cuántos hilos sin nombre había. */
  revisados: number;
  /** A cuántos se les pudo poner nombre ahora. */
  resueltos: number;
  /** Lo que dijo Meta cuando no se pudo. Una línea, ya traducida. */
  motivo: string | null;
  error: string | null;
}

/**
 * Le vuelve a preguntar a Meta el nombre de los hilos que entraron sin él.
 *
 * El tope existe porque esto es una llamada a Meta por hilo y corre dentro de
 * una petición web: con cuatrocientos hilos se pasaría del tiempo máximo y no
 * terminaría ninguno. Se hace una tanda, se ve el resultado, y si quedan se
 * vuelve a apretar.
 */
export async function refrescarNombresMeta(tope = 40): Promise<ResultadoNombres> {
  const usuario = await getUser();
  if (!usuario) {
    return { ok: false, revisados: 0, resueltos: 0, motivo: null, error: "Sesión no válida." };
  }

  /*
   * Se escribe con la llave de servicio, igual que el webhook.
   *
   * Es el mismo trabajo que hace el webhook cuando entra un mensaje —poner el
   * nombre que Meta acaba de dar— sólo que disparado a mano. Hacerlo con la
   * sesión de quien apretó obligaría a una política de escritura sobre
   * `conversaciones` para un caso que no es «esta persona edita su dato», y
   * abriría más de lo que resuelve.
   */
  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      revisados: 0,
      resueltos: 0,
      motivo: null,
      error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.",
    };
  }

  const { data, error } = await admin
    .from("conversaciones")
    .select("id, canal, identificador, nombre_perfil, usuario")
    .in("canal", Object.keys(CANALES))
    .is("nombre_perfil", null)
    .order("ultimo_mensaje_en", { ascending: false })
    .limit(tope);

  if (error) {
    return { ok: false, revisados: 0, resueltos: 0, motivo: null, error: error.message };
  }

  const filas = (data ?? []) as Record<string, unknown>[];
  let resueltos = 0;
  let motivo: string | null = null;

  for (const fila of filas) {
    const canal = CANALES[String(fila.canal)];
    const quien = String(fila.identificador ?? "").trim();
    if (!canal || !quien) continue;

    /*
     * `forzar` salta el freno de seis horas de `bandeja.ts`.
     *
     * Ese freno está para que una ráfaga de mensajes no dispare una consulta
     * por mensaje. Acá lo pidió una persona que está mirando la pantalla
     * esperando la respuesta: hacerla esperar seis horas sería absurdo.
     */
    const intento = await completarPerfilSiFalta(admin, canal, quien, Number(fila.id), {
      forzar: true,
    });

    if (intento.puesto) resueltos += 1;
    // Se guarda el primer motivo y no el último: cuando falta el permiso todos
    // dicen lo mismo, y repetirlo cuarenta veces no agrega nada.
    else motivo ??= intento.motivo;
  }

  if (resueltos > 0) revalidatePath("/");

  return { ok: true, revisados: filas.length, resueltos, motivo, error: null };
}
