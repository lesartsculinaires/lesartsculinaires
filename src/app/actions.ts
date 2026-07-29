"use server";

import { revalidatePath } from "next/cache";

import { getServerClient } from "@/lib/supabase/server";
import type { ClientePatch, EventoPatch, OportunidadPatch } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error: string | null;
}

const NO_SESSION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/**
 * Persist an edit to one opportunity.
 *
 * The UI updates optimistically and calls this in the background; a failure
 * surfaces as a banner rather than rolling the interface back, so a dropped
 * connection never discards what the user just did.
 */
export async function updateOportunidad(
  id: number,
  patch: OportunidadPatch,
): Promise<ActionResult> {
  if (Object.keys(patch).length === 0) return { ok: true, error: null };

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase.from("oportunidades").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Update the client record behind an opportunity.
 *
 * `clientes` is shared across opportunities, so renaming a client or fixing a
 * phone number changes every opportunity that points at it. The drawer says so
 * before the user edits.
 */
export async function updateCliente(
  clienteId: number,
  patch: ClientePatch,
): Promise<ActionResult> {
  if (Object.keys(patch).length === 0) return { ok: true, error: null };

  // The column is `not null`; an empty box would otherwise wipe the name.
  if (patch.nombre !== undefined && patch.nombre.trim() === "") {
    return { ok: false, error: "El nombre del cliente no puede quedar vacío." };
  }

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase
    .from("clientes")
    .update(patch)
    .eq("id", clienteId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Add a note to an opportunity's log. */
export async function addNota(
  oportunidadId: number,
  nota: string,
): Promise<ActionResult> {
  const texto = nota.trim();
  if (!texto) return { ok: true, error: null };

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase
    .from("oportunidad_notas")
    .insert({ oportunidad_id: oportunidadId, nota: texto, origen: "comentario" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

export async function updateEvento(
  id: number,
  patch: EventoPatch,
): Promise<ActionResult> {
  if (Object.keys(patch).length === 0) return { ok: true, error: null };

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase.from("eventos").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

export interface NuevoEvento {
  oportunidad_id: number;
  tipo_id: number;
  vendedor_id: number | null;
  inicia_en: string;
  duracion_min: number;
  canal: string;
}

/** Used by "Nuevo evento" and by the follow-up booked when closing one. */
export async function createEvento(
  evento: NuevoEvento,
): Promise<ActionResult & { id: number | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ...NO_SESSION, id: null };

  const { data, error } = await supabase
    .from("eventos")
    .insert({ ...evento, estado: "Pendiente" })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message, id: null };

  revalidatePath("/");
  return { ok: true, error: null, id: (data as { id: number }).id };
}

export async function signOut(): Promise<void> {
  const supabase = await getServerClient();
  if (supabase) await supabase.auth.signOut();
}
