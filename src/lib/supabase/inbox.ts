import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Conversacion, Mensaje } from "@/lib/types";

/** El `select` se arma como texto, así que las filas llegan sin tipar. */
type Fila = Record<string, unknown>;

export interface ResultadoInbox {
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
  /** Las tablas todavía no existen: falta correr la migración. */
  faltaMigracion: boolean;
  error: string | null;
}

const VACIO: ResultadoInbox = {
  conversaciones: [],
  mensajes: [],
  faltaMigracion: false,
  error: null,
};

/**
 * La bandeja completa.
 *
 * Se traen los mensajes de todas las conversaciones de una vez en vez de uno
 * por hilo. Con el volumen de una escuela —decenas de conversaciones, no
 * decenas de miles— una sola consulta pesa menos que una por hilo, y permite
 * cambiar de conversación sin esperar.
 */
export async function fetchInbox(): Promise<ResultadoInbox> {
  const supabase = await getServerClient();
  if (!supabase) return VACIO;

  /**
   * Las conversaciones, con las marcas de la bandeja si ya están.
   *
   * `conMarcas` existe por lo mismo que abajo con los archivos: mientras la
   * escuela no haya corrido `20261011120000_bandeja_marcas.sql`, esas tres
   * columnas no están, y pedirlas devuelve 42703 —el error se lleva la
   * consulta entera y la bandeja se queda en blanco—. Se reintenta sin ellas
   * para que siga funcionando todo menos fijar, silenciar y marcar sin leer.
   */
  /*
   * La identidad del hilo, de la migración de Instagram.
   *
   * Va en su propia capa porque es la más nueva: entre que se despliega el
   * código y se corre el SQL, la bandeja tiene que seguir mostrando los hilos
   * de WhatsApp en vez de quedarse en blanco.
   */
  const IDENTIDAD = ", identificador, usuario";
  const MARCAS = ", no_leida, fijada, silenciada";
  const PERMISO =
    ", llamada_permiso_hasta, llamada_permiso_pedido_en, llamada_permiso_respuesta";

  const traerConvs = (extras: string) =>
    supabase
      .from("conversaciones")
      .select(
        "id, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto, " +
          "sin_leer, archivada, estado, vendedor_id, canal" +
          extras,
      )
      .order("ultimo_mensaje_en", { ascending: false })
      .limit(300);

  /*
   * Se va soltando lo opcional hasta que la consulta entra.
   *
   * Pedir una columna que no existe devuelve 42703, y ese error se lleva la
   * consulta entera: la bandeja quedaría en blanco. Con esto, entre que se
   * despliega el código y se corre el SQL, lo único que falta es la función
   * nueva —fijar y silenciar, o el permiso de llamada—; todo lo demás sigue
   * andando.
   *
   * El orden va de más a menos, y se prueban las combinaciones que existen de
   * verdad: las migraciones se corren en orden, así que nadie tiene el permiso
   * sin tener las marcas.
   */
  let convs = null;
  let error = null;
  for (const extras of [
    IDENTIDAD + MARCAS + PERMISO,
    MARCAS + PERMISO,
    MARCAS,
    "",
  ]) {
    ({ data: convs, error } = await traerConvs(extras));
    if (error?.code !== "42703") break;
  }

  if (error) {
    // PGRST205: la tabla no existe en el esquema todavía.
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, error: error.message };
  }

  const ids = ((convs ?? []) as unknown as Fila[]).map((c) => Number(c.id));
  let mensajes: Mensaje[] = [];

  // Las etiquetas puestas, agrupadas por conversación. Si falta la migración
  // se sigue sin ellas: la bandeja funciona igual, sólo que sin etiquetas.
  const etiquetasPorConv = new Map<number, number[]>();
  if (ids.length) {
    const { data: puestas } = await supabase
      .from("conversacion_etiquetas")
      .select("conversacion_id, etiqueta_id")
      .in("conversacion_id", ids);

    for (const p of (puestas ?? []) as Fila[]) {
      const conv = Number(p.conversacion_id);
      const lista = etiquetasPorConv.get(conv) ?? [];
      lista.push(Number(p.etiqueta_id));
      etiquetasPorConv.set(conv, lista);
    }
  }

  if (ids.length) {
    /*
     * Las reacciones vienen anidadas en la misma consulta.
     *
     * La otra manera sería pedirlas aparte con `in('mensaje_id', […])`, y no
     * entra: acá se traen hasta 4.000 mensajes y esa lista de ids en la
     * dirección daría una URL de decenas de miles de caracteres, que el
     * servidor rechaza antes de mirarla. Anidado va por la clave foránea y no
     * cuesta una consulta más.
     */
    const traer = (conMedia: boolean, conReacciones: boolean) =>
      supabase
        .from("mensajes")
        .select(
          "id, conversacion_id, direccion, tipo, texto, estado, error, creado_en, privado, wa_id" +
            (conMedia ? ", media_ruta, media_mime, media_nombre, media_error" : "") +
            (conReacciones ? ", reacciones(emoji, direccion)" : ""),
        )
        .in("conversacion_id", ids)
        /*
         * Los más NUEVOS, y no los más viejos.
         *
         * ====================================================================
         * ESTO HACÍA DESAPARECER LOS MENSAJES RECIÉN CONTESTADOS
         * ====================================================================
         *
         * Decía `ascending: true` con este mismo tope, o sea que pedía los
         * 4.000 mensajes MÁS ANTIGUOS de la bandeja. Mientras hubo menos de
         * 4.000 en total no se notó: entraban todos.
         *
         * Al pasar ese techo —la escuela lo cruzó con ciento veintitrés
         * conversaciones y varios envíos— la consulta seguía trayendo los
         * primeros 4.000 y dejaba afuera TODO lo nuevo. El síntoma es el peor
         * posible: una asesora contesta, el mensaje sale, el cliente lo recibe,
         * y en el hilo no aparece. Parece que el CRM no hubiera guardado nada.
         *
         * Se piden los últimos y se dan vuelta abajo, porque la pantalla los
         * dibuja del más viejo al más nuevo.
         */
        .order("creado_en", { ascending: false })
        .limit(4000);

    let { data: msgs, error: errMsg } = await traer(true, true);

    /*
     * Dos migraciones opcionales, dos reintentos.
     *
     * PGRST200 es «no existe esa relación»: falta la tabla `reacciones`.
     * 42703 son las columnas de archivos. Cada una se cae por su lado para que
     * faltar una no arrastre a la otra: sin esto, una escuela que corrió la de
     * media pero no la de reacciones se quedaría además sin fotos.
     */
    if (errMsg?.code === "PGRST200") {
      ({ data: msgs, error: errMsg } = await traer(true, false));
    }
    if (errMsg?.code === "42703") {
      ({ data: msgs, error: errMsg } = await traer(false, true));
      if (errMsg?.code === "PGRST200") ({ data: msgs, error: errMsg } = await traer(false, false));
    }

    if (errMsg) return { ...VACIO, error: errMsg.message };

    /*
     * Se dan vuelta: la consulta los trajo del más nuevo al más viejo.
     *
     * El hilo se dibuja en orden de conversación —lo primero arriba— y el resto
     * de la pantalla cuenta con eso. Ordenar acá y no en la consulta es lo que
     * permite pedir los últimos sin cambiar cómo se ven.
     */
    mensajes = comoLosLee(msgs ?? []);
  }

  return {
    conversaciones: ((convs ?? []) as unknown as Fila[]).map((c) => ({
      id: Number(c.id),
      /*
       * Vacío y no «null».
       *
       * `String(null)` da la cadena «null», que en Instagram se mostraría tal
       * cual arriba del hilo: un hilo titulado «null» al lado del nombre de la
       * persona. Un hilo de Instagram no tiene teléfono y eso se dice con nada,
       * que es lo que la pantalla ya sabe esconder.
       */
      telefono: c.telefono ? String(c.telefono) : "",
      // Se cae al teléfono para los hilos guardados antes de la migración: en
      // WhatsApp la identidad ES el número, así que dice lo mismo.
      identificador: c.identificador ? String(c.identificador) : String(c.telefono ?? ""),
      usuario: c.usuario ? String(c.usuario) : null,
      nombrePerfil: c.nombre_perfil ? String(c.nombre_perfil) : null,
      clienteId: c.cliente_id == null ? null : Number(c.cliente_id),
      ultimoMensajeEn: String(c.ultimo_mensaje_en),
      ultimoTexto: c.ultimo_texto ? String(c.ultimo_texto) : null,
      sinLeer: Number(c.sin_leer ?? 0),
      archivada: Boolean(c.archivada),
      // Sin la migración estas tres no vienen, y `undefined` daría false, que
      // es exactamente lo que corresponde: nada fijado, nada silenciado.
      noLeida: Boolean(c.no_leida),
      fijada: Boolean(c.fijada),
      silenciada: Boolean(c.silenciada),
      estado: String(c.estado ?? "open"),
      // Por omisión WhatsApp: es lo que dice la columna y lo que son todas
      // las conversaciones que hay hasta hoy.
      canal: String(c.canal ?? "whatsapp"),
      vendedorId: c.vendedor_id == null ? null : Number(c.vendedor_id),
      // Sin la migración del permiso estas tres vienen `undefined`, y quedan
      // en null: el CRM ofrece pedir el permiso, que es lo correcto cuando no
      // hay forma de saber si lo dio.
      permisoLlamadaHasta: c.llamada_permiso_hasta ? String(c.llamada_permiso_hasta) : null,
      permisoLlamadaPedidoEn: c.llamada_permiso_pedido_en
        ? String(c.llamada_permiso_pedido_en)
        : null,
      permisoLlamadaRespuesta:
        c.llamada_permiso_respuesta === "acepto" || c.llamada_permiso_respuesta === "rechazo"
          ? c.llamada_permiso_respuesta
          : null,
      etiquetaIds: etiquetasPorConv.get(Number(c.id)) ?? [],
    })),
    mensajes,
    faltaMigracion: false,
    error: null,
  };
}

/**
 * Las filas de `mensajes` como las lee la pantalla.
 *
 * ============================================================================
 * POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE `fetchInbox`
 * ============================================================================
 *
 * Porque hay dos caminos que traen mensajes y tienen que dar exactamente lo
 * mismo: la bandeja, que trae los últimos de todos los hilos, y
 * `historialDeConversacion`, que trae los de UNO cuando ése quedó afuera de esa
 * ventana.
 *
 * Con dos copias, agregar un campo en una y no en la otra haría que un mensaje
 * se viera distinto según por dónde llegó —sin foto, sin reacciones, sin
 * acuse— y sólo en las conversaciones viejas, que es donde nadie mira.
 *
 * Recibe las filas ORDENADAS DEL MÁS NUEVO AL MÁS VIEJO, que es como se piden
 * para poder quedarse con las últimas, y las devuelve al revés: la pantalla
 * dibuja el hilo de arriba hacia abajo en orden de conversación.
 */
export function comoLosLee(filas: unknown[]): Mensaje[] {
  return (filas as unknown as Fila[]).reverse().map((m) => ({
    id: Number(m.id),
    conversacionId: Number(m.conversacion_id),
    direccion: m.direccion === "saliente" ? "saliente" : "entrante",
    tipo: String(m.tipo ?? "text"),
    texto: m.texto ? String(m.texto) : null,
    estado: m.estado ? String(m.estado) : null,
    error: m.error ? String(m.error) : null,
    creadoEn: String(m.creado_en),
    privado: Boolean(m.privado),
    // El `wa_id` se lee pero no se manda: al navegador le alcanza con saber
    // si hay a qué reaccionar.
    reaccionable: m.wa_id != null && !m.privado,
    reacciones: (Array.isArray(m.reacciones) ? m.reacciones : []).map((r) => {
      const fila = r as Fila;
      return {
        emoji: String(fila.emoji ?? ""),
        direccion: fila.direccion === "saliente" ? ("saliente" as const) : ("entrante" as const),
      };
    }),
    mediaRuta: m.media_ruta ? String(m.media_ruta) : null,
    mediaMime: m.media_mime ? String(m.media_mime) : null,
    mediaNombre: m.media_nombre ? String(m.media_nombre) : null,
    mediaError: m.media_error ? String(m.media_error) : null,
  }));
}
