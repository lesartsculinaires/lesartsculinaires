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
  const traerConvs = (conMarcas: boolean) =>
    supabase
      .from("conversaciones")
      .select(
        "id, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto, " +
          "sin_leer, archivada, estado, vendedor_id" +
          (conMarcas ? ", no_leida, fijada, silenciada" : ""),
      )
      .order("ultimo_mensaje_en", { ascending: false })
      .limit(300);

  let { data: convs, error } = await traerConvs(true);
  if (error?.code === "42703") ({ data: convs, error } = await traerConvs(false));

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
    const traer = (conMedia: boolean) =>
      supabase
        .from("mensajes")
        .select(
          "id, conversacion_id, direccion, tipo, texto, estado, error, creado_en, privado" +
            (conMedia ? ", media_ruta, media_mime, media_nombre, media_error" : ""),
        )
        .in("conversacion_id", ids)
        .order("creado_en", { ascending: true })
        .limit(4000);

    let { data: msgs, error: errMsg } = await traer(true);

    // 42703: faltan las columnas de archivos, de la migración de media. Se
    // vuelve a pedir sin ellas para que la bandeja siga funcionando entera
    // menos las fotos, en vez de quedarse en blanco.
    if (errMsg?.code === "42703") ({ data: msgs, error: errMsg } = await traer(false));

    if (errMsg) return { ...VACIO, error: errMsg.message };

    mensajes = ((msgs ?? []) as unknown as Fila[]).map((m) => ({
      id: Number(m.id),
      conversacionId: Number(m.conversacion_id),
      direccion: m.direccion === "saliente" ? "saliente" : "entrante",
      tipo: String(m.tipo ?? "text"),
      texto: m.texto ? String(m.texto) : null,
      estado: m.estado ? String(m.estado) : null,
      error: m.error ? String(m.error) : null,
      creadoEn: String(m.creado_en),
      privado: Boolean(m.privado),
      mediaRuta: m.media_ruta ? String(m.media_ruta) : null,
      mediaMime: m.media_mime ? String(m.media_mime) : null,
      mediaNombre: m.media_nombre ? String(m.media_nombre) : null,
      mediaError: m.media_error ? String(m.media_error) : null,
    }));
  }

  return {
    conversaciones: ((convs ?? []) as unknown as Fila[]).map((c) => ({
      id: Number(c.id),
      telefono: String(c.telefono),
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
      vendedorId: c.vendedor_id == null ? null : Number(c.vendedor_id),
      etiquetaIds: etiquetasPorConv.get(Number(c.id)) ?? [],
    })),
    mensajes,
    faltaMigracion: false,
    error: null,
  };
}
