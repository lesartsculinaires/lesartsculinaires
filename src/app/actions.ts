"use server";

import { NUEVO_CLIENTE_BASE } from "@/data/clientes";
import { ID_COLUMN, TABLE, toRow } from "@/lib/supabase/leads";
import { getServerClient } from "@/lib/supabase/server";
import type { Cliente, ClientePatch } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  /** True when the write was skipped because Supabase is not configured. */
  skipped: boolean;
  error: string | null;
}

const skipped: ActionResult = { ok: true, skipped: true, error: null };

/**
 * Persist an edit to one lead.
 *
 * The UI updates optimistically and calls this in the background; a failure
 * surfaces as a banner rather than rolling the interface back, so a dropped
 * connection never discards what the user typed.
 */
export async function updateCliente(
  id: string,
  patch: ClientePatch,
): Promise<ActionResult> {
  const supabase = getServerClient();
  if (!supabase) return skipped;

  const payload = toRow(patch);
  if (Object.keys(payload).length === 0) {
    return { ok: true, skipped: false, error: null };
  }

  const { error } = await supabase.from(TABLE).update(payload).eq(ID_COLUMN, id);

  return error
    ? { ok: false, skipped: false, error: error.message }
    : { ok: true, skipped: false, error: null };
}

/** Insert a blank lead so the "Agregar" button creates a real row. */
export async function createCliente(id: string): Promise<ActionResult> {
  const supabase = getServerClient();
  if (!supabase) return skipped;

  const nuevo: Cliente = { id, ...NUEVO_CLIENTE_BASE };
  const { error } = await supabase.from(TABLE).insert(toRow(nuevo));

  return error
    ? { ok: false, skipped: false, error: error.message }
    : { ok: true, skipped: false, error: null };
}
