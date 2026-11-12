import "server-only";

import { MODO_UNIFICADO } from "@/lib/marcas";
import { getServerClient } from "@/lib/supabase/server";

/**
 * ¿Ve «Ambas marcas» en crm-peñagroup? (12/11/2026)
 *
 * La misma puerta que el sitio de Dirección (tablero-comercial): se pregunta
 * en LAC, con la sesión de quien entra, `puede_ver_sitio_de_direccion()`.
 * Dice que sí a los administradores y a los roles con la casilla «Ver el
 * sitio de Dirección (LAC + HC)» (Usuarios y Roles → Tablero Comercial, en el
 * CRM de LAC). Un solo permiso para las dos puertas: quien ve una ve la otra.
 *
 * Fuera de crm-peñagroup, o sin sesión en LAC, no.
 */
export async function puedeVerAmbas(): Promise<{ puede: boolean; email: string | null; motivo?: string }> {
  if (!MODO_UNIFICADO) return { puede: false, email: null };
  const lac = await getServerClient("lac");
  if (!lac) return { puede: false, email: null, motivo: "Falta configurar la conexión con LAC." };
  const { data } = await lac.auth.getUser();
  const user = data?.user ?? null;
  if (!user) return { puede: false, email: null, motivo: "sin-sesion-lac" };
  const { data: puede, error } = await lac.rpc("puede_ver_sitio_de_direccion");
  if (error) return { puede: false, email: user.email ?? null, motivo: error.message };
  return { puede: puede === true, email: user.email ?? null };
}
