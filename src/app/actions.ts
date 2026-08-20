"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { altaLead, contactosConocidos, numeroDeCodigo, type DatosLead } from "@/lib/crm/altaLead";
import { asignarClientes, repartir } from "@/lib/crm/lotesImportacion";
import { buscarDuplicados, type Coincidencia, type DatosContacto } from "@/lib/duplicados";
import { listarCampos, planificarFusion, type Choque } from "@/lib/fusion";
import { getServerClient } from "@/lib/supabase/server";
import { COOKIE_MODULO } from "@/lib/ultimoModulo";
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

  // Queda firmada. Una bitácora sin autor sirve para acordarse de qué pasó,
  // pero no para preguntarle a alguien; y cuando un cliente se pasa de asesor,
  // saber quién escribió cada cosa es la mitad del valor.
  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  const { error } = await supabase.from("oportunidad_notas").insert({
    oportunidad_id: oportunidadId,
    nota: texto,
    origen: "comentario",
    autor_id: user?.id ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Una línea de la bitácora, lista para mostrar. */
export interface NotaRegistrada {
  id: number;
  nota: string;
  /** `comentario` lo escribió alguien; `adjunto` lo dejó el sistema. */
  origen: string;
  creadaEn: string;
  /** Quién la escribió. Null en las viejas y en las automáticas. */
  autor: string | null;
}

export interface ResultadoNotas {
  ok: boolean;
  error: string | null;
  notas: NotaRegistrada[];
}

/**
 * La bitácora de una oportunidad, de lo más nuevo a lo más viejo.
 *
 * El nombre del autor se busca aparte y no con un `join`: la nota apunta a
 * `auth.users`, no a la tabla `usuarios` del CRM, así que PostgREST no puede
 * unirlas solo. Son dos consultas y unas pocas filas.
 */
export async function listarNotas(oportunidadId: number): Promise<ResultadoNotas> {
  const supabase = await getServerClient();
  if (!supabase) return { ...NO_SESSION, notas: [] };

  const { data, error } = await supabase
    .from("oportunidad_notas")
    .select("id, nota, origen, autor_id, created_at")
    .eq("oportunidad_id", oportunidadId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message, notas: [] };

  const filas = data ?? [];
  const ids = [...new Set(filas.map((f) => f.autor_id).filter(Boolean))] as string[];

  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: gente } = await supabase
      .from("usuarios")
      .select("id, nombre, correo")
      .in("id", ids);

    for (const u of gente ?? []) {
      // Sin nombre cargado se usa el correo: peor que un nombre, mucho mejor
      // que no decir nada.
      nombres.set(String(u.id), String(u.nombre || u.correo || ""));
    }
  }

  return {
    ok: true,
    error: null,
    notas: filas.map((f) => ({
      id: Number(f.id),
      nota: String(f.nota ?? ""),
      origen: String(f.origen ?? "comentario"),
      creadaEn: String(f.created_at),
      autor: f.autor_id ? (nombres.get(String(f.autor_id)) ?? null) : null,
    })),
  };
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

export async function signOut(): Promise<never> {
  const supabase = await getServerClient();

  // Revocar en Supabase es lo deseable, pero no puede ser lo que decida si la
  // sesión se cierra: si la red falla o el token ya venció, el usuario quedaría
  // encerrado adentro. Se intenta, y pase lo que pase se borra la cookie.
  try {
    if (supabase) await supabase.auth.signOut();
  } catch {
    // Sin sesión válida no hay nada que revocar del otro lado.
  }

  // La cookie es la única fuente de verdad para el middleware, así que se
  // borra explícitamente. @supabase/ssr la parte en varias cuando es larga
  // (`...auth-token.0`, `.1`), y dejar una sola atrás revive la sesión.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-") && name.includes("auth-token")) {
      cookieStore.delete(name);
    }
  }

  // Y se olvida en qué pantalla estaba. No es un dato delicado, pero la
  // siguiente persona que entre en esta computadora no tiene por qué aparecer
  // donde la dejó la anterior.
  cookieStore.delete(COOKIE_MODULO);

  // Navegar desde el servidor, ya sin cookie: así no depende de que el
  // navegador haga bien su parte.
  redirect("/login?fin=1");
}

// ---------------------------------------------------------------- accesos

/**
 * Save the whole permission grid for one role in a single call.
 *
 * The screen edits many toggles before pressing "Guardar permisos", so this
 * upserts every row at once rather than writing on each flip.
 */
export async function guardarPermisos(
  rolId: number,
  filas: { modulo: string; ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }[],
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase
    .from("rol_permisos")
    .upsert(
      filas.map((f) => ({ rol_id: rolId, ...f })),
      { onConflict: "rol_id,modulo" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

export async function crearRol(
  nombre: string,
  descripcion: string,
): Promise<ActionResult> {
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El rol necesita un nombre." };

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase
    .from("roles")
    .insert({ nombre: limpio, descripcion: descripcion.trim() || null });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Ya existe un rol llamado "${limpio}".` : error.message,
    };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

export async function actualizarRol(
  id: number,
  patch: { nombre?: string; descripcion?: string | null; activo?: boolean; ve_todo?: boolean },
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase.from("roles").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/** The database trigger refuses to drop the last administrator role. */
export async function eliminarRol(id: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

export async function actualizarUsuario(
  id: string,
  patch: { nombre?: string | null; rol_id?: number | null; activo?: boolean },
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { error } = await supabase.from("usuarios").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Confirm the caller is an administrator.
 *
 * Every action below reaches for the service-role key, which ignores RLS —
 * so the check has to happen here, in the server action, not in the screen
 * that calls it.
 */
async function exigirAdmin(): Promise<string | null> {
  const supabase = await getServerClient();
  if (!supabase) return "Sesión no válida. Volvé a iniciar sesión.";

  const { data, error } = await supabase.rpc("es_admin");
  if (error) return error.message;
  if (data !== true) return "Solo un administrador puede administrar usuarios.";
  return null;
}

const SIN_LLAVE =
  "Falta SUPABASE_SERVICE_ROLE_KEY. Cargala en Netlify → Site configuration → " +
  "Environment variables (y en .env.local para desarrollo) para poder crear cuentas.";

/**
 * Create a login and its application user in one step.
 *
 * The account is created already confirmed: an administrator handing out
 * access should not have to wait for the person to click a link in an email.
 */
export async function crearUsuario(
  correo: string,
  password: string,
  rolId: number | null,
  nombre: string,
): Promise<ActionResult> {
  const email = correo.trim().toLowerCase();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const problema = await exigirAdmin();
  if (problema) return { ok: false, error: problema };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: SIN_LLAVE };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return {
      ok: false,
      error: /already been registered|already exists/i.test(error.message)
        ? `Ya existe una cuenta con ${email}.`
        : error.message,
    };
  }

  const id = data.user?.id;
  if (!id) return { ok: false, error: "Supabase no devolvió el usuario creado." };

  // The auth account exists now; if this second write fails the account would
  // be unusable, so it is rolled back rather than left orphaned.
  const { error: errPerfil } = await admin
    .from("usuarios")
    .insert({ id, correo: email, nombre: nombre.trim() || null, rol_id: rolId });

  if (errPerfil) {
    await admin.auth.admin.deleteUser(id);
    return { ok: false, error: errPerfil.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Change someone's password without knowing the old one. */
export async function cambiarPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const problema = await exigirAdmin();
  if (problema) return { ok: false, error: problema };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: SIN_LLAVE };

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  return error ? { ok: false, error: error.message } : { ok: true, error: null };
}

/** Delete the login and, by cascade, its application user. */
export async function eliminarUsuario(userId: string): Promise<ActionResult> {
  const problema = await exigirAdmin();
  if (problema) return { ok: false, error: problema };

  const supabase = await getServerClient();
  const { data: yo } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (yo?.user?.id === userId) {
    return { ok: false, error: "No podés eliminar tu propia cuenta." };
  }

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: SIN_LLAVE };

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, error: null };
}

// ------------------------------------------------------- diagnóstico de la llave

export interface Diagnostico {
  /** The variable exists and is not blank. */
  presente: boolean;
  /** Character count. Never the value itself. */
  longitud: number;
  /**
   * Which kind of key was pasted. The two wrong ones are worth naming: the
   * publishable/anon key is the most common mistake, because it sits right
   * next to the service_role key on the same Supabase page.
   */
  formato:
    | "service_role"
    | "secreta"
    | "publicable-o-anon"
    | "desconocido"
    | "ausente";
  /** True when the value is byte-for-byte the public anon key. */
  esLaAnon: boolean;
  /** Result of an actual call to Supabase with the key. */
  prueba: "ok" | "sin-llave" | string;
  /** Project the key points at, so a key from another project is visible. */
  proyecto: string;
}

/**
 * Tell an administrator exactly why account creation is or is not working.
 *
 * "Falta la llave" covers four different problems — not set, set with the
 * wrong scope, wrong key pasted, key from another project — and they need
 * different fixes. This reports which one it is, without ever returning the
 * key: only its length, its shape, and whether Supabase accepts it.
 */
export async function diagnosticarServiceRole(): Promise<
  { ok: true; datos: Diagnostico } | { ok: false; error: string }
> {
  const problema = await exigirAdmin();
  if (problema) return { ok: false, error: problema };

  const bruto = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const llave = bruto.trim();
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";

  const datos: Diagnostico = {
    presente: llave.length > 0,
    longitud: llave.length,
    formato: "ausente",
    esLaAnon: llave.length > 0 && llave === anon.trim(),
    prueba: "sin-llave",
    proyecto: SUPABASE_URL.replace(/^https:\/\/|\.supabase\.co.*$/g, ""),
  };

  if (llave.startsWith("sb_publishable_")) datos.formato = "publicable-o-anon";
  else if (llave.startsWith("sb_secret_")) datos.formato = "secreta";
  else if (llave.startsWith("eyJ")) {
    // A Supabase JWT carries its role in the payload; anon and service_role
    // look identical from the outside, so the claim is what tells them apart.
    try {
      const carga = JSON.parse(
        Buffer.from(llave.split(".")[1] ?? "", "base64").toString("utf8"),
      );
      datos.formato =
        carga.role === "service_role" ? "service_role" : "publicable-o-anon";
    } catch {
      datos.formato = "desconocido";
    }
  } else if (llave.length > 0) datos.formato = "desconocido";

  const admin = getAdminClient();
  if (admin) {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    datos.prueba = error ? error.message : "ok";
  }

  return { ok: true, datos };
}

// ------------------------------------------------------------ alta de cliente

/** Lo que el formulario de alta manda. Las claves son nombres de columna. */
export type NuevoCliente = DatosLead;

/** Contactos existentes que coinciden con los datos dados. */
export async function revisarDuplicados(
  datos: DatosContacto,
): Promise<{ ok: boolean; error: string | null; coincidencias: Coincidencia[] }> {
  const supabase = await getServerClient();
  if (!supabase) return { ...NO_SESSION, coincidencias: [] };

  return {
    ok: true,
    error: null,
    coincidencias: buscarDuplicados(datos, await contactosConocidos(supabase)),
  };
}

/**
 * Dar de alta un cliente con su primera oportunidad.
 *
 * La pantalla de Clientes lista oportunidades, no clientes: un cliente sin
 * ninguna no aparecería en ningún lado. Por eso el alta crea las dos cosas.
 *
 * El trabajo está en `@/lib/crm/altaLead`, compartido con la API que usa n8n,
 * para que un lead entre igual por el formulario que por la automatización.
 */
export async function crearCliente(
  datos: NuevoCliente,
  /** Crear aunque coincida con un contacto existente. */
  forzar = false,
): Promise<ActionResult & { codigo?: string; coincidencias?: Coincidencia[] }> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const r = await altaLead(supabase, datos, forzar);
  if (r.ok) revalidatePath("/");

  return { ok: r.ok, error: r.error, codigo: r.codigo, coincidencias: r.coincidencias };
}

// -------------------------------------------------------- importación masiva

/** Una fila lista para insertar, ya validada y resuelta por la pantalla. */
export interface FilaParaImportar {
  /**
   * Cliente existente al que sumar esta oportunidad. Con esto no se crea una
   * ficha nueva: se completan sus huecos y se le agrega la oportunidad.
   */
  unificar_con?: number | null;
  /**
   * Filas del archivo que son la misma persona, todavía sin ficha en el CRM.
   *
   * Las que comparten este valor crean UN solo cliente entre todas y le
   * cuelgan una oportunidad cada una. Sin esto, alguien que en la planilla
   * preguntó por tres programas entraría como tres personas distintas, que es
   * el mismo problema que `unificar_con` resuelve del otro lado.
   *
   * Vacío o ausente: la fila es su propia persona.
   */
  grupo?: string | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  vendedor_id: number | null;
  producto_id: number | null;
  territorio_id: number | null;
  canal_id: number | null;
  etapa_id: number | null;
  estado_id: number | null;
  fecha_registro: string;
  fecha_cierre: string | null;
  valor_oportunidad: number | null;
  venta_cerrada: number | null;
  descuento_promocion: string | null;
}

export interface ResultadoImportacion {
  ok: boolean;
  error: string | null;
  /** Cuántos clientes con su oportunidad quedaron creados. */
  creados: number;
  /** Códigos asignados, para que la pantalla los muestre. */
  desde: string | null;
  hasta: string | null;
  /** Base abierta para esta importación, si se pudo registrar. */
  importacionId?: number | null;
}

/**
 * Insertar un lote de clientes con su primera oportunidad.
 *
 * Va en dos inserciones masivas y no fila por fila: 300 clientes serían 600
 * viajes de ida y vuelta, y a mitad de camino un corte dejaría la mitad
 * cargada sin forma de saber cuál.
 */
export async function importarClientes(
  filas: FilaParaImportar[],
  /** Nombre del archivo, para poder encontrar la base después. */
  archivo?: string,
  /**
   * Id de una base ya abierta. La pantalla manda de a 200 filas; sin esto,
   * un archivo grande aparecería como varias bases distintas.
   */
  importacionId?: number | null,
): Promise<ResultadoImportacion> {
  const vacio = { creados: 0, desde: null, hasta: null };

  if (filas.length === 0) {
    return { ok: false, error: "No hay filas para importar.", ...vacio };
  }
  if (filas.length > 500) {
    return { ok: false, error: "Máximo 500 filas por lote.", ...vacio };
  }

  const supabase = await getServerClient();
  if (!supabase) return { ...NO_SESSION, ...vacio };

  // El encabezado se abre en el primer lote y se reutiliza en los siguientes.
  // Si la tabla todavía no existe —falta correr la migración— la importación
  // sigue adelante sin registrar la base: es preferible a no poder importar.
  let baseId: number | null = importacionId ?? null;
  if (baseId == null && archivo) {
    const { data: { user } = { user: null } } = await supabase.auth.getUser();
    const { data: base } = await supabase
      .from("importaciones")
      .insert({ archivo, filas: 0, creado_por: user?.id ?? null })
      .select("id")
      .single();
    baseId = (base?.id as number | undefined) ?? null;
  }

  // Las filas que se unifican no crean cliente: usan el que ya existe. Las
  // demás se juntan por `grupo`, de modo que tres filas de la misma persona
  // creen una ficha y no tres. El reparto está en `@/lib/crm/lotesImportacion`
  // para poder probarlo aparte.
  const reparto = repartir(filas);

  let creados: { id: number }[] = [];
  if (reparto.grupos.length > 0) {
    // De cada grupo manda su primera fila. Los datos ya vienen unificados
    // desde la pantalla, que eligió el nombre más completo y rellenó los
    // huecos con lo que trajeran las otras filas.
    const cabeceras = reparto.cabeceras.map((i) => filas[i]);

    const { data, error: errClientes } = await supabase
      .from("clientes")
      .insert(
        cabeceras.map((f) => ({
          nombre: f.nombre.trim(),
          telefono: f.telefono,
          correo: f.correo,
          territorio_id: f.territorio_id,
        })),
      )
      .select("id");

    if (errClientes) return { ok: false, error: errClientes.message, ...vacio };
    if (!data || data.length !== reparto.grupos.length) {
      return {
        ok: false,
        error: "La base devolvió menos clientes de los enviados; no se importó nada.",
        ...vacio,
      };
    }
    creados = data as { id: number }[];
  }

  // Completar los huecos de los contactos que se unifican. Va de a uno: son
  // pocos comparados con el lote, y cada uno necesita leer lo que ya tiene
  // para no pisarlo.
  const aUnificar = filas.filter((f) => f.unificar_con != null);
  if (aUnificar.length > 0) {
    const ids = [...new Set(aUnificar.map((f) => f.unificar_con as number))];
    const { data: existentes } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, telefono_secundario, correo, territorio_id")
      .in("id", ids);

    for (const previo of existentes ?? []) {
      const fila = aUnificar.find((f) => f.unificar_con === previo.id);
      if (!fila) continue;
      const plan = planificarFusion(previo, {
        nombre: fila.nombre,
        telefono: fila.telefono,
        correo: fila.correo,
        territorio_id: fila.territorio_id,
      });
      if (Object.keys(plan.parche).length > 0) {
        await supabase.from("clientes").update(plan.parche).eq("id", previo.id);
      }
    }
  }

  // Cada fila apunta a su cliente: el que ya existía, o el que se creó para
  // su grupo. Las filas de un mismo grupo apuntan todas al mismo.
  const clientes = asignarClientes(filas, reparto, creados).map((id) => ({ id }));

  const { data: previo } = await supabase
    .from("oportunidades")
    .select("codigo")
    .like("codigo", "CRM-%")
    .order("codigo", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = numeroDeCodigo(previo?.codigo ?? null);
  const codigo = (i: number) => `CRM-${String(base + 1 + i).padStart(4, "0")}`;

  const { error: errOps } = await supabase.from("oportunidades").insert(
    filas.map((f, i) => ({
      codigo: codigo(i),
      importacion_id: baseId,
      cliente_id: clientes[i].id,
      vendedor_id: f.vendedor_id,
      producto_id: f.producto_id,
      territorio_id: f.territorio_id,
      canal_id: f.canal_id,
      etapa_id: f.etapa_id,
      estado_id: f.estado_id,
      fecha_registro: f.fecha_registro,
      fecha_cierre: f.fecha_cierre,
      valor_oportunidad: f.valor_oportunidad,
      venta_cerrada: f.venta_cerrada,
      descuento_promocion: f.descuento_promocion,
    })),
  );

  if (errOps) {
    // Los clientes ya entraron. Sin su oportunidad no aparecen en ninguna
    // pantalla, así que se deshacen: es preferible no importar nada a dejar
    // filas invisibles que después nadie encuentra para limpiar.
    // Sólo se deshacen los que creó este lote: borrar un contacto que ya
    // existía se llevaría por delante su historia anterior.
    if (creados.length > 0) {
      await supabase
        .from("clientes")
        .delete()
        .in("id", creados.map((c) => c.id));
    }
    return { ok: false, error: errOps.message, ...vacio };
  }

  // El contador de la base se acumula lote a lote.
  if (baseId != null) {
    const { data: previo } = await supabase
      .from("importaciones")
      .select("filas")
      .eq("id", baseId)
      .maybeSingle();

    await supabase
      .from("importaciones")
      .update({ filas: ((previo?.filas as number | undefined) ?? 0) + filas.length })
      .eq("id", baseId);
  }

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    creados: filas.length,
    desde: codigo(0),
    hasta: codigo(filas.length - 1),
    importacionId: baseId,
  };
}


// ----------------------------------------------------------------- unificar

export interface ResultadoFusion extends ActionResult {
  /** Código de la oportunidad que se agregó al contacto existente. */
  codigo?: string;
  /** Resumen en castellano de qué se completó. */
  completados?: string;
  /** Datos distintos que se conservaron como estaban. */
  choques?: Choque[];
}

/**
 * Sumar una oportunidad a un contacto que ya existe, en vez de duplicarlo.
 *
 * El esquema ya contempla que una persona tenga varias oportunidades —una por
 * programa que le interesa—, así que unificar no es un parche: es usar el
 * modelo como corresponde. Lo que se agrega es la oportunidad; del cliente
 * sólo se completan los campos que estaban vacíos.
 */
export async function unificarCliente(
  clienteId: number,
  datos: NuevoCliente,
): Promise<ResultadoFusion> {
  if (!datos.fecha_registro) {
    return { ok: false, error: "La fecha de registro es obligatoria." };
  }

  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { data: existente, error: errLeer } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, telefono_secundario, correo, territorio_id")
    .eq("id", clienteId)
    .maybeSingle();

  if (errLeer) return { ok: false, error: errLeer.message };
  if (!existente) {
    return { ok: false, error: "Ese contacto ya no existe. Recargá y volvé a intentar." };
  }

  const plan = planificarFusion(existente, {
    nombre: datos.nombre,
    telefono: datos.telefono,
    correo: datos.correo,
    territorio_id: datos.territorio_id,
  });

  if (Object.keys(plan.parche).length > 0) {
    const { error } = await supabase
      .from("clientes")
      .update(plan.parche)
      .eq("id", clienteId);
    if (error) return { ok: false, error: error.message };
  }

  // Mismo cálculo de código y mismo reintento que el alta normal.
  let ultimoError = "No se pudo asignar un código.";

  for (let intento = 0; intento < 5; intento += 1) {
    const { data: previo } = await supabase
      .from("oportunidades")
      .select("codigo")
      .like("codigo", "CRM-%")
      .order("codigo", { ascending: false })
      .limit(1)
      .maybeSingle();

    const codigo = `CRM-${String(numeroDeCodigo(previo?.codigo ?? null) + 1 + intento).padStart(4, "0")}`;

    const { error: errOp } = await supabase.from("oportunidades").insert({
      codigo,
      cliente_id: clienteId,
      vendedor_id: datos.vendedor_id,
      producto_id: datos.producto_id,
      territorio_id: datos.territorio_id,
      canal_id: datos.canal_id,
      etapa_id: datos.etapa_id,
      estado_id: datos.estado_id,
      fecha_registro: datos.fecha_registro,
      fecha_cierre: datos.fecha_cierre,
      valor_oportunidad: datos.valor_oportunidad,
      descuento_promocion: datos.descuento_promocion,
    });

    if (!errOp) {
      revalidatePath("/");
      return {
        ok: true,
        error: null,
        codigo,
        completados: listarCampos(plan.completados),
        choques: plan.choques,
      };
    }

    ultimoError = errOp.message;
    if (!errOp.message.includes("duplicate key") && errOp.code !== "23505") break;
  }

  return { ok: false, error: ultimoError };
}

/**
 * Cambia un mismo dato en varias oportunidades de una vez.
 *
 * Es para el trabajo que hoy se hace abriendo una ficha tras otra: repartir
 * treinta leads entre asesores, mover a «Perdido» los que no contestaron,
 * corregir el programa de una tanda que se importó mal.
 *
 * LO QUE SE PUEDE CAMBIAR, Y POR QUÉ NADA MÁS
 *
 * Sólo vendedor, etapa, programa y estado: son los cuatro que tienen sentido
 * iguales para un grupo. El valor, la fecha de cierre o el descuento son de
 * cada trato, y ponerlos en masa sería casi siempre un error caro y silencioso.
 * La lista blanca está acá y no en la pantalla: una acción de servidor la puede
 * llamar cualquiera con sesión, así que lo que no está permitido tiene que ser
 * imposible, no sólo estar escondido.
 *
 * Se escribe en un solo `update ... in (...)`: es una sola transacción para la
 * base, así que o quedan todas o no queda ninguna. Media tanda cambiada sería
 * peor que ninguna, porque no habría forma de saber cuál mitad.
 */
export interface CambioEnLote {
  vendedor_id?: number | null;
  etapa_id?: number | null;
  producto_id?: number | null;
  estado_id?: number | null;
}

const CAMPOS_EN_LOTE = ["vendedor_id", "etapa_id", "producto_id", "estado_id"] as const;

/** Cuántas se pueden tocar de una vez. */
const TOPE_LOTE = 300;

export async function actualizarVarias(
  ids: number[],
  cambio: CambioEnLote,
): Promise<ActionResult & { cuantas?: number }> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const limpios = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (limpios.length === 0) return { ok: false, error: "No hay ninguna seleccionada." };
  if (limpios.length > TOPE_LOTE) {
    return { ok: false, error: `Son demasiadas de una vez: el tope es ${TOPE_LOTE}.` };
  }

  // Se copia campo por campo desde la lista blanca en vez de pasar el objeto
  // entero: así una clave de más que llegue en la llamada no toca nada.
  const patch: Record<string, number | null> = {};
  for (const campo of CAMPOS_EN_LOTE) {
    if (campo in cambio) patch[campo] = cambio[campo] ?? null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No se pidió ningún cambio." };
  }

  const { data, error } = await supabase
    .from("oportunidades")
    .update(patch)
    .in("id", limpios)
    .select("id");

  if (error) return { ok: false, error: error.message };

  const cuantas = (data ?? []).length;

  // Menos de las pedidas quiere decir que a algunas no llegan los permisos de
  // quien está trabajando. Decirlo es mejor que un «listo» que esconde que la
  // mitad quedó igual.
  if (cuantas < limpios.length) {
    revalidatePath("/");
    return {
      ok: true,
      error: `Se cambiaron ${cuantas} de ${limpios.length}. Al resto no llegan tus permisos.`,
      cuantas,
    };
  }

  revalidatePath("/");
  return { ok: true, error: null, cuantas };
}

/**
 * Enlaza una cuenta del CRM con su ficha de vendedor.
 *
 * Es el dato del que depende todo el filtrado por asesor: sin él la base no
 * puede saber que quien entró es el vendedor #1, y esa persona no ve ninguna
 * oportunidad. Se rellena solo por correo al correr la migración; esto es para
 * los que no coincidieron —un correo distinto, un vendedor cargado antes de
 * tener cuenta— y para cambiarlo cuando alguien deja el puesto.
 *
 * Se guarda en `vendedores.usuario_id` y no al revés porque un usuario puede no
 * ser vendedor —dirección entra y no atiende a nadie— mientras que un vendedor
 * sin cuenta sigue siendo un vendedor válido al que asignarle leads.
 */
export async function enlazarVendedor(
  usuarioId: string,
  vendedorId: number | null,
): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return { ok: false, error: "Sólo dirección puede enlazar cuentas con vendedores." };
  }

  // Primero se suelta el enlace anterior de esta cuenta: la restricción sólo
  // deja una ficha por usuario, y sin soltarlo el cambio chocaría con ella.
  const { error: errSoltar } = await supabase
    .from("vendedores")
    .update({ usuario_id: null })
    .eq("usuario_id", usuarioId);

  if (errSoltar) {
    if (errSoltar.code === "42703") {
      return {
        ok: false,
        error: "Falta correr la migración 20260902120000_cada_quien_lo_suyo.sql en Supabase.",
      };
    }
    return { ok: false, error: errSoltar.message };
  }

  if (vendedorId == null) {
    revalidatePath("/");
    return { ok: true, error: null };
  }

  const { error } = await supabase
    .from("vendedores")
    .update({ usuario_id: usuarioId })
    .eq("id", vendedorId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Esa ficha de vendedor ya está enlazada con otra cuenta." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
