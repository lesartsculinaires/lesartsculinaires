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

  /*
   * DOS LISTAS, PORQUE EL PROBLEMA TIENE DOS FORMAS.
   *
   * La primera es la obvia: el hilo entró sin nombre y muestra el
   * identificador. Ésa se buscaba desde el principio.
   *
   * La segunda cuesta más de ver y es la que reportó la escuela: el HILO tiene
   * el nombre bueno pero la FICHA del cliente sigue llamándose «Contacto de
   * Instagram». Pasa cuando el nombre del hilo lo puso una migración, que
   * arregla `conversaciones` y no toca `clientes`. Como este botón sólo miraba
   * los hilos sin nombre, esas fichas no se revisaban nunca y se quedaban así
   * para siempre —ocho de ellas, en producción—.
   *
   * Se juntan sin repetir: un hilo puede estar en las dos listas.
   */
  const sinNombre = await admin
    .from("conversaciones")
    .select("id, canal, identificador, nombre_perfil, usuario")
    .in("canal", Object.keys(CANALES))
    .is("nombre_perfil", null)
    .order("ultimo_mensaje_en", { ascending: false })
    .limit(tope);

  if (sinNombre.error) {
    return { ok: false, revisados: 0, resueltos: 0, motivo: null, error: sinNombre.error.message };
  }

  /*
   * Los respaldos se nombran uno por uno y no con un «Contacto de %».
   *
   * Con el comodín se pisaría también una ficha que alguien llamó a mano
   * «Contacto de la feria de septiembre», que es justo lo contrario de lo que
   * esto tiene que hacer. Es la misma decisión que ya está tomada dentro de
   * `cliente_de_canal`, y por el mismo motivo.
   */
  const RESPALDOS = Object.values(CANALES).map(
    (c) => `Contacto de ${c.clave === "instagram" ? "Instagram" : "Messenger"}`,
  );

  /*
   * Dos consultas planas y no una con join incrustado.
   *
   * PostgREST sabe hacer el join —`clientes!inner(nombre)`— pero eso depende de
   * que tenga la clave foránea en su caché de esquema, y ese caché se queda
   * viejo después de cada migración hasta que alguien lo recarga. La primera
   * versión de esto devolvía cero filas por ese motivo, en silencio y sin
   * error: el botón parecía andar y no arreglaba nada. Con dos consultas por
   * columnas propias no hay nada que se pueda quedar viejo.
   */
  const conRespaldo = await admin.from("clientes").select("id").in("nombre", RESPALDOS);

  // Que esta parte falle no puede tumbar la primera: sin ella el botón hace
  // menos, pero sigue arreglando los hilos sin nombre.
  if (conRespaldo.error) {
    console.warn("[meta] no se pudieron buscar las fichas de respaldo", conRespaldo.error.message);
  }

  const idsDeFichas = (conRespaldo.data ?? []).map((c) => Number((c as { id: unknown }).id));

  const fichaVieja = idsDeFichas.length
    ? await admin
        .from("conversaciones")
        .select("id, canal, identificador, nombre_perfil, usuario")
        .in("canal", Object.keys(CANALES))
        .in("cliente_id", idsDeFichas)
        .order("ultimo_mensaje_en", { ascending: false })
        .limit(tope)
    : { data: [], error: null };

  if (fichaVieja.error) {
    console.warn("[meta] no se pudieron buscar los hilos de esas fichas", fichaVieja.error.message);
  }

  const porId = new Map<number, Record<string, unknown>>();
  for (const fila of [...(sinNombre.data ?? []), ...(fichaVieja.data ?? [])]) {
    const f = fila as Record<string, unknown>;
    if (porId.size >= tope && !porId.has(Number(f.id))) continue;
    porId.set(Number(f.id), f);
  }

  const filas = [...porId.values()];
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

    if (intento.puesto) {
      resueltos += 1;
      continue;
    }

    /*
     * Meta no dio nada, pero el HILO puede tener ya el nombre bueno.
     *
     * Es el caso de las fichas que arregló una migración: el hilo quedó con el
     * nombre de verdad y la ficha se quedó en «Contacto de Instagram». Acá no
     * hace falta preguntarle nada a nadie —el dato ya está—, sólo bajarlo a la
     * ficha llamando a la misma función de la base que usa el webhook.
     *
     * Se la llama a ella y no se escribe `clientes.nombre` desde acá porque es
     * la que sabe cuándo puede pisar un nombre y cuándo no: si alguien lo
     * escribió a mano, no se toca. Esa regla vive en un solo lugar.
     */
    const delHilo = String(fila.nombre_perfil ?? "").trim();
    const usuario = String(fila.usuario ?? "").trim() || null;
    const esRespaldo = RESPALDOS.includes(delHilo) || delHilo === `@${usuario ?? ""}`;

    if (delHilo && !esRespaldo) {
      const { error: errRpc } = await admin.rpc(
        canal.rpcCliente.nombre,
        canal.rpcCliente.argumentos(quien, { nombre: delHilo, usuario }),
      );
      if (!errRpc) {
        resueltos += 1;
        continue;
      }
      motivo ??= errRpc.message;
      continue;
    }

    // Se guarda el primer motivo y no el último: cuando falta el permiso todos
    // dicen lo mismo, y repetirlo cuarenta veces no agrega nada.
    motivo ??= intento.motivo;
  }

  if (resueltos > 0) revalidatePath("/");

  return { ok: true, revisados: filas.length, resueltos, motivo, error: null };
}
