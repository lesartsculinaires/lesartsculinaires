import "server-only";

import { POR_TANDA, traerTodo } from "@/lib/supabase/paginar";
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
  /*
   * De qué anuncio vino la persona. Es la capa MÁS NUEVA del desarme, así que
   * va primera: entre que se despliega el código y se corre el SQL, la bandeja
   * tiene que seguir mostrando los hilos en vez de quedarse en blanco.
   */
  const ORIGEN = ", origen";
  const MARCAS = ", no_leida, fijada, silenciada";
  const PERMISO =
    ", llamada_permiso_hasta, llamada_permiso_pedido_en, llamada_permiso_respuesta";

  const COLUMNAS =
    "id, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto, " +
    "sin_leer, archivada, estado, vendedor_id, canal";

  /*
   * El orden tiene que ser TOTAL, o sea sin empates.
   *
   * Se pide de a tandas, y cada tanda es una consulta nueva. Dos hilos con el
   * mismo `ultimo_mensaje_en` —dos mensajes de la misma campaña, que salen en
   * el mismo segundo— podrían salir en distinto orden en cada tanda: uno
   * aparecería dos veces y otro ninguna. El `id` al final lo desempata.
   */
  /*
   * El `as` es por el `select` armado como texto.
   *
   * supabase-js deduce el tipo de la fila leyendo la lista de columnas cuando
   * es una constante. Acá se arma sumando lo opcional —según qué migraciones
   * estén corridas— así que no puede, y deduce un tipo de error. Las filas ya
   * se leen como `Fila` y se convierten campo por campo más abajo, que es donde
   * de verdad se comprueba qué vino.
   */
  const traerConvs = (extras: string) =>
    supabase
      .from("conversaciones")
      .select(COLUMNAS + extras)
      .order("ultimo_mensaje_en", { ascending: false })
      .order("id", { ascending: false }) as unknown as {
      range(desde: number, hasta: number): PromiseLike<{
        data: Fila[] | null;
        error: unknown;
      }>;
    };

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
  /*
   * Primero se averigua QUÉ columnas hay, con una consulta de una fila.
   *
   * Antes esta prueba se hacía con la consulta completa, y estaba bien mientras
   * la consulta fuera una sola. Ahora la bandeja se trae de a tandas, y probar
   * las cuatro combinaciones contra cada tanda multiplicaría las consultas sin
   * ganar nada: las columnas que existen no cambian entre una tanda y la
   * siguiente.
   */
  let extras = "";
  let error = null;
  for (const cand of [
    ORIGEN + IDENTIDAD + MARCAS + PERMISO,
    IDENTIDAD + MARCAS + PERMISO,
    MARCAS + PERMISO,
    MARCAS,
    "",
  ]) {
    const prueba = await supabase
      .from("conversaciones")
      .select("id" + cand)
      .limit(1);
    error = prueba.error;
    if (error?.code !== "42703") {
      extras = cand;
      break;
    }
  }

  if (error) {
    // PGRST205: la tabla no existe en el esquema todavía.
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, error: error.message };
  }

  /*
   * ==========================================================================
   * POR QUÉ DE A TANDAS Y NO CON UN `.limit()`
   * ==========================================================================
   *
   * Acá decía `.limit(300)`. Trescientos hilos alcanzaban cuando la escuela
   * tenía ciento veintitrés; con las campañas de reactivación los pasaron, y a
   * partir de ahí los hilos que sobran no se ven en la bandeja. No aparece
   * ningún error: aparece una lista a la que le faltan conversaciones, siempre
   * las de más abajo.
   *
   * Y subir el número no alcanza, porque PostgREST corta en MIL filas por
   * respuesta y no lo dice —está explicado en `paginar.ts`, que existe por
   * exactamente este problema en el pipeline—. `.limit(4000)` devuelve mil.
   *
   * La única forma de traerlas todas es pedir de a tramos, que es lo que hace
   * `traerTodo`.
   */
  const { data: convs, error: errConvs } = await traerTodo<Fila>(() => traerConvs(extras));
  if (errConvs) return { ...VACIO, error: errConvs };

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
    const traer = (conMedia: boolean, conReacciones: boolean, conOrigen = true) =>
      supabase
        .from("mensajes")
        .select(
          "id, conversacion_id, direccion, tipo, texto, estado, error, creado_en, privado, wa_id" +
            (conOrigen ? ", origen" : "") +
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
         *
         * ====================================================================
         * Y POR QUÉ EL NÚMERO ES 900 Y NO 4.000
         * ====================================================================
         *
         * Porque 4.000 era mentira. PostgREST corta en mil filas por respuesta
         * y no avisa, así que esta consulta nunca trajo más de mil mensajes
         * para TODA la bandeja. Repartidos entre trescientos hilos son tres
         * mensajes por hilo, y de ahí salía «los mensajes anteriores no
         * aparecen»: el hilo se veía cortado por la mitad.
         *
         * Un número que miente es peor que uno chico: hace creer que el hueco
         * está en otro lado. 900 es lo que de verdad entra en una respuesta, y
         * ya no es lo que sostiene la conversación abierta —de eso se encarga
         * `historialDeConversacion`, que ahora corre SIEMPRE al abrir un hilo—.
         * Esto quedó sólo para que el hilo se dibuje al instante mientras ese
         * pedido viaja.
         */
        .order("creado_en", { ascending: false })
        .limit(POR_TANDA);

    let { data: msgs, error: errMsg } = await traer(true, true);

    /*
     * La columna del origen es la más nueva, así que se suelta primero.
     *
     * Sin esto, entre el despliegue y la corrida del SQL la bandeja se quedaría
     * SIN NINGÚN MENSAJE: pedir una columna que no existe devuelve 42703 y ese
     * error se lleva la consulta entera. Una tarjeta de marketing no puede
     * costar la bandeja.
     */
    if (errMsg?.code === "42703") {
      ({ data: msgs, error: errMsg } = await traer(true, true, false));
    }

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
      // Nulo mientras no se haya corrido la migración del origen, y nulo en
      // la enorme mayoría: quien escribe por su cuenta no viene de una pauta.
      origen: (c.origen as Conversacion["origen"]) ?? null,
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
    // De qué anuncio vino. Nulo sin la migración y nulo en casi todos.
    origen: (m.origen as Mensaje["origen"]) ?? null,
  }));
}
