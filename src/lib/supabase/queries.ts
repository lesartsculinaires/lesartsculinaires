import "server-only";

import { CLIENTES } from "@/data/clientes";
import { getServerClient } from "@/lib/supabase/server";
import { SELECT_LIST, TABLE, toCliente } from "@/lib/supabase/leads";
import type { Cliente } from "@/lib/types";

export interface LeadsResult {
  clientes: Cliente[];
  /** False when the seed data was used instead of the database. */
  live: boolean;
  /** Set when a configured database was reachable but the query failed. */
  error: string | null;
}

/**
 * Load every lead.
 *
 * Falls back to the bundled seed records when Supabase is not configured or
 * the query fails, so the CRM always renders something usable. The banner in
 * the UI tells the user which source is in play.
 */
export async function fetchClientes(): Promise<LeadsResult> {
  const supabase = getServerClient();
  if (!supabase) {
    return { clientes: [...CLIENTES], live: false, error: null };
  }

  const { data, error } = await supabase.from(TABLE).select(SELECT_LIST);

  if (error) {
    return { clientes: [...CLIENTES], live: false, error: error.message };
  }

  // SELECT_LIST is built at runtime, so the client cannot infer the row shape.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return { clientes: [], live: true, error: null };
  }

  // Newest first, matching the order the seed data ships in.
  const clientes = rows
    .map(toCliente)
    .sort((a, b) => b.id.localeCompare(a.id));

  return { clientes, live: true, error: null };
}
