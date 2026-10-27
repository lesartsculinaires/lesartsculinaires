"use server";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Los filtros «Base» y «Envío masivo» del Inbox.
 *
 * Pedido el 27/10/2026 para el área académica: Sussy sube una base, le manda
 * un masivo, y necesita ver juntas las respuestas de esa gente sin que se le
 * mezclen con el trabajo diario de ventas —ni que a ventas se le mezclen las
 * suyas—. No se esconde ningún chat: un número de WhatsApp es una sola
 * conversación, y si esa persona también es cliente de una asesora, la asesora
 * la sigue viendo. Los filtros sólo recortan la lista de quien los pone.
 *
 * La base se resuelve en la pantalla, con los leads que ya tiene cargados. El
 * envío se pide acá porque sus destinatarios no viajan con la bandeja.
 */

export interface OpcionDeFiltro {
  id: number;
  nombre: string;
  creadoEn: string;
}

/** Las bases subidas y los envíos masivos, los más nuevos primero. */
export async function listasParaFiltrarLaBandeja(): Promise<{
  bases: OpcionDeFiltro[];
  envios: OpcionDeFiltro[];
}> {
  const supabase = await getServerClient();
  if (!supabase) return { bases: [], envios: [] };

  const [b, e] = await Promise.all([
    supabase.from("importaciones").select("id, archivo, creado_en").order("creado_en", { ascending: false }).limit(200),
    supabase.from("envios").select("id, nombre, creado_en, estado").order("creado_en", { ascending: false }).limit(200),
  ]);

  return {
    // Si falta alguna de las dos tablas —falta la migración—, ese filtro no
    // aparece y el otro sí.
    bases: b.error
      ? []
      : (b.data ?? []).map((r) => ({
          id: Number(r.id),
          nombre: String(r.archivo ?? `Base ${r.id}`),
          creadoEn: String(r.creado_en ?? ""),
        })),
    envios: e.error
      ? []
      : (e.data ?? [])
          // Un borrador todavía no le llegó a nadie: no hay respuestas que mirar.
          .filter((r) => r.estado !== "borrador")
          .map((r) => ({
            id: Number(r.id),
            nombre: String(r.nombre ?? `Envío ${r.id}`),
            creadoEn: String(r.creado_en ?? ""),
          })),
  };
}

/**
 * Los contactos a los que les salió un envío.
 *
 * Los omitidos quedan afuera: a ellos no se les mandó nada, así que no hay
 * respuesta de ese envío que buscar en su chat.
 */
export async function clientesDelEnvio(
  envioId: number,
): Promise<{ ok: boolean; error: string | null; clienteIds: number[] }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión.", clienteIds: [] };

  const ids = new Set<number>();
  for (let desde = 0; desde < 50000; desde += 1000) {
    const { data, error } = await supabase
      .from("envio_destinatarios")
      .select("cliente_id")
      .eq("envio_id", envioId)
      .neq("estado", "omitido")
      .order("id")
      .range(desde, desde + 999);
    if (error) return { ok: false, error: error.message, clienteIds: [] };
    for (const r of data ?? []) ids.add(Number(r.cliente_id));
    if ((data ?? []).length < 1000) break;
  }
  return { ok: true, error: null, clienteIds: [...ids] };
}
