import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import type { Conversacion, Mensaje } from "@/lib/types";

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

  const { data: convs, error } = await supabase
    .from("conversaciones")
    .select("id, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto, sin_leer, archivada")
    .order("ultimo_mensaje_en", { ascending: false })
    .limit(300);

  if (error) {
    // PGRST205: la tabla no existe en el esquema todavía.
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, error: error.message };
  }

  const ids = (convs ?? []).map((c) => Number(c.id));
  let mensajes: Mensaje[] = [];

  if (ids.length) {
    const { data: msgs, error: errMsg } = await supabase
      .from("mensajes")
      .select("id, conversacion_id, direccion, tipo, texto, estado, error, creado_en")
      .in("conversacion_id", ids)
      .order("creado_en", { ascending: true })
      .limit(4000);

    if (errMsg) return { ...VACIO, error: errMsg.message };

    mensajes = (msgs ?? []).map((m) => ({
      id: Number(m.id),
      conversacionId: Number(m.conversacion_id),
      direccion: m.direccion === "saliente" ? "saliente" : "entrante",
      tipo: String(m.tipo ?? "text"),
      texto: m.texto ? String(m.texto) : null,
      estado: m.estado ? String(m.estado) : null,
      error: m.error ? String(m.error) : null,
      creadoEn: String(m.creado_en),
    }));
  }

  return {
    conversaciones: (convs ?? []).map((c) => ({
      id: Number(c.id),
      telefono: String(c.telefono),
      nombrePerfil: c.nombre_perfil ? String(c.nombre_perfil) : null,
      clienteId: c.cliente_id == null ? null : Number(c.cliente_id),
      ultimoMensajeEn: String(c.ultimo_mensaje_en),
      ultimoTexto: c.ultimo_texto ? String(c.ultimo_texto) : null,
      sinLeer: Number(c.sin_leer ?? 0),
      archivada: Boolean(c.archivada),
    })),
    mensajes,
    faltaMigracion: false,
    error: null,
  };
}
