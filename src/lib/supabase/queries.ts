import "server-only";

import { getServerClient } from "@/lib/supabase/server";
import { SIN_ASIGNAR, SIN_DATO } from "@/lib/types";
import type {
  Catalogo,
  Estado,
  Etapa,
  Evento,
  Oportunidad,
  Producto,
  ProductoCategoria,
  TipoEvento,
} from "@/lib/types";

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  v == null || v === "" ? fallback : String(v);

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const num = (v: unknown, fallback = 0): number => numOrNull(v) ?? fallback;

export interface LoadResult<T> {
  data: T;
  error: string | null;
}

/** One `vw_pipeline` row → the flat shape the screens render. */
function toOportunidad(r: Row): Oportunidad {
  return {
    id: num(r.id),
    codigo: str(r.codigo),
    fechaRegistro: str(r.fecha_registro),
    fechaCierre: r.fecha_cierre ? str(r.fecha_cierre) : null,
    mes: str(r.mes),

    clienteId: num(r.cliente_id),
    cliente: str(r.cliente, SIN_DATO),
    telefono: r.telefono ? str(r.telefono) : null,
    correo: r.correo ? str(r.correo) : null,
    // Vienen en null mientras no se haya corrido la migración de la edad: la
    // vista vieja no trae estas columnas y la ficha tiene que seguir abriendo.
    edad: numOrNull(r.edad),
    responsableNombre: r.responsable_nombre ? str(r.responsable_nombre) : null,
    responsableTelefono: r.responsable_telefono ? str(r.responsable_telefono) : null,
    responsableCorreo: r.responsable_correo ? str(r.responsable_correo) : null,

    vendedorId: numOrNull(r.vendedor_id),
    vendedor: str(r.vendedor, SIN_ASIGNAR),
    productoId: numOrNull(r.producto_id),
    producto: str(r.producto, SIN_DATO),
    categoria: r.categoria ? (str(r.categoria) as ProductoCategoria) : null,
    territorioId: numOrNull(r.territorio_id),
    territorio: str(r.territorio, SIN_DATO),
    canalId: numOrNull(r.canal_id),
    canal: str(r.canal, SIN_DATO),
    etapaId: numOrNull(r.etapa_id),
    etapa: str(r.etapa, SIN_DATO),
    etapaOrden: numOrNull(r.etapa_orden),
    estadoId: numOrNull(r.estado_id),
    estado: str(r.estado, SIN_DATO),
    esFinal: r.es_final === true,

    valor: numOrNull(r.valor_oportunidad),
    cerrada: numOrNull(r.venta_cerrada),
    descuento: r.descuento_promocion ? str(r.descuento_promocion) : null,

    // Vienen en null mientras no se haya corrido la migración de bases: la
    // vista vieja no las trae y la app tiene que seguir funcionando igual.
    creadoEn: r.created_at ? str(r.created_at) : null,
    importacionId: numOrNull(r.importacion_id),
  };
}

/**
 * Load every opportunity, newest first.
 *
 * Runs as the signed-in user, so RLS decides what comes back. A signed-out
 * request legitimately returns nothing rather than an error.
 */
export async function fetchOportunidades(): Promise<LoadResult<Oportunidad[]>> {
  const supabase = await getServerClient();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("vw_pipeline")
    .select("*")
    .order("fecha_registro", { ascending: false })
    .order("id", { ascending: false });

  if (error) return { data: [], error: error.message };

  const filas = ((data ?? []) as Row[]).map(toOportunidad);

  // La vista sólo expone `created_at` después de la migración de bases. La
  // columna existe en la tabla desde siempre, así que se completa desde ahí:
  // el módulo de Bases puede agrupar por día de carga sin esperar a nadie.
  if (filas.length > 0 && filas[0].creadoEn == null) {
    const { data: fechas } = await supabase
      .from("oportunidades")
      .select("id, created_at")
      .limit(20000);

    if (fechas) {
      const porId = new Map(
        (fechas as Row[]).map((r) => [num(r.id), r.created_at ? str(r.created_at) : null]),
      );
      for (const f of filas) f.creadoEn = porId.get(f.id) ?? null;
    }
  }

  return { data: filas, error: null };
}

const EMPTY_CATALOGO: Catalogo = {
  vendedores: [],
  productos: [],
  territorios: [],
  canales: [],
  etapas: [],
  estados: [],
  tiposEvento: [],
};

/** Load the six catalogue tables plus the activity types in one round trip. */
export async function fetchCatalogo(): Promise<LoadResult<Catalogo>> {
  const supabase = await getServerClient();
  if (!supabase) return { data: EMPTY_CATALOGO, error: null };

  const [vend, prod, terr, can, eta, est, tipos] = await Promise.all([
    supabase.from("vendedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("productos").select("id, nombre, categoria, precio").order("nombre"),
    supabase.from("territorios").select("id, nombre").order("nombre"),
    supabase.from("canales").select("id, nombre").order("nombre"),
    supabase.from("etapas").select("id, nombre, orden").order("orden"),
    supabase.from("estados").select("id, nombre, es_final").order("id"),
    supabase
      .from("tipos_evento")
      .select("id, nombre, codigo, color, duracion_min")
      .order("orden"),
  ]);

  const firstError =
    [vend, prod, terr, can, eta, est, tipos].find((r) => r.error)?.error ?? null;

  const rows = (r: { data: unknown }): Row[] =>
    Array.isArray(r.data) ? (r.data as Row[]) : [];

  const catalogo: Catalogo = {
    vendedores: rows(vend).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
    productos: rows(prod).map(
      (r): Producto => ({
        id: num(r.id),
        nombre: str(r.nombre),
        categoria: str(r.categoria, "Otro") as ProductoCategoria,
        precio: numOrNull(r.precio),
      }),
    ),
    territorios: rows(terr).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
    canales: rows(can).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
    etapas: rows(eta).map(
      (r): Etapa => ({ id: num(r.id), nombre: str(r.nombre), orden: num(r.orden) }),
    ),
    estados: rows(est).map(
      (r): Estado => ({
        id: num(r.id),
        nombre: str(r.nombre),
        esFinal: r.es_final === true,
      }),
    ),
    tiposEvento: rows(tipos).map(
      (r): TipoEvento => ({
        id: num(r.id),
        nombre: str(r.nombre),
        codigo: str(r.codigo),
        color: str(r.color, "#6B665F"),
        duracionMin: num(r.duracion_min, 30),
      }),
    ),
  };

  return { data: catalogo, error: firstError ? firstError.message : null };
}

export async function fetchEventos(): Promise<LoadResult<Evento[]>> {
  const supabase = await getServerClient();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("eventos")
    .select("*")
    .order("inicia_en");

  if (error) return { data: [], error: error.message };

  const eventos = ((data ?? []) as Row[]).map(
    (r): Evento => ({
      id: num(r.id),
      oportunidadId: num(r.oportunidad_id),
      tipoId: num(r.tipo_id),
      vendedorId: numOrNull(r.vendedor_id),
      iniciaEn: str(r.inicia_en),
      duracionMin: num(r.duracion_min, 30),
      canal: str(r.canal, "Llamada") as Evento["canal"],
      estado: str(r.estado, "Pendiente") as Evento["estado"],
      resultado: r.resultado ? str(r.resultado) : null,
      proximaAccion: r.proxima_accion ? str(r.proxima_accion) : null,
    }),
  );

  return { data: eventos, error: null };
}
