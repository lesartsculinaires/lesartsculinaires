"use server";

import { getServerClient } from "@/lib/supabase/server";
import { POR_TANDA, type Evento } from "@/lib/actividad";

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

  return {
    ...VACIO,
    eventos: await enriquecer(supabase, filas),
    sinVer: await contarSinVer(supabase),
  };
}

/**
 * Le pone nombres a lo que la tabla guarda como identificadores.
 *
 * Los nombres y las fichas se resuelven en dos consultas y no con joins: la
 * actividad apunta a `auth.users`, que PostgREST no puede unir con la tabla
 * `usuarios` del CRM. Van dos viajes por tanda, no uno por fila.
 *
 * Lo usan la campana y el módulo, que tienen que contar lo mismo de la misma
 * manera: si cada uno resolviera los nombres por su cuenta, tarde o temprano
 * uno diría «Ana Pérez» donde el otro dice un correo.
 */
async function enriquecer(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  filas: readonly Record<string, unknown>[],
): Promise<Evento[]> {
  const actores = [...new Set(filas.map((f) => f.actor_id).filter(Boolean))] as string[];
  const fichas = [...new Set(filas.map((f) => f.oportunidad_id).filter(Boolean))] as number[];

  /*
   * Los nombres salen de una función y no de la tabla `usuarios`.
   *
   * La política de `usuarios` deja ver sólo la fila propia, así que leyéndola
   * directo una asesora no resolvía ningún nombre ajeno y el panel decía «Una
   * integración editó un lead» para todo lo que hacía el equipo: peor que no
   * decir nada, porque además miente.
   *
   * `nombres_del_equipo` corre como `security definer` y devuelve `id` y
   * `nombre`, nada más. Para poner una etiqueta en un aviso no hace falta el
   * correo ni el rol de nadie.
   *
   * Con la consulta vieja de respaldo, para el rato que va entre el despliegue
   * del código y la corrida del SQL: ahí sigue andando como antes en vez de
   * quedarse sin panel.
   */
  const [gente, ops] = await Promise.all([
    actores.length
      ? supabase
          .rpc("nombres_del_equipo", { p_ids: actores })
          .then((r) =>
            r.error
              ? supabase.from("usuarios").select("id, nombre, correo").in("id", actores)
              : r,
          )
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

  return filas.map((f) => {
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

/**
 * Nada más el número, para el globito de la barra.
 *
 * Aparte de `listarActividad` porque la barra lo pide en cada refresco y no
 * necesita los 120 movimientos ni los dos viajes que resuelven los nombres:
 * es un `count` y se acabó. Traer la lista entera para dibujar un número sería
 * pagar el panel completo cada vez que alguien mira la pantalla.
 */
export async function contarActividadSinVer(): Promise<number> {
  const supabase = await getServerClient();
  if (!supabase) return 0;

  try {
    return await contarSinVer(supabase);
  } catch {
    // Un globito que no se puede calcular no vale una pantalla en blanco.
    return 0;
  }
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

// ------------------------------------------------------ el módulo con filtros

export interface FiltrosActividad {
  /** Id de la persona. Vacío = cualquiera. */
  actor?: string;
  /** 'oportunidad' | 'cliente' | 'nota' | 'adjunto' | 'enlace'. Vacío = todo. */
  entidad?: string;
  /** 'creo' | 'edito' | 'borro'. Vacío = todo. */
  accion?: string;
  /** Fechas ISO, inclusive. */
  desde?: string;
  hasta?: string;
  /** Cuántas saltarse, para ir trayendo de a tandas. */
  saltar?: number;
}

export interface ResultadoBusqueda {
  ok: boolean;
  error: string | null;
  eventos: Evento[];
  /** Cuántas hay en total con esos filtros, para saber si quedan más. */
  total: number;
  faltaMigracion: boolean;
}

/**
 * La actividad con filtros, para el módulo.
 *
 * Lo mismo que alimenta la campana pero pudiendo acotar, y trayendo de a
 * tandas en vez de las últimas 120 sueltas.
 *
 * Acá tampoco hay un `if` sobre el rol: quién ve qué lo decide la política de
 * la base. Un filtro por persona que devolviera lo ajeno a quien no debe
 * verlo sería un agujero, y poner la regla en dos lugares es la forma de que
 * uno de los dos se quede viejo.
 */
export async function buscarActividad(
  f: FiltrosActividad = {},
): Promise<ResultadoBusqueda> {
  const supabase = await getServerClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Sesión no válida. Volvé a iniciar sesión.",
      eventos: [],
      total: 0,
      faltaMigracion: false,
    };
  }

  const saltar = Math.max(f.saltar ?? 0, 0);

  let consulta = supabase
    .from("actividad")
    .select("id, entidad, accion, entidad_id, oportunidad_id, campos, actor_id, creado_en", {
      count: "exact",
    })
    .order("creado_en", { ascending: false });

  if (f.actor) consulta = consulta.eq("actor_id", f.actor);
  if (f.entidad) consulta = consulta.eq("entidad", f.entidad);
  if (f.accion) consulta = consulta.eq("accion", f.accion);
  if (f.desde) consulta = consulta.gte("creado_en", f.desde);
  // `hasta` es un día, no un instante: se toma hasta el final de esa jornada o
  // un filtro «hasta hoy» dejaría fuera todo lo de hoy.
  if (f.hasta) consulta = consulta.lte("creado_en", `${f.hasta}T23:59:59.999Z`);

  const { data, error, count } = await consulta.range(saltar, saltar + POR_TANDA - 1);

  if (error) {
    if (error.code === "PGRST205") {
      return { ok: true, error: null, eventos: [], total: 0, faltaMigracion: true };
    }
    return { ok: false, error: error.message, eventos: [], total: 0, faltaMigracion: false };
  }

  return {
    ok: true,
    error: null,
    eventos: await enriquecer(supabase, data ?? []),
    total: count ?? 0,
    faltaMigracion: false,
  };
}
