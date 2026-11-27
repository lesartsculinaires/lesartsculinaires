"use server";

/**
 * Entrenamiento de Mathieu desde el CRM (27/11/2026, LAC).
 *
 * Raquel y Alexandra eligen un lead que contestó Mathieu, marcan el mensaje que
 * no les gustó y escriben cómo quieren que conteste. Dirección (los
 * administradores) lo aprueba y pasa a `agente_casos`, que es lo que Mathieu
 * consulta antes de responder.
 *
 * Todo va por funciones de la base (`20261207120000_entrenamiento_agente.sql`)
 * que revisan el permiso adentro: acá sólo se llaman y se traducen los errores.
 * Una base sin la migración —HC, o LAC antes de correrla— contesta «no puede»
 * y la bandeja sigue igual, sin la fila fija.
 */
import { getServerClient } from "@/lib/supabase/server";

export interface ResumenEntrenamiento {
  puede: boolean;
  admin: boolean;
  porAprobar: number;
  miosPendientes: number;
  miosDevueltos: number;
  ultimo: { estado: string; situacion: string; quien: string | null; en: string } | null;
}

export interface ChatConMathieu {
  conversacionId: number;
  nombre: string;
  canal: string;
  mensajesAgente: number;
  ultimo: string | null;
  conAlerta: boolean;
}

export interface MensajeParaMarcar {
  id: number;
  direccion: "entrante" | "saliente";
  tipo: string;
  texto: string | null;
  creadoEn: string;
  deAgente: boolean;
}

export interface Escenario {
  escenario: number;
  nombre: string;
}

export interface EjemploEnviado {
  id: number;
  conversacionId: number | null;
  cliente: string | null;
  textoAgente: string;
  textoCliente: string | null;
  respuestaDeseada: string;
  situacion: string;
  escenario: number | null;
  estado: "pendiente" | "aprobado" | "devuelto" | "descartado";
  creadoPor: string | null;
  creadoEn: string;
  revisadoPor: string | null;
  revisadoEn: string | null;
  nota: string | null;
  mio: boolean;
}

const NO_PUEDE: ResumenEntrenamiento = {
  puede: false,
  admin: false,
  porAprobar: 0,
  miosPendientes: 0,
  miosDevueltos: 0,
  ultimo: null,
};

/** El mensaje de la base, sin el «CONTEXT:» ni el código: lo escribimos para leerse. */
const claro = (e: { message?: string } | null | undefined, porDefecto: string) =>
  (e?.message ?? porDefecto).split("\n")[0];

export async function resumenEntrenamiento(): Promise<ResumenEntrenamiento> {
  const supabase = await getServerClient();
  if (!supabase) return NO_PUEDE;
  const { data, error } = await supabase.rpc("agente_entrenamiento_resumen");
  if (error || !data) return NO_PUEDE;
  const d = data as Record<string, unknown>;
  if (d.puede !== true) return NO_PUEDE;
  const u = d.ultimo as Record<string, unknown> | null;
  return {
    puede: true,
    admin: d.admin === true,
    porAprobar: Number(d.por_aprobar ?? 0),
    miosPendientes: Number(d.mios_pendientes ?? 0),
    miosDevueltos: Number(d.mios_devueltos ?? 0),
    ultimo: u
      ? {
          estado: String(u.estado ?? ""),
          situacion: String(u.situacion ?? ""),
          quien: u.quien ? String(u.quien) : null,
          en: String(u.en ?? ""),
        }
      : null,
  };
}

export async function chatsConMathieu(
  dias: number,
): Promise<{ chats: ChatConMathieu[]; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { chats: [], error: "Sin sesión." };
  const { data, error } = await supabase.rpc("agente_entrenamiento_chats", { p_dias: dias });
  if (error) return { chats: [], error: claro(error, "No se pudieron traer los chats.") };
  return {
    chats: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      conversacionId: Number(c.conversacion_id),
      nombre: String(c.nombre ?? "Sin nombre"),
      canal: String(c.canal ?? "whatsapp"),
      mensajesAgente: Number(c.mensajes_agente ?? 0),
      ultimo: c.ultimo ? String(c.ultimo) : null,
      conAlerta: c.con_alerta === true,
    })),
    error: null,
  };
}

export async function mensajesParaMarcar(
  conversacionId: number,
): Promise<{ mensajes: MensajeParaMarcar[]; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { mensajes: [], error: "Sin sesión." };
  const { data, error } = await supabase.rpc("agente_entrenamiento_mensajes", {
    p_conversacion: conversacionId,
  });
  if (error) return { mensajes: [], error: claro(error, "No se pudieron traer los mensajes.") };
  return {
    mensajes: ((data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: Number(m.id),
      direccion: m.direccion === "saliente" ? "saliente" : "entrante",
      tipo: String(m.tipo ?? "text"),
      texto: m.texto ? String(m.texto) : null,
      creadoEn: String(m.creado_en),
      deAgente: m.de_agente === true,
    })),
    error: null,
  };
}

export async function escenariosDelAgente(): Promise<Escenario[]> {
  const supabase = await getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("agente_escenarios");
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    escenario: Number(e.escenario),
    nombre: String(e.nombre ?? ""),
  }));
}

export async function enviarEjemplo(datos: {
  conversacionId: number;
  mensajeIds: number[];
  respuesta: string;
  situacion: string;
  escenario: number | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sin sesión." };
  const { error } = await supabase.rpc("agente_ejemplo_enviar", {
    p_conversacion: datos.conversacionId,
    p_mensajes: datos.mensajeIds,
    p_respuesta: datos.respuesta,
    p_situacion: datos.situacion,
    p_escenario: datos.escenario,
  });
  if (error) return { ok: false, error: claro(error, "No se pudo enviar.") };
  return { ok: true, error: null };
}

export async function ejemplosEnviados(): Promise<{ ejemplos: EjemploEnviado[]; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ejemplos: [], error: "Sin sesión." };
  const { data, error } = await supabase.rpc("agente_ejemplos_lista");
  if (error) return { ejemplos: [], error: claro(error, "No se pudieron traer los ejemplos.") };
  return {
    ejemplos: ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: Number(e.id),
      conversacionId: e.conversacion_id == null ? null : Number(e.conversacion_id),
      cliente: e.cliente ? String(e.cliente) : null,
      textoAgente: String(e.texto_agente ?? ""),
      textoCliente: e.texto_cliente ? String(e.texto_cliente) : null,
      respuestaDeseada: String(e.respuesta_deseada ?? ""),
      situacion: String(e.situacion ?? ""),
      escenario: e.escenario == null ? null : Number(e.escenario),
      estado: (["pendiente", "aprobado", "devuelto", "descartado"].includes(String(e.estado))
        ? String(e.estado)
        : "pendiente") as EjemploEnviado["estado"],
      creadoPor: e.creado_por_nombre ? String(e.creado_por_nombre) : null,
      creadoEn: String(e.creado_en),
      revisadoPor: e.revisado_por_nombre ? String(e.revisado_por_nombre) : null,
      revisadoEn: e.revisado_en ? String(e.revisado_en) : null,
      nota: e.nota_revision ? String(e.nota_revision) : null,
      mio: e.mio === true,
    })),
    error: null,
  };
}

export async function revisarEjemplo(datos: {
  id: number;
  accion: "aprobar" | "devolver" | "descartar";
  respuesta?: string;
  situacion?: string;
  escenario?: number | null;
  nota?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sin sesión." };
  const { error } = await supabase.rpc("agente_ejemplo_revisar", {
    p_id: datos.id,
    p_accion: datos.accion,
    p_respuesta: datos.respuesta ?? null,
    p_situacion: datos.situacion ?? null,
    p_escenario: datos.escenario ?? null,
    p_nota: datos.nota ?? null,
  });
  if (error) return { ok: false, error: claro(error, "No se pudo guardar la revisión.") };
  return { ok: true, error: null };
}
