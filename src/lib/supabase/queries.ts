import "server-only";

import { traerTodo } from "@/lib/supabase/paginar";
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
    // Nulo mientras no se haya corrido la migración de «Extranjero»: la vista
    // vieja no trae la columna y la ficha tiene que seguir abriendo.
    pais: r.pais ? str(r.pais) : null,
    // Nula mientras no se haya corrido la migración del cumpleaños.
    fechaNacimiento: r.fecha_nacimiento ? str(r.fecha_nacimiento) : null,
    responsableNombre: r.responsable_nombre ? str(r.responsable_nombre) : null,
    responsableTelefono: r.responsable_telefono ? str(r.responsable_telefono) : null,
    responsableCorreo: r.responsable_correo ? str(r.responsable_correo) : null,

    vendedorId: numOrNull(r.vendedor_id),
    vendedor: str(r.vendedor, SIN_ASIGNAR),
    productoId: numOrNull(r.producto_id),
    // Se completa después, de `oportunidad_programas`. Vacío mientras tanto:
    // la vista no los trae y la ficha tiene que poder dibujarse igual.
    programasInteres: [],
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
    // Nulos mientras no se haya corrido la migración del motivo: la vista
    // vieja no los trae y la aplicación tiene que seguir andando igual.
    motivoPerdidaId: numOrNull(r.motivo_perdida_id),
    motivoPerdida: r.motivo_perdida ? str(r.motivo_perdida) : null,

    valor: numOrNull(r.valor_oportunidad),
    cerrada: numOrNull(r.venta_cerrada),
    reserva: numOrNull(r.reserva),
    // Nula mientras no se haya corrido la migración del recordatorio: la vista
    // vieja no la trae y la aplicación tiene que seguir andando igual.
    reservaEn: r.reserva_en ? str(r.reserva_en) : null,
    descuento: r.descuento_promocion ? str(r.descuento_promocion) : null,

    // El horario cerrado con este alumno, y el que el programa tiene vigente.
    // Nulos mientras no se haya corrido la migración del horario: la vista
    // vieja no los trae y la aplicación tiene que seguir andando igual.
    horario: r.horario ? str(r.horario) : null,
    horarioPrograma: r.horario_programa ? str(r.horario_programa) : null,

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

  /*
   * De a tandas, porque Supabase corta en mil filas y no lo dice.
   *
   * Acá había una consulta suelta. Con 1053 leads devolvía 1000 y la
   * aplicación los tomaba por todos: al Gerente y al Jefe de ventas les
   * faltaban fichas en el tablero, siempre las más viejas, mientras que a una
   * asesora —que tiene 537— no le faltaba ninguna. Por eso se leía como que
   * «a veces» no veían el pipeline de Ventas.
   *
   * El segundo `order` por `id` no es decorativo: sin un orden que no empate
   * nunca, dos tandas distintas podrían devolver la misma fila dos veces y
   * saltearse otra.
   */
  const { data, error } = await traerTodo<Row>(() =>
    supabase
      .from("vw_pipeline")
      .select("*")
      .order("fecha_registro", { ascending: false })
      .order("id", { ascending: false }),
  );

  if (error) return { data: [], error };

  const filas = data.map(toOportunidad);

  // La vista sólo expone `created_at` después de la migración de bases. La
  // columna existe en la tabla desde siempre, así que se completa desde ahí:
  // el módulo de Bases puede agrupar por día de carga sin esperar a nadie.
  if (filas.length > 0 && filas[0].creadoEn == null) {
    // También de a tandas: `.limit(20000)` no levanta el techo de Supabase,
    // se aplica igual sobre lo que se devuelve.
    const { data: fechas } = await traerTodo<Row>(() =>
      supabase.from("oportunidades").select("id, created_at").order("id"),
    );

    if (fechas.length > 0) {
      const porId = new Map(
        fechas.map((r) => [num(r.id), r.created_at ? str(r.created_at) : null]),
      );
      for (const f of filas) f.creadoEn = porId.get(f.id) ?? null;
    }
  }

  /*
   * Los programas por los que preguntó cada lead.
   *
   * Se piden aparte y no desde `vw_pipeline` por dos razones. Una fila por
   * programa no cabe en una vista que devuelve una fila por lead sin inventar
   * una agregación que después hay que mantener en la vista. Y la otra es la
   * de siempre en este CRM: si la migración no se corrió todavía, la tabla no
   * existe, y eso no puede tumbar la pantalla entera. Sin ella cada lead
   * queda con su lista vacía y todo lo demás anda igual.
   */
  {
    const { data: intereses, error: errIntereses } = await traerTodo<{
      oportunidad_id: number;
      producto_id: number;
    }>(() =>
      supabase
        .from("oportunidad_programas")
        .select("oportunidad_id, producto_id")
        .order("oportunidad_id"),
    );

    if (errIntereses) {
      // PGRST205 es «esa tabla no existe». Cualquier otro error tampoco vale
      // una pantalla en blanco: se anota y se sigue.
      console.warn("[queries] sin programas de interés:", errIntereses);
    } else if (intereses.length > 0) {
      const porLead = new Map<number, number[]>();
      for (const i of intereses) {
        const suyos = porLead.get(i.oportunidad_id);
        if (suyos) suyos.push(i.producto_id);
        else porLead.set(i.oportunidad_id, [i.producto_id]);
      }
      for (const f of filas) f.programasInteres = porLead.get(f.id) ?? [];
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
  motivosPerdida: [],
  tiposEvento: [],
};

/** Load the six catalogue tables plus the activity types in one round trip. */
export async function fetchCatalogo(): Promise<LoadResult<Catalogo>> {
  const supabase = await getServerClient();
  if (!supabase) return { data: EMPTY_CATALOGO, error: null };

  const [vend, prod, terr, can, eta, est, motivos, tipos] = await Promise.all([
    // Sin filtrar por `activo`: se traen todos y cada pantalla decide. Los
    // desplegables usan `activos()`; los que sólo tienen que poner un nombre a
    // algo que ya pasó —un evento del calendario, una ficha vieja— necesitan
    // también a los dados de baja, o mostrarían un hueco donde hay un dato.
    supabase.from("vendedores").select("id, nombre, activo, correo, telefono").order("nombre"),
    // Con `*` y no con la lista de columnas: el horario del programa se agrega
    // en una migración, y nombrarlo acá tumbaría el catálogo entero —y con él
    // el CRM— en el rato que va entre el despliegue del código y la corrida
    // del SQL. La tabla es chica y no tiene nada que esconder.
    supabase.from("productos").select("*").order("nombre"),
    supabase.from("territorios").select("id, nombre").order("nombre"),
    supabase.from("canales").select("id, nombre").order("nombre"),
    supabase.from("etapas").select("id, nombre, orden").order("orden"),
    supabase.from("estados").select("id, nombre, es_final").order("id"),
    supabase.from("motivos_perdida").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("tipos_evento")
      .select("id, nombre, codigo, color, duracion_min")
      .order("orden"),
  ]);

  // `motivos` queda afuera del control de errores a propósito: su tabla puede
  // no existir todavía, y eso no puede tumbar el catálogo entero. Sin ella el
  // desplegable de motivos sale vacío y el resto del CRM anda igual.
  const firstError =
    [vend, prod, terr, can, eta, est, tipos].find((r) => r.error)?.error ?? null;

  const rows = (r: { data: unknown }): Row[] =>
    Array.isArray(r.data) ? (r.data as Row[]) : [];

  const catalogo: Catalogo = {
    vendedores: rows(vend).map((r) => ({
      id: num(r.id),
      nombre: str(r.nombre),
      activo: r.activo !== false,
      correo: r.correo ? str(r.correo) : null,
      telefono: r.telefono ? str(r.telefono) : null,
    })),
    productos: rows(prod).map(
      (r): Producto => ({
        id: num(r.id),
        nombre: str(r.nombre),
        categoria: str(r.categoria, "Otro") as ProductoCategoria,
        precio: numOrNull(r.precio),
        horario: r.horario ? str(r.horario) : null,
      }),
    ),
    territorios: rows(terr).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
    canales: rows(can).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
    etapas: rows(eta).map(
      (r): Etapa => ({ id: num(r.id), nombre: str(r.nombre), orden: num(r.orden) }),
    ),
    motivosPerdida: rows(motivos).map((r) => ({ id: num(r.id), nombre: str(r.nombre) })),
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
