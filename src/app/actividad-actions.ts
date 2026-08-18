"use server";

import { getServerClient } from "@/lib/supabase/server";
import type { Evento } from "@/lib/actividad";

/**
 * El registro de actividad, para el panel de la campana.
 *
 * Quién ve qué lo decide la base: la política de `actividad` deja que ventas
 * vea lo suyo y que dirección vea todo. Acá no hay ningún `if` sobre el rol, y
 * es a propósito: si la regla viviera en esta consulta, cualquier otra pantalla
 * que leyera la tabla mañana se saltaría el filtro sin que nadie lo note.
 */

export interface ResultadoActividad {
  ok: boolean;
  error: string | null;
  eventos: Evento[];
  /** Cuántos hay desde la última vez que esta persona abrió el panel. */
  sinVer: number;
  /** La migración todavía no se corrió. */
  faltaMigracion: boolean;
}

const VACIO: ResultadoActividad = {
  ok: true,
  error: null,
  eventos: [],
  sinVer: 0,
  faltaMigracion: false,
};

/** Cuántos avisos se traen. Alcanza para «qué pasó estos días». */
const CUANTOS = 120;

export async function listarActividad(): Promise<ResultadoActividad> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ...VACIO, ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };
  }

  const { data, error } = await supabase
    .from("actividad")
    .select("id, entidad, accion, entidad_id, oportunidad_id, campos, actor_id, creado_en")
    .order("creado_en", { ascending: false })
    .limit(CUANTOS);

  if (error) {
    if (error.code === "PGRST205") return { ...VACIO, faltaMigracion: true };
    return { ...VACIO, ok: false, error: error.message };
  }

  const filas = data ?? [];
  if (filas.length === 0) return VACIO;

  // Los nombres y las fichas se resuelven en dos consultas y no con joins: la
  // actividad apunta a `auth.users`, que PostgREST no puede unir con la tabla
  // `usuarios` del CRM, y son unas pocas decenas de filas.
  const actores = [...new Set(filas.map((f) => f.actor_id).filter(Boolean))] as string[];
  const fichas = [...new Set(filas.map((f) => f.oportunidad_id).filter(Boolean))] as number[];

  const [gente, ops] = await Promise.all([
    actores.length
      ? supabase.from("usuarios").select("id, nombre, correo").in("id", actores)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    fichas.length
      ? supabase.from("vw_pipeline").select("id, codigo, cliente").in("id", fichas)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const nombres = new Map<string, string>();
  for (const u of gente.data ?? []) {
    // Sin nombre cargado se usa el correo: peor que un nombre, mucho mejor que
    // un identificador que no le dice nada a nadie.
    nombres.set(String(u.id), String(u.nombre || u.correo || ""));
  }

  const porFicha = new Map<number, { codigo: string; cliente: string }>();
  for (const o of ops.data ?? []) {
    porFicha.set(Number(o.id), {
      codigo: String(o.codigo ?? ""),
      cliente: String(o.cliente ?? ""),
    });
  }

  const eventos: Evento[] = filas.map((f) => {
    const ficha = f.oportunidad_id ? porFicha.get(Number(f.oportunidad_id)) : undefined;
    return {
      id: Number(f.id),
      entidad: String(f.entidad),
      accion: String(f.accion),
      entidadId: f.entidad_id == null ? null : Number(f.entidad_id),
      oportunidadId: f.oportunidad_id == null ? null : Number(f.oportunidad_id),
      campos: (f.campos as Evento["campos"]) ?? null,
      actor: f.actor_id ? (nombres.get(String(f.actor_id)) ?? null) : null,
      creadoEn: String(f.creado_en),
      codigo: ficha?.codigo ?? null,
      cliente: ficha?.cliente ?? null,
    };
  });

  return { ...VACIO, eventos, sinVer: await contarSinVer(supabase) };
}

/** Cuando nadie miró nunca el panel, desde cuándo contar. */
const DIAS_PRIMERA_VEZ = 7;

/**
 * Cuántos avisos hay sin ver.
 *
 * Se cuenta en la base y no sobre lo que se trajo, porque lo traído está
 * cortado en 120: con más avisos que eso el número quedaría corto justo cuando
 * más pasó.
 *
 * Lo que hizo uno mismo no cuenta. Nadie necesita un aviso rojo de lo que acaba
 * de hacer, y contándolo el contador nunca bajaría a cero para quien está
 * trabajando.
 */
async function contarSinVer(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
): Promise<number> {
  const { data: { user } = { user: null } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from("actividad_vista")
    .select("visto_en")
    .eq("usuario_id", user.id)
    .maybeSingle();

  // Sin marca previa se mira sólo la última semana. Arrancar desde el principio
  // daría un «847» el primer día, que no significa nada y enseña a ignorar el
  // número.
  const desde =
    data?.visto_en ??
    new Date(Date.now() - DIAS_PRIMERA_VEZ * 24 * 3600 * 1000).toISOString();

  const { count } = await supabase
    .from("actividad")
    .select("id", { count: "exact", head: true })
    .gt("creado_en", desde)
    .or(`actor_id.is.null,actor_id.neq.${user.id}`);

  return count ?? 0;
}

/** Deja anotado que esta persona ya miró el panel. */
export async function marcarVisto(): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  if (!supabase) return { ok: false, error: "Sesión no válida." };

  const { data: { user } = { user: null } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const { error } = await supabase
    .from("actividad_vista")
    .upsert(
      { usuario_id: user.id, visto_en: new Date().toISOString() },
      { onConflict: "usuario_id" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
