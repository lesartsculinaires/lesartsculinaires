import "server-only";

import { abrirLeadSiEsNuevo, anotarElCanal, faltaLaFuncion } from "@/lib/crm/leadDeCanal";
import { bajarAdjuntoIg, rutaMediaIg } from "@/lib/instagram/media";
import type { MensajeIg, ReaccionIg } from "@/lib/instagram/mensajes";
import type { PerfilMeta } from "@/lib/meta/perfil";
import type { getAdminClient } from "@/lib/supabase/admin";

/**
 * Guardar en la bandeja lo que llega por un canal de Meta.
 *
 * ============================================================================
 * POR QUÉ ESTO SALIÓ DEL WEBHOOK DE INSTAGRAM
 * ============================================================================
 *
 * Es la misma decisión que ya se había tomado con `crm/leadDeCanal.ts`, y por
 * la misma razón, escrita ahí: copiar era menos riesgoso hoy y peor dentro de
 * tres meses.
 *
 * Instagram y Messenger son el mismo canal con dos nombres. Meta manda la misma
 * carga —`entry[].messaging[]`—, con el mismo `mid`, los mismos ecos, las mismas
 * reacciones y los mismos adjuntos que vencen en minutos. Lo único distinto es
 * cómo se llama la persona del otro lado —IGSID o PSID—, de qué catálogo sale el
 * canal, y en qué carpeta van los archivos.
 *
 * Con dos copias, lo que se rompe no es lo obvio. Es que alguien arregle en una
 * el manejo del 23505 de un reintento de Meta y no en la otra, y que meses
 * después un canal duplique mensajes y el otro no, sin que nada lo avise.
 *
 * ============================================================================
 * QUÉ NO ESTÁ ACÁ
 * ============================================================================
 *
 * La política del CRM —a quién se le asigna un lead, cuándo se abre uno— vive en
 * `leadDeCanal.ts` y esto la llama. Son dos capas: acá se guarda lo que pasó,
 * allá se decide qué significa.
 *
 * ============================================================================
 * NADA DE ACÁ LANZA MÁS DE LA CUENTA
 * ============================================================================
 *
 * Lo llaman webhooks. Un error que sale hacia afuera hace que Meta reintente y,
 * si insiste, desactive la integración: por un mensaje que no se pudo guardar se
 * perderían todos los que vinieran después. Lo que puede fallar sin perder el
 * mensaje —el archivo, el lead, el canal— se registra y sigue.
 */

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

/**
 * Lo que distingue a un canal de Meta de otro.
 *
 * Es chico a propósito: si esta ficha crece, quiere decir que los canales se
 * parecen menos de lo que este archivo supone, y conviene volver a separarlos.
 */
export interface CanalMeta {
  /** Cómo se guarda en `conversaciones.canal`. En minúsculas. */
  clave: string;
  /** Cómo se llama en el catálogo `canales`, para `contactos_canal`. */
  nombreCatalogo: string;
  /** La carpeta dentro del bucket donde van sus archivos. */
  carpeta: string;
  /** El archivo SQL que hay que correr, para decirlo cuando falte. */
  migracion: string;
  /** Cómo se lee en la lista un mensaje que no trae texto. */
  resumen: (tipo: string, texto: string | null) => string;
  /** Qué clases de adjunto son un archivo que se puede bajar y guardar. */
  esArchivo: (clase: string) => boolean;
  /**
   * El nombre y el @usuario de esa persona, preguntándoselo a Meta.
   *
   * Se llama UNA vez por persona —cuando el hilo es nuevo— y no una vez por
   * mensaje. Messenger no entrega @usuario y devuelve null ahí, que es lo
   * correcto: inventarlo sería mostrar una arroba que no existe.
   */
  perfilDe: (quien: string) => Promise<PerfilMeta>;
  /** La función de la base que resuelve de quién es este identificador. */
  rpcCliente: {
    nombre: string;
    argumentos: (
      quien: string,
      perfil: { nombre: string | null; usuario: string | null },
    ) => Record<string, unknown>;
  };
}

/**
 * Cuánto se espera por un archivo antes de soltarlo.
 *
 * Meta corta el webhook a los 20 segundos y reintenta, así que el techo por
 * archivo tiene que dejar lugar para lo demás que hace la función.
 */
const SEGUNDOS_PARA_BAJAR = 8;

/**
 * Guarda un mensaje y deja la conversación al día.
 *
 * ----------------------------------------------------------------------------
 * LOS PROPIOS MENSAJES TAMBIÉN ENTRAN POR ACÁ
 * ----------------------------------------------------------------------------
 *
 * Si alguien del equipo contesta desde la aplicación del teléfono en vez de
 * hacerlo desde el CRM, Meta manda ese mensaje de vuelta marcado como eco. Se
 * guarda igual, como SALIENTE, y es una ventaja: el hilo del CRM queda idéntico
 * al real aunque la mitad se haya contestado desde el teléfono, que en esta
 * escuela va a pasar.
 *
 * Lo que un eco no hace es subir el contador de sin leer ni abrir un lead: no es
 * alguien preguntando, es alguien de acá contestando.
 */
export async function guardarEntranteMeta(
  supabase: Cliente,
  canal: CanalMeta,
  m: MensajeIg,
) {
  const conversacion = await conversacionDeMeta(supabase, canal, m.igsid);
  if (!conversacion) return;

  // El archivo se trae antes de guardar el mensaje, y con más urgencia que en
  // WhatsApp: el enlace que manda Meta vence en minutos.
  const archivo = m.media ? await guardarArchivo(supabase, canal, conversacion, m) : null;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    /*
     * El `mid` va en la columna `wa_id`.
     *
     * El nombre es de WhatsApp y quedó de cuando era el único canal; lo que la
     * columna guarda es «el id que le puso Meta a este mensaje», que es lo mismo
     * en los tres. Renombrarla sería tocar el webhook de WhatsApp, los acuses de
     * los envíos masivos y las reacciones, todo en producción, para ganar un
     * nombre más lindo.
     */
    wa_id: m.mid,
    direccion: m.esEco ? "saliente" : "entrante",
    tipo: m.tipo,
    texto: m.texto,
    payload: m.crudo,
    creado_en: m.enviadoEn.toISOString(),
    media_ruta: archivo?.ruta ?? null,
    media_mime: archivo?.mime ?? null,
    media_error: archivo?.error ?? null,
  });

  // 23505 es la restricción de unicidad sobre `wa_id`: este mensaje ya estaba
  // guardado y esto es un reintento de Meta. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  if (m.esEco) {
    /*
     * Un eco adelanta el reloj del hilo pero no lo pone en rojo.
     *
     * Sin tocar `ultimo_mensaje_en`, un hilo contestado desde el teléfono se
     * quedaría abajo de todo en la bandeja, ordenada por esa fecha, y parecería
     * abandonado. Y `sin_leer` no se toca: ya se contestó.
     */
    await supabase
      .from("conversaciones")
      .update({
        ultimo_mensaje_en: m.enviadoEn.toISOString(),
        ultimo_texto: canal.resumen(m.tipo, m.texto).slice(0, 200),
      })
      .eq("id", conversacion);
    return;
  }

  // El contador sube en la base, no en memoria: dos mensajes que llegan a la
  // vez se cuentan los dos.
  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: canal.resumen(m.tipo, m.texto).slice(0, 200),
    p_cuando: m.enviadoEn.toISOString(),
  });

  await anotarElCanal(supabase, conversacion, canal.clave, m.igsid, m.enviadoEn);
  await abrirLeadSiEsNuevo(supabase, conversacion, canal.clave);
}

/**
 * La conversación de esta persona, creándola si es la primera vez.
 *
 * ----------------------------------------------------------------------------
 * `telefono` QUEDA NULO, Y ES LO CORRECTO
 * ----------------------------------------------------------------------------
 *
 * Meta no entrega el número de quien escribe por Instagram ni por Messenger. La
 * identidad es el IGSID o el PSID y va en `identificador`; ponerlo en `telefono`
 * para «llenar el campo» es exactamente lo que evita la migración
 * `20261024120000_instagram.sql`, y el porqué está escrito ahí: el CRM reconoce
 * personas por los últimos ocho dígitos del teléfono, y un identificador de
 * dieciséis o diecisiete dígitos terminaría fundiendo a dos personas que no
 * tienen nada que ver.
 *
 * ----------------------------------------------------------------------------
 * Y POR QUÉ UN CANAL NO PUEDE PISAR A OTRO
 * ----------------------------------------------------------------------------
 *
 * La búsqueda es por `canal` Y `identificador`, y la base tiene esa misma pareja
 * como índice único. Un PSID de Messenger y un IGSID de Instagram que por
 * casualidad fueran el mismo número son dos hilos distintos, de dos personas
 * distintas, y no hay forma de que se crucen.
 */
export async function conversacionDeMeta(
  supabase: Cliente,
  canal: CanalMeta,
  quien: string,
): Promise<number | null> {
  const buscar = async () => {
    const { data } = await supabase
      .from("conversaciones")
      .select("id, nombre_perfil, usuario")
      .eq("canal", canal.clave)
      .eq("identificador", quien)
      .maybeSingle();
    return data
      ? {
          id: Number(data.id),
          sinNombre:
            !String(data.nombre_perfil ?? "").trim() && !String(data.usuario ?? "").trim(),
        }
      : null;
  };

  const existente = await buscar();
  if (existente != null) {
    /*
     * El hilo ya estaba, pero puede estar sin nombre.
     *
     * ------------------------------------------------------------------------
     * POR QUÉ SE VUELVE A PREGUNTAR Y NO SE PREGUNTA UNA SOLA VEZ
     * ------------------------------------------------------------------------
     *
     * Porque la primera vez puede fallar por algo TEMPORAL. El caso real que lo
     * obligó: mientras la aplicación de Meta está en modo desarrollo, la
     * consulta de perfil devuelve error de permisos, así que todos los hilos que
     * entran en ese período se guardan sin nombre. Pidiéndolo una sola vez, el
     * día que Meta aprueba la revisión esos hilos se quedan con el número
     * PARA SIEMPRE, aunque a partir de ahí los nuevos sí traigan nombre.
     *
     * Se vuelve a preguntar SÓLO mientras falte. En cuanto hay nombre, esto no
     * se ejecuta más y vuelve a ser una consulta por persona, no por mensaje.
     */
    if (existente.sinNombre) {
      await completarPerfilSiFalta(supabase, canal, quien, existente.id);
    }
    return existente.id;
  }

  /*
   * El nombre se pide UNA vez, acá.
   *
   * En WhatsApp viene dentro del mensaje; en Instagram y Messenger hay que
   * preguntarlo. Pedirlo sólo cuando el hilo es nuevo es lo que hace que sea una
   * llamada por persona y no una por mensaje.
   */
  const perfil = await canal.perfilDe(quien);
  const clienteId = await clienteDeMeta(supabase, canal, quien, perfil);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      canal: canal.clave,
      identificador: quien,
      // Ver arriba: no hay teléfono y no se inventa uno.
      telefono: null,
      nombre_perfil: perfil.nombre ?? (perfil.usuario ? `@${perfil.usuario}` : null),
      usuario: perfil.usuario,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  // Dos mensajes de la misma persona nueva llegando a la vez: el segundo choca
  // con la unicidad por canal y se queda con la que ganó.
  if (error?.code === "23505") return (await buscar())?.id ?? null;

  if (error) {
    if (esDeLaMigracion(error)) {
      console.error(
        `[${canal.clave}] falta correr ${canal.migracion};` +
          ` los mensajes de ${canal.nombreCatalogo} no se pueden guardar todavía`,
      );
      return null;
    }
    throw error;
  }

  return creada ? Number(creada.id) : null;
}

/**
 * La base todavía no tiene lo que la migración agrega.
 *
 * A diferencia de WhatsApp, acá no hay modo viejo al que caerse: sin
 * `identificador` no hay dónde poner un hilo, porque `telefono` es obligatorio
 * en el esquema anterior y no tenemos ninguno. Se dice claro en el registro y se
 * devuelve 200 igual, para que Meta no desactive el webhook mientras la escuela
 * corre el SQL.
 */
const esDeLaMigracion = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST204" ||
  e.code === "42703" ||
  e.code === "23502" ||
  /identificador|usuario/i.test(e.message ?? "");

/**
 * Cuándo se le volvió a preguntar a Meta por un perfil que faltaba.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ALCANZA CON TENERLO EN MEMORIA
 * ----------------------------------------------------------------------------
 *
 * Esto corre en funciones que se apagan solas, así que el mapa se vacía seguido
 * y no es un freno exacto. No hace falta que lo sea: lo que tiene que evitar es
 * que una ráfaga de diez mensajes de la misma persona dispare diez consultas
 * iguales a Meta, y para eso una instancia tibia sobra.
 *
 * Guardarlo en la base sería exacto y costaría una columna, una migración y una
 * escritura más por mensaje, para ahorrar una consulta cada tanto. No vale.
 */
const ultimoIntento = new Map<string, number>();

/** Cada cuánto se reintenta un perfil que Meta no quiso dar. */
const ESPERA_ENTRE_INTENTOS = 6 * 60 * 60 * 1000;

/** Lo que hace falta de un canal para ir a buscar un nombre. */
export type CanalParaPerfil = Pick<
  CanalMeta,
  "clave" | "migracion" | "perfilDe" | "rpcCliente"
>;

/** Cómo salió el intento de completar un nombre. */
export interface IntentoDePerfil {
  /** Si el hilo quedó con nombre. */
  puesto: boolean;
  /**
   * Por qué no, cuando no. `null` con `puesto: false` quiere decir que Meta
   * contestó bien y esa persona no tiene nombre visible, o que el freno de las
   * seis horas hizo que ni se preguntara. Las dos cosas son normales.
   */
  motivo: string | null;
}

/**
 * Le pregunta a Meta el nombre de alguien cuyo hilo ya existe sin nombre.
 *
 * Que falle no toca el mensaje: esto se llama antes de guardarlo y lo único que
 * pasa si sale mal es que el hilo sigue titulado como estaba.
 */
export async function completarPerfilSiFalta(
  supabase: Cliente,
  canal: CanalParaPerfil,
  quien: string,
  conversacionId: number,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<IntentoDePerfil> {
  const llave = `${canal.clave}:${quien}`;
  const previo = ultimoIntento.get(llave);

  if (!forzar && previo != null && Date.now() - previo < ESPERA_ENTRE_INTENTOS) {
    return { puesto: false, motivo: null };
  }
  ultimoIntento.set(llave, Date.now());

  const perfil = await canal.perfilDe(quien);

  if (!perfil.nombre && !perfil.usuario) return { puesto: false, motivo: perfil.motivo };

  const { error } = await supabase
    .from("conversaciones")
    .update({
      nombre_perfil: perfil.nombre ?? (perfil.usuario ? `@${perfil.usuario}` : null),
      usuario: perfil.usuario,
    })
    .eq("id", conversacionId);

  if (error) {
    console.error(`[${canal.clave}] no se pudo guardar el nombre de ${quien}`, error.message);
    return { puesto: false, motivo: error.message };
  }

  /*
   * La ficha del cliente también se corrige, y por eso se vuelve a llamar a la
   * función de la base en vez de escribir `clientes.nombre` desde acá.
   *
   * `cliente_de_canal` ya sabe cuándo puede pisar el nombre y cuándo no —si
   * alguien lo escribió a mano, no se toca— y esa regla tiene que vivir en un
   * solo lugar. Acá sólo se la invoca de nuevo, ahora que hay algo que darle.
   */
  await clienteDeMeta(supabase, canal, quien, perfil);
  return { puesto: true, motivo: null };
}

/**
 * La ficha de esta persona: la que ya existe, o una nueva.
 *
 * La función de la base busca por el identificador en `contactos_canal` y, si no
 * lo encuentra, abre ficha nueva. A propósito NO junta con una ficha existente:
 * Meta no entrega teléfono ni correo, y juntar por nombre fundiría a dos «María
 * González» que no se conocen. El razonamiento completo está en la migración.
 *
 * Que falle no debe perder el mensaje: la conversación se guarda igual, sin
 * cliente, y el asesor la resuelve desde la bandeja.
 */
async function clienteDeMeta(
  supabase: Cliente,
  canal: CanalParaPerfil,
  quien: string,
  perfil: { nombre: string | null; usuario: string | null },
): Promise<number | null> {
  const { data, error } = await supabase.rpc(
    canal.rpcCliente.nombre,
    canal.rpcCliente.argumentos(quien, perfil),
  );

  if (!error) return data == null ? null : Number(data);

  if (faltaLaFuncion(error)) {
    console.error(
      `[${canal.clave}] falta correr ${canal.migracion}; el hilo entra sin ficha de cliente`,
    );
    return null;
  }

  console.error(`[${canal.clave}] no se pudo resolver el cliente`, error.message);
  return null;
}

/**
 * La persona reaccionó a uno de nuestros mensajes, o le sacó la reacción.
 *
 * Igual que en WhatsApp: no sube `sin_leer` ni toca `ultimo_texto`. Un 👍 sobre
 * la cotización que acabamos de mandar quiere decir «me llegó», no «contestame»;
 * contarlo como pendiente mandaría a la asesora a un hilo donde nadie dijo nada.
 */
export async function guardarReaccionMeta(
  supabase: Cliente,
  canal: CanalMeta,
  r: ReaccionIg,
) {
  const { data: mensaje } = await supabase
    .from("mensajes")
    .select("id")
    .eq("wa_id", r.sobreMid)
    .maybeSingle();

  if (!mensaje) return;
  const mensajeId = Number(mensaje.id);

  // Siempre se borra primero: reemplazar un ❤️ por un 👍 no son dos reacciones
  // sino una que cambió, y quitarla es sólo el borrado.
  const { error: errBorrado } = await supabase
    .from("reacciones")
    .delete()
    .eq("mensaje_id", mensajeId)
    .eq("direccion", "entrante");

  if (errBorrado) return;
  if (!r.emoji) return;

  const { error } = await supabase.from("reacciones").insert({
    mensaje_id: mensajeId,
    direccion: "entrante",
    emoji: r.emoji,
    creado_en: r.cuando.toISOString(),
  });

  // 23505: llegaron dos avisos de la misma reacción a la vez.
  if (error && error.code !== "23505") throw error;
  void canal;
}

/**
 * Baja el adjunto y lo deja en el bucket.
 *
 * Nunca lanza y nunca demora de más: Meta espera un 200 y, si tarda, reintenta
 * el webhook entero. Un fallo se devuelve como texto en vez de cortar el
 * guardado: el mensaje vale aunque su foto no haya llegado.
 *
 * Los tipos que no son un archivo —una publicación compartida, una mención en
 * una historia— traen URL pero no hay nada que bajar: la publicación vive en
 * Meta y el enlace queda en el `payload`, que es donde quien atiende lo puede
 * mirar.
 */
async function guardarArchivo(
  supabase: Cliente,
  canal: CanalMeta,
  conversacionId: number,
  m: MensajeIg,
): Promise<{ ruta: string | null; mime: string | null; error: string | null }> {
  if (!m.media) return { ruta: null, mime: null, error: null };
  if (!canal.esArchivo(m.media.clase)) return { ruta: null, mime: null, error: null };

  const corte = AbortSignal.timeout(SEGUNDOS_PARA_BAJAR * 1000);
  const bajado = await bajarAdjuntoIg(m.media.url, corte);

  if (!bajado.ok) {
    console.error(`[${canal.clave}] no se pudo bajar el archivo`, m.mid, bajado.error);
    return { ruta: null, mime: null, error: bajado.error };
  }

  const ruta = rutaMediaIg(conversacionId, m.mid, bajado.archivo.mime, canal.carpeta);

  /*
   * Mismo bucket que WhatsApp.
   *
   * Se llama «whatsapp» por cuando era el único canal, pero lo que guarda es «lo
   * que mandó el cliente, tal cual llegó», que es lo mismo acá. Reusarlo evita un
   * bucket más con sus políticas, y la bandeja ya sabe firmar enlaces contra él.
   * Cada canal tiene su carpeta, así que se pueden mirar o limpiar por separado.
   */
  const { error } = await supabase.storage
    .from("whatsapp")
    .upload(ruta, bajado.archivo.bytes, {
      contentType: bajado.archivo.mime,
      upsert: true,
    });

  if (error) {
    console.error(`[${canal.clave}] no se pudo guardar el archivo`, m.mid, error.message);
    return { ruta: null, mime: bajado.archivo.mime, error: error.message };
  }

  return { ruta, mime: bajado.archivo.mime, error: null };
}

/**
 * Lo que se registra cuando una carga pasa la firma y no trae ningún mensaje.
 *
 * Es el tercer escalón de «no me llegan los mensajes», y sin esto es
 * indistinguible del primero. Los tres se leen seguidos en el registro de
 * Netlify y cada uno tiene un arreglo distinto:
 *
 *   NO HAY NINGUNA LÍNEA    Meta no está llamando. Falta suscribir la página, o
 *                           la aplicación está en desarrollo y quien escribió no
 *                           tiene rol en ella.
 *   «firma inválida»        Llega, pero se verifica con el secreto de otra
 *                           aplicación.
 *   ESTA LÍNEA              Llega y se verifica, pero no venía un mensaje: suele
 *                           ser que se suscribió otro campo en vez de `messages`.
 *
 * Se registra qué objeto y qué campos vinieron —no el contenido— para poder
 * decir cuál de esos es sin pedirle a nadie que copie un JSON.
 */
export function avisarCargaVacia(canal: CanalMeta, carga: unknown) {
  const raiz = carga as { object?: unknown; entry?: unknown[] };
  const campos = Array.isArray(raiz?.entry)
    ? [
        ...new Set(
          raiz.entry.flatMap((e) =>
            Object.keys((e ?? {}) as Record<string, unknown>).filter((k) => k !== "id"),
          ),
        ),
      ].join(", ")
    : "ninguno";

  console.warn(
    `[${canal.clave}] llegó una carga verificada pero sin mensajes. ` +
      `object=${String(raiz?.object)} campos=${campos || "ninguno"}. ` +
      "Si esto se repite con cada mensaje, revisá que el webhook esté suscrito " +
      "al campo «messages».",
  );
}
