import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BALDE_WHATSAPP } from "@/lib/whatsapp/adjuntos";

/**
 * Borrar lo que tenemos de alguien que escribió por Instagram.
 *
 * ============================================================================
 * ESTE SÍ BORRA — Y POR ESO HAY QUE SER MUY PRECISO CON QUÉ
 * ============================================================================
 *
 * El otro aviso de Meta —desautorizar— significa «dejá de usar mi token» y no
 * toca ni un mensaje. Éste significa «borrá lo que tengas mío», y entonces la
 * pregunta difícil no es cómo borrar sino QUÉ.
 *
 * Lo que llegó de Meta no admite discusión: la conversación, sus mensajes, los
 * archivos que se mandaron en ella, y la anotación de que esa persona llegó por
 * Instagram. Todo eso se borra.
 *
 * ============================================================================
 * LO QUE NO SE BORRA SOLO, Y POR QUÉ
 * ============================================================================
 *
 * La FICHA COMERCIAL —el cliente y su oportunidad—. El CRM la crea sola cuando
 * alguien escribe por primera vez, así que muchas veces nació de esta misma
 * conversación; pero desde que nació pudo haberse llenado de cosas que no vinieron
 * de Meta: un teléfono que la persona dictó por otro lado, el programa que le
 * interesa, notas de la asesora, un pago.
 *
 * Borrarla automáticamente desde un webhook, sin vuelta atrás, es una decisión
 * más grande de la que este camino puede tomar solo. Y no borrarla y callarse
 * sería peor. Así que se hace lo único honesto: se borra todo lo de Meta, se
 * mira si esa ficha existe SÓLO por Instagram, y si es así el pedido queda como
 * `parcial` con el número de ficha anotado, para que una persona decida.
 *
 * De ahí salen los tres estados que la tabla ya tenía previstos:
 *
 *   sin_datos    No había nada de esa persona. Pasa seguido: Meta avisa de
 *                gente que nunca escribió.
 *   completada   Se borró todo lo de Meta y la ficha que queda tiene vida
 *                propia —llegó también por otro canal—, así que no es dato
 *                suyo.
 *   parcial      Se borró todo lo de Meta y quedó una ficha que existe sólo por
 *                esto. Hay algo que decidir.
 */

/**
 * ¿Esta ficha tiene rastro de que hubo plata de por medio?
 *
 * Tres señales, y con cualquiera alcanza. Ante la duda —una consulta que falla—
 * contesta que SÍ: equivocarse hacia «no se borra» deja trabajo para una
 * persona, y equivocarse hacia «se borra» destruye un registro contable sin
 * vuelta atrás. No son errores comparables.
 */
async function tieneRastroComercial(
  admin: SupabaseClient,
  clienteId: number,
): Promise<boolean> {
  try {
    const { data: ops } = await admin
      .from("oportunidades")
      .select("id, venta_cerrada")
      .eq("cliente_id", clienteId);

    const oportunidades = (ops ?? []) as Record<string, unknown>[];
    /*
     * `venta_cerrada` es un MONTO, no un sí/no.
     *
     * Parece un booleano por el nombre y no lo es: guarda cuánto se cerró
     * —130.00, 490.00—. Comprobarlo con `=== true` no se cumple nunca, así que
     * una ficha con una venta hecha se habría borrado igual. Lo encontró la
     * prueba, con la base rechazando un `true` sobre una columna numérica.
     */
    if (oportunidades.some((o) => Number(o.venta_cerrada ?? 0) > 0)) return true;

    const { data: cursos } = await admin
      .from("cursos_realizados")
      .select("cliente_id")
      .eq("cliente_id", clienteId)
      .limit(1);
    if ((cursos ?? []).length > 0) return true;

    const ids = oportunidades.map((o) => Number(o.id)).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const { data: pagos } = await admin
        .from("enlaces_pago")
        .select("oportunidad_id")
        .in("oportunidad_id", ids)
        .limit(1);
      if ((pagos ?? []).length > 0) return true;
    }

    return false;
  } catch {
    return true;
  }
}

/** El canal de Instagram en el catálogo. */
const CANAL_INSTAGRAM = 1;

export type EstadoDelPedido = "sin_datos" | "completada" | "parcial";

export interface LoBorrado {
  estado: EstadoDelPedido;
  /** Para la columna `notas`: una línea que se le pueda mostrar a alguien. */
  notas: string;
  /** Para `detalle`: los números y las fichas que quedaron por decidir. */
  detalle: Record<string, unknown>;
}

/**
 * Borra lo que vino de Instagram para este identificador.
 *
 * Nunca lanza, por lo mismo que el otro aviso: Meta reintenta ante un error y
 * termina desactivando el callback. Lo que no se pudo hacer queda en el detalle
 * y el pedido no se marca como completado.
 */
export async function eliminarDatosDeInstagram(
  admin: SupabaseClient,
  igsid: string,
): Promise<LoBorrado> {
  const quien = String(igsid ?? "").trim();
  if (quien === "") {
    return {
      estado: "sin_datos",
      notas: "Llegó un pedido sin identificador.",
      detalle: { problemas: ["sin identificador"] },
    };
  }

  const problemas: string[] = [];

  // ── qué hay de esta persona ───────────────────────────────────────────────
  let hilos: { id: number; clienteId: number | null }[] = [];
  try {
    const { data, error } = await admin
      .from("conversaciones")
      .select("id, cliente_id")
      .eq("canal", "instagram")
      .eq("identificador", quien);

    if (error) problemas.push(`buscar conversaciones: ${error.message}`);
    else {
      hilos = (data ?? []).map((c) => ({
        id: Number((c as Record<string, unknown>).id),
        clienteId:
          (c as Record<string, unknown>).cliente_id == null
            ? null
            : Number((c as Record<string, unknown>).cliente_id),
      }));
    }
  } catch (e) {
    problemas.push(`buscar conversaciones: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (hilos.length === 0) {
    return {
      estado: problemas.length > 0 ? "parcial" : "sin_datos",
      notas:
        problemas.length > 0
          ? "No se pudo comprobar qué había. Hay que revisarlo a mano."
          : "No había ninguna conversación de Instagram con ese identificador.",
      detalle: { conversaciones: 0, ...(problemas.length > 0 ? { problemas } : {}) },
    };
  }

  const ids = hilos.map((h) => h.id);
  const clientes = [...new Set(hilos.map((h) => h.clienteId).filter((v): v is number => v != null))];

  /*
   * Los archivos del balde, ANTES de borrar los mensajes.
   *
   * Es lo único que no se va solo: la base borra en cascada las filas, pero los
   * archivos viven en el almacenamiento y quedarían ahí para siempre. Si se
   * leyeran después de borrar, ya no habría de dónde sacar las rutas.
   */
  let rutas: string[] = [];
  let cuantosMensajes = 0;
  try {
    const { data, error } = await admin
      .from("mensajes")
      .select("id, media_ruta")
      .in("conversacion_id", ids);

    if (error) problemas.push(`leer mensajes: ${error.message}`);
    else {
      cuantosMensajes = (data ?? []).length;
      rutas = (data ?? [])
        .map((m) => (m as Record<string, unknown>).media_ruta)
        .filter((r): r is string => typeof r === "string" && r.trim() !== "");
    }
  } catch (e) {
    problemas.push(`leer mensajes: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (rutas.length > 0) {
    try {
      const { error } = await admin.storage.from(BALDE_WHATSAPP).remove(rutas);
      if (error) problemas.push(`borrar archivos: ${error.message}`);
    } catch (e) {
      problemas.push(`borrar archivos: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── por dónde llegó: la anotación del canal ──────────────────────────────
  if (clientes.length > 0) {
    try {
      const { error } = await admin
        .from("contactos_canal")
        .delete()
        .in("cliente_id", clientes)
        .eq("canal_id", CANAL_INSTAGRAM);
      if (error) problemas.push(`contactos_canal: ${error.message}`);
    } catch (e) {
      problemas.push(`contactos_canal: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /*
   * Y las conversaciones, que se llevan en cascada todo lo que cuelga:
   * mensajes, reacciones, etiquetas del hilo y llamadas. Está declarado así en
   * las migraciones, no es una suposición.
   */
  let borradas = 0;
  try {
    const { data, error } = await admin
      .from("conversaciones")
      .delete()
      .in("id", ids)
      .select("id");

    if (error) problemas.push(`borrar conversaciones: ${error.message}`);
    else borradas = (data ?? []).length;
  } catch (e) {
    problemas.push(`borrar conversaciones: ${e instanceof Error ? e.message : String(e)}`);
  }

  /*
   * ¿Quedó alguna ficha que existía SÓLO por esto? Entonces se borra.
   *
   * ==========================================================================
   * SE PREGUNTA DESPUÉS DE BORRAR, Y NO ES UN DETALLE
   * ==========================================================================
   *
   * Si al cliente no le queda ninguna otra conversación ni ninguna otra
   * anotación de canal, lo único que lo trajo al CRM fue este Instagram. O sea
   * que su ficha es, entera, un dato derivado de Meta, y quien pidió el borrado
   * tiene razón en esperar que se vaya.
   *
   * ==========================================================================
   * LA ÚNICA EXCEPCIÓN: EL RASTRO COMERCIAL
   * ==========================================================================
   *
   * Borrar una ficha arrastra veinte tablas, y tres de ellas no son datos de
   * Meta sino registro de lo que pasó entre esa persona y la escuela:
   *
   *   enlaces_pago        le cobraron
   *   cursos_realizados   cursó
   *   venta_cerrada       la venta se concretó
   *
   * Eso la escuela lo tiene que conservar por contabilidad, y un webhook no
   * puede decidir destruirlo. Cuando aparece cualquiera de los tres, la ficha se
   * conserva, el pedido queda `parcial` y se dice por qué, para que una persona
   * lo resuelva como corresponda —anonimizar, archivar, lo que su contador
   * diga—.
   *
   * Sin ninguno de los tres, la ficha es un lead que chateó y nada más: se
   * borra, que es lo que pidió la escuela.
   */
  const porDecidir: number[] = [];
  const fichasBorradas: number[] = [];

  for (const clienteId of clientes) {
    try {
      const [otros, canales] = await Promise.all([
        admin.from("conversaciones").select("id").eq("cliente_id", clienteId).limit(1),
        admin.from("contactos_canal").select("cliente_id").eq("cliente_id", clienteId).limit(1),
      ]);
      const quedaOtraConversacion = (otros.data ?? []).length > 0;
      const quedaOtroCanal = (canales.data ?? []).length > 0;
      if (quedaOtraConversacion || quedaOtroCanal) continue;

      if (await tieneRastroComercial(admin, clienteId)) {
        porDecidir.push(clienteId);
        continue;
      }

      const { error } = await admin.from("clientes").delete().eq("id", clienteId);
      if (error) {
        problemas.push(`borrar ficha ${clienteId}: ${error.message}`);
        porDecidir.push(clienteId);
      } else fichasBorradas.push(clienteId);
    } catch (e) {
      problemas.push(`revisar ficha ${clienteId}: ${e instanceof Error ? e.message : String(e)}`);
      porDecidir.push(clienteId);
    }
  }

  const detalle: Record<string, unknown> = {
    conversaciones: borradas,
    mensajes: cuantosMensajes,
    archivos: rutas.length,
    clientes: clientes.length,
    ...(fichasBorradas.length > 0 ? { fichas_borradas: fichasBorradas } : {}),
    ...(porDecidir.length > 0 ? { fichas_por_decidir: porDecidir } : {}),
    ...(problemas.length > 0 ? { problemas } : {}),
  };

  if (problemas.length > 0) {
    return {
      estado: "parcial",
      notas:
        "Se borró lo que se pudo, pero algo falló. Revisá el detalle: queda trabajo a mano.",
      detalle,
    };
  }

  const base =
    `Se borró la conversación de Instagram, sus ${cuantosMensajes} mensaje(s) y sus archivos` +
    (fichasBorradas.length > 0
      ? `, y ${fichasBorradas.length} ficha(s) de cliente que existían sólo por este contacto`
      : "") +
    ".";

  if (porDecidir.length > 0) {
    return {
      estado: "parcial",
      notas:
        `${base} Queda ${porDecidir.length} ficha(s) (${porDecidir.join(", ")}) que NO se borró ` +
        "porque tiene rastro comercial —un cobro, un curso cursado o una venta cerrada— y eso la " +
        "escuela lo conserva por contabilidad. Hay que resolverla a mano.",
      detalle,
    };
  }

  return {
    estado: "completada",
    notas:
      `${base}` +
      (fichasBorradas.length === 0 ? " La ficha del cliente, si la hay, llegó también por otro canal." : ""),
    detalle,
  };
}
