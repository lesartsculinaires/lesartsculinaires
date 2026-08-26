"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/actions";

/**
 * Autorizaciones: los tipos que arma dirección y los pedidos que hace el equipo.
 *
 * Todo pasa por la base con la sesión de quien está trabajando, así que las
 * políticas son las que mandan. Las comprobaciones que hay acá no las
 * reemplazan: están para que un «no» llegue como una frase que se entiende y
 * no como una fila que no se movió. Un permiso que se niega en silencio se lee
 * como una falla del sistema, y lo que hace la gente entonces es intentarlo
 * otra vez.
 */

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** «general» sirve para cualquier lead; «especifica» se arma para un caso. */
export type ClaseAutorizacion = "general" | "especifica";

/** Un tipo de autorización del catálogo. */
export interface TipoAutorizacion {
  id: number;
  nombre: string;
  descripcion: string | null;
  clase: ClaseAutorizacion;
  activo: boolean;
}

/** Un pedido concreto sobre un lead. */
export interface Autorizacion {
  id: number;
  /** El lead. Nulo en las viejas, de antes de que los pedidos supieran de cuál. */
  oportunidadId: number | null;
  /** Código y nombre del lead, para no tener que ir a buscarlos. */
  codigo: string | null;
  cliente: string | null;
  tipo: string | null;
  clase: ClaseAutorizacion | null;
  /** Lo que escribió quien pidió. Es lo que dirección lee para decidir. */
  descripcion: string;
  estado: "pendiente" | "autorizada" | "rechazada";
  /** Nombre de quien pidió, ya resuelto. Nulo si su cuenta ya no está. */
  solicitadoPor: string | null;
  solicitadoEn: string;
  resueltoPor: string | null;
  resueltoEn: string | null;
  comentario: string | null;
}

export interface ResultadoAutorizaciones {
  ok: boolean;
  error: string | null;
  tipos: TipoAutorizacion[];
  pedidos: Autorizacion[];
  /** Cierto cuando falta correr la migración: se avisa, no se grita. */
  faltaMigracion: boolean;
}

const VACIO: ResultadoAutorizaciones = {
  ok: true,
  error: null,
  tipos: [],
  pedidos: [],
  faltaMigracion: false,
};

/**
 * Una fila de pedidos tal como vuelve de PostgREST.
 *
 * Se declara a mano porque el cliente tipado no sabe deducir un `select` con
 * dos niveles de relación —`oportunidades(codigo, clientes(nombre))`— y
 * devuelve un tipo de error en vez de la forma. Es la misma salida que ya usan
 * `inbox.ts` y `seguimientos.ts` para lo mismo.
 */
interface FilaPedido {
  id: number;
  oportunidad_id: number | null;
  descripcion: string | null;
  estado: string | null;
  solicitado_por: string | null;
  solicitado_en: string;
  resuelto_por: string | null;
  resuelto_en: string | null;
  comentario: string | null;
  autorizaciones_tipo: { nombre: string | null; clase: string | null } | null;
  oportunidades: { codigo: string | null; clientes: { nombre: string | null } | null } | null;
}

const faltaTabla = (e: { code?: string; message?: string } | null): boolean =>
  e != null &&
  (e.code === "PGRST205" ||
    e.code === "PGRST200" ||
    e.code === "42P01" ||
    /schema cache|does not exist|could not find/i.test(e.message ?? ""));

/**
 * Todo lo que necesita la pantalla: el catálogo y los pedidos.
 *
 * En una sola acción y no en dos porque las dos pantallas que usan esto los
 * muestran juntos y siempre; separarlos serían dos viajes para dibujar una vez.
 *
 * Qué pedidos vuelven lo decide la base: dirección los ve todos, y los demás
 * los de los leads que ya pueden ver.
 *
 * `oportunidadId` la manda la ficha, que quiere los de ese lead y nada más. No
 * es un permiso —eso ya lo resolvió la política— sino no traerse cuatrocientas
 * filas para mostrar tres. Sin ella vuelven todos, que es lo que pide el
 * módulo.
 */
export async function cargarAutorizaciones(
  oportunidadId?: number,
): Promise<ResultadoAutorizaciones> {
  const supabase = await getServerClient();
  if (!supabase) return { ...VACIO, ok: false, error: SIN_SESION.error };

  let consulta = supabase
    .from("autorizaciones")
    .select(
      "id, oportunidad_id, descripcion, estado, solicitado_por, solicitado_en," +
        " resuelto_por, resuelto_en, comentario," +
        " autorizaciones_tipo(nombre, clase), oportunidades(codigo, clientes(nombre))",
    )
    .order("solicitado_en", { ascending: false })
    .limit(400);

  if (oportunidadId != null) consulta = consulta.eq("oportunidad_id", oportunidadId);

  const [tipos, pedidos] = await Promise.all([
    supabase
      .from("autorizaciones_tipo")
      .select("id, nombre, descripcion, clase, activo")
      .order("clase")
      .order("nombre"),
    consulta,
  ]);

  if (faltaTabla(tipos.error) || faltaTabla(pedidos.error)) {
    return { ...VACIO, faltaMigracion: true };
  }
  if (tipos.error) return { ...VACIO, ok: false, error: tipos.error.message };
  if (pedidos.error) return { ...VACIO, ok: false, error: pedidos.error.message };

  /*
   * Los nombres de las personas salen de `usuarios`, en una consulta aparte.
   *
   * No se puede pedir en el mismo `select`: `solicitado_por` apunta a
   * `auth.users`, que PostgREST no expone, así que no hay relación que
   * atravesar. Y sin nombre la lista diría «pidió 3f2b…-9c1», que no le sirve
   * a nadie para decidir.
   */
  const filas = (pedidos.data ?? []) as unknown as FilaPedido[];

  const cuentas = new Set<string>();
  for (const a of filas) {
    if (a.solicitado_por) cuentas.add(String(a.solicitado_por));
    if (a.resuelto_por) cuentas.add(String(a.resuelto_por));
  }

  const nombres = new Map<string, string>();
  if (cuentas.size > 0) {
    const { data: gente } = await supabase
      .from("usuarios")
      .select("id, nombre, correo")
      .in("id", [...cuentas]);

    for (const u of gente ?? []) {
      nombres.set(String(u.id), String(u.nombre || u.correo || ""));
    }
  }

  const quien = (id: unknown): string | null =>
    id == null ? null : (nombres.get(String(id)) ?? null);

  return {
    ...VACIO,
    tipos: (tipos.data ?? []).map((t) => ({
      id: Number(t.id),
      nombre: String(t.nombre),
      descripcion: t.descripcion == null ? null : String(t.descripcion),
      clase: (t.clase === "especifica" ? "especifica" : "general") as ClaseAutorizacion,
      activo: t.activo !== false,
    })),
    pedidos: filas.map((a) => {
      const tipo = a.autorizaciones_tipo;
      const op = a.oportunidades;
      return {
        id: Number(a.id),
        oportunidadId: a.oportunidad_id == null ? null : Number(a.oportunidad_id),
        codigo: op?.codigo == null ? null : String(op.codigo),
        cliente: op?.clientes?.nombre == null ? null : String(op.clientes.nombre),
        tipo: tipo?.nombre == null ? null : String(tipo.nombre),
        clase: tipo?.clase === "especifica" ? "especifica" : tipo?.clase ? "general" : null,
        descripcion: String(a.descripcion ?? ""),
        estado:
          a.estado === "autorizada" || a.estado === "rechazada"
            ? (a.estado as "autorizada" | "rechazada")
            : "pendiente",
        solicitadoPor: quien(a.solicitado_por),
        solicitadoEn: String(a.solicitado_en),
        resueltoPor: quien(a.resuelto_por),
        resueltoEn: a.resuelto_en == null ? null : String(a.resuelto_en),
        comentario: a.comentario == null ? null : String(a.comentario),
      };
    }),
  };
}

/**
 * Crea un tipo de autorización. Sólo dirección.
 *
 * El nombre es único en la base, y se comprueba acá también para poder decir
 * «ya existe» en vez de devolver el error crudo del índice.
 */
export async function crearTipoAutorizacion(datos: {
  nombre: string;
  descripcion: string;
  clase: ClaseAutorizacion;
}): Promise<ActionResult> {
  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "Poné un nombre para la autorización." };
  if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo." };

  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Crear autorizaciones es de dirección." };
  }

  const { error } = await supabase.from("autorizaciones_tipo").insert({
    nombre,
    descripcion: datos.descripcion.trim() || null,
    clase: datos.clase,
    creado_por: user.id,
  });

  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return { ok: false, error: `Ya existe una autorización llamada «${nombre}».` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Saca de circulación un tipo, o lo devuelve. Sólo dirección.
 *
 * Se desactiva y no se borra porque los pedidos ya hechos lo apuntan: borrarlo
 * dejaría en el historial pedidos de «(algo)», y lo que dirección aprobó el mes
 * pasado tiene que seguir diciendo qué era. Desactivado deja de ofrecerse en la
 * ficha y lo viejo se sigue leyendo.
 */
export async function activarTipoAutorizacion(
  id: number,
  activo: boolean,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Cambiar las autorizaciones es de dirección." };
  }

  const { error } = await supabase
    .from("autorizaciones_tipo")
    .update({ activo })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Pide una autorización sobre un lead.
 *
 * El motivo es obligatorio, y no por formalidad: es lo único que dirección lee
 * para decidir, y un pedido sin motivo obliga a preguntar y frena todo.
 *
 * Quién pidió sale de la sesión, no de la pantalla. La política de la base
 * exige que coincida, así que mandarlo desde el navegador no serviría para
 * pedir en nombre de otro; se pone acá para que coincida siempre.
 */
export async function solicitarAutorizacion(datos: {
  oportunidadId: number;
  tipoId: number;
  detalle: string;
}): Promise<ActionResult> {
  const detalle = datos.detalle.trim();
  if (!detalle) {
    return { ok: false, error: "Contá por qué la pedís: es lo que dirección va a leer." };
  }

  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: tipo } = await supabase
    .from("autorizaciones_tipo")
    .select("nombre, activo")
    .eq("id", datos.tipoId)
    .maybeSingle();

  if (!tipo) return { ok: false, error: "Elegí qué autorización estás pidiendo." };
  if ((tipo as { activo?: boolean }).activo === false) {
    return {
      ok: false,
      error: "Esa autorización ya no está en uso. Elegí otra o hablá con dirección.",
    };
  }

  const { error } = await supabase.from("autorizaciones").insert({
    oportunidad_id: datos.oportunidadId,
    tipo_id: datos.tipoId,
    // La tabla trae `nombre` de antes de que existieran los tipos. Se llena con
    // el del tipo para que las filas viejas y las nuevas se lean igual.
    nombre: String((tipo as { nombre: string }).nombre),
    descripcion: detalle,
    estado: "pendiente",
    solicitado_por: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Autoriza o rechaza un pedido. Sólo dirección, y sólo si sigue pendiente.
 *
 * Lo segundo lo hace cumplir la base: una vez resuelto, queda. Aprobar o
 * rechazar es un hecho con fecha y con nombre, y editarlo después sería
 * reescribir lo que pasó. Si hay que cambiar de opinión se pide de nuevo, y las
 * dos quedan en el historial.
 */
export async function resolverAutorizacion(
  id: number,
  decision: "autorizada" | "rechazada",
  comentario: string,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Resolver autorizaciones es de dirección." };
  }

  const { data, error } = await supabase
    .from("autorizaciones")
    .update({
      estado: decision,
      resuelto_por: user.id,
      resuelto_en: new Date().toISOString(),
      comentario: comentario.trim() || null,
    })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (error) return { ok: false, error: error.message };

  // Ninguna fila movida con la sesión de dirección quiere decir que alguien la
  // resolvió mientras esta pantalla estaba abierta.
  if ((data ?? []).length === 0) {
    return {
      ok: false,
      error: "Ese pedido ya lo resolvió alguien. Actualizá para ver cómo quedó.",
    };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
