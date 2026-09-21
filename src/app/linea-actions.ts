"use server";

import { getServerClient } from "@/lib/supabase/server";

/**
 * La conversación completa de una persona, cruzando canales.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA, SI LA BANDEJA YA MUESTRA LOS HILOS
 * ============================================================================
 *
 * Porque la bandeja muestra UN hilo a la vez, y un hilo es de un canal. Alguien
 * que preguntó el precio por Instagram el martes y volvió por WhatsApp el jueves
 * tiene dos hilos, y quien lo atiende hoy ve uno de los dos: contesta como si
 * fuera la primera vez, o repite lo que ya se dijo.
 *
 * Una vez que las fichas están bien unificadas —que es lo que resuelve la cola
 * de duplicados— esto es lo que hace que esa unificación sirva para algo: la
 * conversación entera de esa persona, en orden, sin importar por dónde entró
 * cada pedazo.
 *
 * ============================================================================
 * POR QUÉ NO SE GUARDA «PRIMER CONTACTO» COMO CAMPO
 * ============================================================================
 *
 * Se calcula. `contactos_canal` tiene una fecha por canal y sirve para «por
 * dónde entró», pero el primer y el último contacto de la PERSONA salen de los
 * mensajes, que es donde está la verdad.
 *
 * Guardarlos como campo obligaría a mantenerlos al día en cada mensaje, en cada
 * fusión y en cada importación, y el día que uno de esos tres caminos se olvide,
 * la ficha va a decir una fecha que no es. Calcularlo cuesta una consulta y no
 * puede quedar desincronizado.
 */

/** Una interacción, de cualquier canal. */
export interface Interaccion {
  id: number;
  /** «whatsapp», «instagram», «messenger». */
  canal: string;
  /** Quién habló: `entrante` es la persona, `saliente` el equipo. */
  direccion: string;
  /** El texto, o null cuando fue una foto o un audio. */
  texto: string | null;
  tipo: string;
  cuando: string;
  /** Una nota interna del equipo, que no salió a ningún lado. */
  privado: boolean;
}

export interface ResultadoLinea {
  ok: boolean;
  error: string | null;
  interacciones: Interaccion[];
  /** Cuántas hay en total, aunque se devuelvan menos. */
  total: number;
  /** El primero y el último mensaje, de cualquier canal. Calculados. */
  primerContacto: string | null;
  ultimoContacto: string | null;
  faltaMigracion: boolean;
}

const VACIO: ResultadoLinea = {
  ok: true,
  error: null,
  interacciones: [],
  total: 0,
  primerContacto: null,
  ultimoContacto: null,
  faltaMigracion: false,
};

/**
 * Las últimas interacciones de esta persona, de todos sus canales.
 *
 * ----------------------------------------------------------------------------
 * SE TRAEN LAS ÚLTIMAS, NO LAS PRIMERAS
 * ----------------------------------------------------------------------------
 *
 * Y después se dan vuelta para mostrarlas en orden. Un cliente de hace dos años
 * puede tener seiscientos mensajes; traer los primeros cien dejaría fuera
 * justamente lo que hace falta para contestar hoy.
 *
 * El total se cuenta aparte para poder decir «hay 412 en total» sin traerlas: es
 * la diferencia entre una ficha que abre y una que se queda pensando.
 */
export async function lineaDeTiempo(clienteId: number, tope = 80): Promise<ResultadoLinea> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...VACIO, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  /*
   * Primero los hilos de la persona, después sus mensajes.
   *
   * En dos pasos y no con un `join` porque el canal vive en la conversación y el
   * mensaje no lo repite: con el join habría que pedir la conversación anidada
   * en cada fila y PostgREST la devuelve entera, que son muchos más bytes por
   * cada mensaje para un dato que se repite.
   */
  const { data: hilos, error: errHilos } = await supabase
    .from("conversaciones")
    .select("id, canal")
    .eq("cliente_id", clienteId);

  if (errHilos) {
    if (errHilos.code === "PGRST205" || errHilos.code === "42P01") {
      return { ...VACIO, faltaMigracion: true };
    }
    return { ...VACIO, ok: false, error: errHilos.message };
  }

  const canalDe = new Map(
    ((hilos ?? []) as Record<string, unknown>[]).map((h) => [
      Number(h.id),
      String(h.canal ?? "whatsapp"),
    ]),
  );

  if (canalDe.size === 0) return VACIO;
  const ids = [...canalDe.keys()];

  // El total, sin traer las filas.
  const { count } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .in("conversacion_id", ids);

  /*
   * El orden es `creado_en desc, id desc`, y el `id` no sobra.
   *
   * Dos mensajes pueden compartir la marca de tiempo al segundo —pasa cuando
   * alguien manda tres globos seguidos y Meta los entrega juntos—. Sin un
   * desempate, el orden entre ellos cambia de una consulta a otra y la
   * conversación se lee distinta cada vez que se abre la ficha.
   */
  /*
   * Una sola consulta con tope, sin paginar.
   *
   * `traerTodo` existe para las listas que pueden pasar de mil filas —PostgREST
   * las corta en silencio ahí— y acá el tope es ochenta. Paginar sería traer lo
   * mismo en más viajes.
   */
  const { data: filas, error } = await supabase
    .from("mensajes")
    .select("id, conversacion_id, direccion, tipo, texto, creado_en, privado")
    .in("conversacion_id", ids)
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(tope);

  if (error) return { ...VACIO, ok: false, error: error.message };

  const interacciones: Interaccion[] = ((filas ?? []) as Record<string, unknown>[])
    .map((m) => ({
      id: Number(m.id),
      canal: canalDe.get(Number(m.conversacion_id)) ?? "whatsapp",
      direccion: String(m.direccion ?? "entrante"),
      texto: m.texto ? String(m.texto) : null,
      tipo: String(m.tipo ?? "text"),
      cuando: String(m.creado_en),
      privado: Boolean(m.privado),
    }))
    // Se dan vuelta: se pidieron las últimas, se leen en orden.
    .reverse();

  /*
   * El primer contacto sale de la base, no del pedazo que se trajo.
   *
   * Con el tope puesto, el más viejo de los ochenta que vinieron no es el
   * primero de la persona. Decir que sí sería mostrar una fecha equivocada en el
   * lugar donde más se mira.
   */
  const { data: masViejo } = await supabase
    .from("mensajes")
    .select("creado_en")
    .in("conversacion_id", ids)
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    ...VACIO,
    interacciones,
    total: count ?? interacciones.length,
    primerContacto: masViejo?.creado_en ? String(masViejo.creado_en) : null,
    ultimoContacto:
      interacciones.length > 0 ? interacciones[interacciones.length - 1].cuando : null,
  };
}
