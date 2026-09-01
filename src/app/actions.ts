"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import {
  altaLead,
  anotarCanal,
  contactosConocidos,
  numeroDeCodigo,
  type DatosLead,
} from "@/lib/crm/altaLead";
import {
  agruparEnLeads,
  asignarClientes,
  colgarDeLosQueYaEstan,
  repartir,
} from "@/lib/crm/lotesImportacion";
import { anotarSeguimientoDeNota, filaDeSeguimiento } from "@/lib/crm/notaConSeguimiento";
import { buscarDuplicados, type Coincidencia, type DatosContacto } from "@/lib/duplicados";
import {
  COLUMNAS_DE_FUSION,
  listarCampos,
  planificarFusion,
  type Choque,
  type DatosCliente,
} from "@/lib/fusion";
import {
  COLUMNAS_DE_LEAD,
  ETIQUETA_LEAD,
  cualAbsorbe,
  fundirEntrantes,
  listarCamposDeLead,
  planificarLead,
  type CampoLead,
  type LeadExistente,
  type PorQueNoSeJunta,
} from "@/lib/leadRepetido";
import { traerTodo } from "@/lib/supabase/paginar";
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

/**
 * Lo que hay que contarle al asesor después de guardar una nota.
 *
 * Casi siempre es nada. Cuando la nota pedía un seguimiento, es la frase que
 * dice qué se entendió: para qué día quedó anotado y cada cuánto se repite.
 */
export interface ResultadoNota extends ActionResult {
  /** «Seguimiento de pago el 15 de cada mes. El próximo, el 15 de septiembre.» */
  seguimiento: string | null;
}

/** Add a note to an opportunity's log. */
export async function addNota(
  oportunidadId: number,
  nota: string,
): Promise<ResultadoNota> {
  const texto = nota.trim();
  if (!texto) return { ok: true, error: null, seguimiento: null };

  const supabase = await getServerClient();
  if (!supabase) return { ...NO_SESSION, seguimiento: null };

  // Queda firmada. Una bitácora sin autor sirve para acordarse de qué pasó,
  // pero no para preguntarle a alguien; y cuando un cliente se pasa de asesor,
  // saber quién escribió cada cosa es la mitad del valor.
  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  const { data: guardada, error } = await supabase
    .from("oportunidad_notas")
    .insert({
      oportunidad_id: oportunidadId,
      nota: texto,
      origen: "comentario",
      autor_id: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, seguimiento: null };

  const seguimiento = await anotarSeguimientoDeNota(
    supabase,
    oportunidadId,
    texto,
    guardada?.id == null ? null : Number(guardada.id),
    user?.id ?? null,
  );

  revalidatePath("/");
  return { ok: true, error: null, seguimiento };
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
  /** Datos de la persona: se escriben en la ficha, no en la oportunidad. */
  pais?: string | null;
  fecha_nacimiento?: string | null;
  edad?: number | null;
  /**
   * Lo que traían las columnas que la pantalla marcó «Nota».
   *
   * Queda en la bitácora del lead, con el encabezado de cada columna adelante.
   * Es lo que antes se perdía: la planilla trae «horario que le queda» o «de
   * qué feria vino», el importador no tenía dónde ponerlo y la única opción
   * era no importar esa columna.
   */
  nota?: string | null;
}

interface OportunidadCreada {
  id: number;
  codigo: string | null;
}

/**
 * Las columnas sueltas de la planilla, ya en la bitácora de cada lead.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO NO PUEDE HACER FALLAR LA IMPORTACIÓN
 * ------------------------------------------------------------------------
 *
 * Porque para cuando corre, los clientes y las oportunidades ya están
 * escritos. Volver atrás trescientas filas porque una nota no entró sería
 * cambiar un problema chico —un dato de contexto que se copia a mano— por uno
 * grande: la base entera sin subir, y nadie sabiendo cuál mitad quedó.
 *
 * Así que no devuelve error: hace lo que puede y sigue. Si algo no entra, el
 * lead está igual y la columna se puede volver a subir.
 *
 * ------------------------------------------------------------------------
 * Y POR QUÉ TAMBIÉN DEJA RECORDATORIOS
 * ------------------------------------------------------------------------
 *
 * Porque una nota importada es una nota. Si la columna «estado de la gestión»
 * de la planilla dice «recuperación», tiene que agendar la llamada para dentro
 * de una semana igual que si la hubiera escrito el asesor en la ficha. Justo
 * ahí está el valor de subir esa columna: la base vieja de recuperaciones
 * entra al CRM ya con su agenda armada.
 */
async function guardarNotasDeLaBase(
  supabase: SupabaseClient,
  filas: readonly FilaParaImportar[],
  /*
   * De qué oportunidad es cada fila.
   *
   * Lo arma quien importa y llega hecho. Antes se resolvía acá por posición
   * —la fila `i` era la oportunidad `i`—, y eso dejó de ser cierto cuando
   * varias filas empezaron a fundirse en un solo lead: la nota de la segunda
   * fila de una persona habría ido a parar al lead de otra.
   */
  porFila: ReadonlyMap<number, number>,
): Promise<void> {
  const conNota = filas
    .map((f, i) => ({ texto: (f.nota ?? "").trim(), i }))
    .filter((x) => x.texto !== "");
  if (conNota.length === 0) return;

  /*
   * Una nota por lead, aunque hayan venido varias filas.
   *
   * Desde que las filas de una misma persona se funden en un solo lead, dos
   * filas con comentario caen en la misma oportunidad. Insertarlas por
   * separado dejaría dos notas —lo que no se pierde está bien— pero rompería
   * lo de abajo, que busca el texto por oportunidad para armar el
   * recordatorio: se quedaría con una y agendaría por la que no era.
   *
   * Se juntan con un punto medio, y las repetidas se dicen una sola vez: la
   * misma planilla suele traer el mismo comentario en las dos filas.
   */
  const textos = new Map<number, string[]>();
  for (const x of conNota) {
    const id = porFila.get(x.i);
    if (id == null) continue;
    const previos = textos.get(id) ?? [];
    if (!previos.includes(x.texto)) previos.push(x.texto);
    textos.set(id, previos);
  }

  const aInsertar = [...textos].map(([oportunidad_id, partes]) => ({
    oportunidad_id,
    nota: partes.join(" · "),
    origen: "importacion",
  }));
  if (aInsertar.length === 0) return;

  const { data: notas, error } = await supabase
    .from("oportunidad_notas")
    .insert(aInsertar)
    .select("id, oportunidad_id");
  if (error) return;

  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  // Un solo insert para todos los recordatorios que hayan salido de las notas.
  // Una planilla de recuperaciones los dispara todos a la vez, y de a uno
  // serían trescientos viajes.
  // El texto se busca por oportunidad y no por posición: cada lead lleva una
  // sola nota en este lote, así que la oportunidad la identifica, y si la base
  // devolviera las filas en otro orden el recordatorio seguiría siendo el de
  // su nota.
  const textoDe = new Map(aInsertar.map((n) => [n.oportunidad_id, n.nota]));

  const filasSeguimiento = (notas ?? [])
    .map((n) =>
      filaDeSeguimiento(n.oportunidad_id, textoDe.get(n.oportunidad_id) ?? "", n.id, user?.id ?? null),
    )
    .filter((f): f is Record<string, unknown> => f != null);

  if (filasSeguimiento.length > 0) {
    await supabase.from("seguimientos").insert(filasSeguimiento);
  }
}

export interface ResultadoImportacion {
  ok: boolean;
  error: string | null;
  /** Cuántos leads quedaron creados. Puede ser menos que las filas enviadas. */
  creados: number;
  /**
   * Filas que no crearon nada porque cayeron sobre un lead que ya existía.
   *
   * Se cuenta aparte para que la pantalla lo pueda decir: sin esto, «300 filas
   * → 280 leads» parece que se perdieron veinte.
   */
  juntados?: number;
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
  // `let` porque acá abajo se vuelve a armar: las filas de gente que ya está
  // en el CRM salen apuntando a su ficha en vez de creando una nueva.
  filas: FilaParaImportar[],
  /** Nombre del archivo, para poder encontrar la base después. */
  archivo?: string,
  /**
   * Id de una base ya abierta. La pantalla manda de a 200 filas; sin esto,
   * un archivo grande aparecería como varias bases distintas.
   */
  importacionId?: number | null,
  /**
   * Qué hacer con lo repetido, tal como lo eligió la pantalla.
   *
   * Hace falta acá porque el servidor vuelve a cotejar contra la tabla de
   * clientes entera —ve fichas que la pantalla no ve— y ese cotejo tiene que
   * apagarse cuando alguien eligió «crear». Si no, la salida de emergencia no
   * existiría: se pediría meter la fila tal cual y el servidor la uniría igual.
   */
  modo: "unificar" | "omitir" | "crear" = "unificar",
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

  /*
   * Subir una base es de quien tenga la casilla «crear» en Bases.
   *
   * Se pregunta acá y no sólo en la pantalla porque la pantalla se puede
   * saltar: quien tenga la llave pública del proyecto puede llamar a esta
   * acción por su cuenta. La política de `importaciones` lo impide igual; esto
   * está para que el «no» llegue como una frase que se entiende en vez de un
   * error de base de datos a mitad de un archivo de trescientas filas.
   *
   * Si la función todavía no existe —falta correr la migración— se sigue de
   * largo. Es lo mismo que hacía el CRM hasta ahora, y es preferible a que
   * nadie pueda importar hasta que se corra el SQL.
   */
  {
    const { data: autorizado, error } = await supabase.rpc("puede", {
      p_modulo: "bases",
      p_accion: "crear",
    });
    const faltaLaFuncion =
      error != null &&
      (error.code === "PGRST202" ||
        /Could not find the function|does not exist/i.test(error.message ?? ""));

    if (!faltaLaFuncion && autorizado !== true) {
      return {
        ok: false,
        error: "Subir bases es de dirección. Pedile a un administrador que te habilite el permiso.",
        ...vacio,
      };
    }
  }

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

  /*
   * La última comprobación contra duplicados, y la única que ve todo.
   *
   * La pantalla ya comparó, pero contra las oportunidades que el navegador
   * tenía cargadas: le faltan las que no le tocan a esa persona, las que
   * alguien dio de alta mientras se preparaba el archivo, y las fichas sin
   * ningún lead. Acá se lee la tabla de clientes entera, en el momento de
   * importar, así que el resultado no depende de quién esté mirando.
   *
   * Si la lectura falla se sigue sin ella: la pantalla ya hizo su parte, y
   * dejar de importar una base de trescientas filas por no poder cotejar sería
   * peor que arriesgar un repetido que se fusiona después.
   */
  if (modo !== "crear") {
    const { data: yaEstan, error: errConocidos } = await traerTodo<{
      id: number;
      nombre: string | null;
      telefono: string | null;
      correo: string | null;
    }>(() => supabase.from("clientes").select("id, nombre, telefono, correo").order("id"));

    if (errConocidos) {
      console.error("[importar] no se pudo cotejar contra los contactos que ya están", errConocidos);
    }

    filas = colgarDeLosQueYaEstan(
      filas,
      yaEstan.map((c) => ({
        clienteId: Number(c.id),
        nombre: String(c.nombre ?? ""),
        telefono: c.telefono,
        correo: c.correo,
      })),
    );
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
          pais: f.pais ?? null,
          fecha_nacimiento: f.fecha_nacimiento ?? null,
          edad: f.edad ?? null,
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
      .select(COLUMNAS_DE_FUSION)
      .in("id", ids);

    for (const previo of (existentes ?? []) as unknown as { id: number }[]) {
      /*
       * Todas las filas que caen en el mismo contacto, no la primera.
       *
       * Una base de cumpleaños puede traer a la misma persona dos veces —una
       * por programa que cursó— y sólo una de las dos con la fecha cargada.
       * Quedándose con la primera, el dato de la segunda no se escribía nunca.
       */
      const suyas = aUnificar.filter((f) => f.unificar_con === previo.id);
      if (suyas.length === 0) continue;

      // Se aplica una fila por vez sobre el resultado de la anterior: así lo
      // que completó la primera ya cuenta como ocupado para la segunda, y no
      // se pisa lo que acaba de entrar.
      let estado: Record<string, unknown> = { ...previo };
      const parche: Record<string, unknown> = {};

      for (const fila of suyas) {
        const plan = planificarFusion(estado, {
          nombre: fila.nombre,
          telefono: fila.telefono,
          correo: fila.correo,
          territorio_id: fila.territorio_id,
          pais: fila.pais ?? null,
          fecha_nacimiento: fila.fecha_nacimiento ?? null,
          edad: fila.edad ?? null,
        });
        Object.assign(parche, plan.parche);
        estado = { ...estado, ...plan.parche };
      }

      if (Object.keys(parche).length > 0) {
        await supabase.from("clientes").update(parche).eq("id", previo.id);
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

  /*
   * ---------------------------------------------------------------------
   * DE FILAS A LEADS
   * ---------------------------------------------------------------------
   *
   * Acá estaba el duplicado de la importación: se insertaba una oportunidad
   * por FILA. Tres filas de la misma persona creaban una ficha —eso andaba— y
   * tres leads colgando de ella, que es lo que la escuela veía repetido.
   *
   * Ahora las filas se juntan primero en leads por persona y programa, se
   * funden sus datos, y recién entonces se escribe. Una fila que se une a un
   * contacto que ya estaba puede además caer sobre un lead que ese contacto ya
   * tenía, y ahí no se crea nada: se completa el que hay.
   */
  const leads =
    modo === "crear"
      ? // «Crear» es meter todo tal cual: una fila, un lead, sin juntar nada.
        // Hoy en ese modo cada fila es además su propia ficha, así que agrupar
        // no juntaría nada igual; se dice explícito para que siga siendo
        // cierto si mañana la pantalla manda grupos en este modo.
        filas.map((f, i) => ({ filas: [i], clienteId: clientes[i].id, productoId: f.producto_id }))
      : agruparEnLeads(
          clientes.map((c) => c.id),
          filas.map((f) => f.producto_id),
        );

  const comoSeLee = await comoSeLeeUnLead(supabase);
  const finales = await estadosFinales(supabase);

  /** Los leads que ya tienen los contactos a los que se une este lote. */
  const yaTenian = new Map<number, LeadExistente[]>();
  {
    const ids = [...new Set(filas.map((f) => f.unificar_con).filter((v): v is number => v != null))];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("oportunidades")
        .select(COLUMNAS_DE_LEAD + ", cliente_id")
        .in("cliente_id", ids);

      for (const o of (data ?? []) as unknown as (LeadExistente & { cliente_id: number })[]) {
        const suyos = yaTenian.get(o.cliente_id) ?? [];
        suyos.push(o);
        yaTenian.set(o.cliente_id, suyos);
      }
    }
  }

  const comoEntrante = (f: FilaParaImportar) => ({
    vendedor_id: f.vendedor_id,
    producto_id: f.producto_id,
    territorio_id: f.territorio_id,
    canal_id: f.canal_id,
    etapa_id: f.etapa_id,
    estado_id: f.estado_id,
    fecha_registro: f.fecha_registro,
    fecha_cierre: f.fecha_cierre,
    valor_oportunidad: f.valor_oportunidad,
    descuento_promocion: f.descuento_promocion,
  });

  /** Para cada lead: sus valores fundidos y con qué se junta, si con algo. */
  const resueltos = leads.map((l) => {
    const fundido = fundirEntrantes(
      l.filas.map((i) => comoEntrante(filas[i])),
      comoSeLee,
    );
    const { lead: absorbe } = cualAbsorbe(
      yaTenian.get(l.clienteId) ?? [],
      fundido.valores,
      finales,
    );
    return { ...l, ...fundido, absorbe };
  });

  /** De qué fila salió cada lead que hay que crear, para el `venta_cerrada`. */
  const aCrear = resueltos.filter((r) => r.absorbe == null);

  const { data: opsCreadas, error: errOps } = await supabase.from("oportunidades").insert(
    aCrear.map((r, i) => ({
      codigo: codigo(i),
      importacion_id: baseId,
      cliente_id: r.clienteId,
      ...r.valores,
      // No se funde con las reglas de los otros campos: es plata cobrada, y lo
      // que corresponde entre varias filas del mismo trato es la suma, no la
      // primera. Un lote sin esta columna deja null, como antes.
      venta_cerrada: r.filas.reduce<number | null>((a, i) => {
        const v = filas[i].venta_cerrada;
        return v == null ? a : (a ?? 0) + v;
      }, null),
    })),
  )
    // Hacen falta los ids para colgarles la nota. Se piden en el mismo viaje:
    // una segunda consulta buscando por código traería lo mismo y podría no
    // encontrar una fila si el disparador de la base le cambió el número.
    .select("id, codigo");

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

  /*
   * Los leads que se juntaron con uno que el contacto ya tenía.
   *
   * No crean nada: completan los huecos del que está. Va de a uno porque cada
   * parche es distinto, y son pocos comparados con el lote.
   */
  for (const r of resueltos) {
    if (!r.absorbe) continue;

    const p = planificarLead(r.absorbe, r.valores, comoSeLee);
    if (Object.keys(p.parche).length > 0) {
      await supabase.from("oportunidades").update(p.parche).eq("id", r.absorbe.id);
    }

    // Lo que llegó distinto no se aplica, pero tampoco se tira: queda en la
    // bitácora del lead para que alguien lo mire.
    const choques = [...r.choques, ...p.choques];
    if (choques.length > 0) {
      await supabase.from("oportunidad_notas").insert({
        oportunidad_id: r.absorbe.id,
        origen: "importacion",
        nota:
          "Una base importada traía este mismo lead. Datos que llegaron distintos " +
          "y no se aplicaron: " +
          choques
            .map(
              (c) =>
                `${ETIQUETA_LEAD[c.campo as unknown as CampoLead]}: llegó «${c.entrante}», ` +
                `quedó «${c.actual}»`,
            )
            .join("; ") +
          ".",
      });
    }
  }

  /*
   * De qué oportunidad es cada fila del archivo.
   *
   * Antes era la posición: la fila `i` tenía la oportunidad `i`. Ya no, porque
   * varias filas pueden terminar en el mismo lead y otras en uno que ya
   * existía. Sin este mapa, las notas del archivo se colgarían del lead
   * equivocado.
   */
  const porFila = new Map<number, number>();
  {
    const creadasEnOrden = (opsCreadas ?? []) as unknown as OportunidadCreada[];
    const porCodigo = new Map(creadasEnOrden.map((op) => [op.codigo ?? "", op.id]));

    aCrear.forEach((r, i) => {
      // Lo normal es que vuelvan todas y en orden. Pueden volver menos: quien
      // importa ve sólo las oportunidades que le tocan, así que una asesora
      // subiendo una base repartida entre varios recibiría de vuelta nada más
      // las suyas. Ahí se busca por código, que es lo único que sigue siendo
      // de la fila.
      const id =
        creadasEnOrden.length === aCrear.length
          ? creadasEnOrden[i].id
          : porCodigo.get(codigo(i));
      if (id != null) for (const f of r.filas) porFila.set(f, id);
    });

    for (const r of resueltos) {
      if (r.absorbe) for (const f of r.filas) porFila.set(f, r.absorbe.id);
    }
  }

  await guardarNotasDeLaBase(supabase, filas, porFila);

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
    // Los leads que quedaron, no las filas que entraron: son distintos desde
    // que las filas repetidas de una persona se funden, y decir «300 creados»
    // cuando quedaron 280 leads es la clase de número que después no cuadra
    // con lo que se ve en la pantalla.
    creados: aCrear.length,
    juntados: resueltos.length - aCrear.length,
    desde: aCrear.length > 0 ? codigo(0) : null,
    hasta: aCrear.length > 0 ? codigo(aCrear.length - 1) : null,
    importacionId: baseId,
  };
}


// ----------------------------------------------------------------- unificar

/**
 * Los estados que dan por terminada una oportunidad: Ganado y Perdido.
 *
 * Se lee de la tabla y no de una lista de nombres acá porque la escuela puede
 * agregar estados desde el CRM, y `es_final` es la casilla que marca cuando lo
 * hace. Si la consulta falla, el conjunto vuelve vacío: nada se considera
 * cerrado y el peor caso es que se junte con un lead que no debía, que se ve y
 * se arregla. Al revés —dar todo por cerrado— abriría leads nuevos en silencio,
 * que es el problema que se está arreglando.
 */
async function estadosFinales(supabase: SupabaseClient): Promise<Set<number>> {
  const { data } = await supabase.from("estados").select("id, es_final");
  return new Set(
    ((data ?? []) as { id: number; es_final: boolean }[])
      .filter((e) => e.es_final)
      .map((e) => e.id),
  );
}

/**
 * Cómo se lee cada campo del lead en la pantalla, y el orden de las etapas.
 *
 * Los choques se muestran con lo que la persona ve —«Programa: quedó
 * Panadería»— y no con el id de la fila, que no le dice nada a nadie. Y el
 * orden de las etapas es lo que deja saber si la que entra va más adelante que
 * la que está, para no devolver un lead de Propuesta al principio del embudo.
 */
async function comoSeLeeUnLead(supabase: SupabaseClient): Promise<{
  ordenDeEtapa: Map<number, number>;
  comoSeLee: (campo: CampoLead, valor: unknown) => string;
}> {
  const [vend, prod, terr, can, eta, est] = await Promise.all([
    supabase.from("vendedores").select("id, nombre"),
    supabase.from("productos").select("id, nombre"),
    supabase.from("territorios").select("id, nombre"),
    supabase.from("canales").select("id, nombre"),
    supabase.from("etapas").select("id, nombre, orden"),
    supabase.from("estados").select("id, nombre"),
  ]);

  const mapa = (r: { data: unknown }): Map<number, string> =>
    new Map(
      ((r.data ?? []) as { id: number; nombre: string | null }[]).map((x) => [
        x.id,
        x.nombre ?? String(x.id),
      ]),
    );

  const nombres: Partial<Record<CampoLead, Map<number, string>>> = {
    vendedor_id: mapa(vend),
    producto_id: mapa(prod),
    territorio_id: mapa(terr),
    canal_id: mapa(can),
    etapa_id: mapa(eta),
    estado_id: mapa(est),
  };

  return {
    ordenDeEtapa: new Map(
      ((eta.data ?? []) as { id: number; orden: number | null }[]).map((e) => [
        e.id,
        e.orden ?? 0,
      ]),
    ),
    comoSeLee: (campo, valor) =>
      nombres[campo]?.get(Number(valor)) ?? String(valor),
  };
}

export interface ResultadoFusion extends ActionResult {
  /** Código de la oportunidad donde quedó todo. */
  codigo?: string;
  /**
   * Se juntó con un lead que ya existía en vez de abrir uno nuevo.
   *
   * Es lo que la pantalla necesita para no decir «se creó» cuando no se creó
   * nada: el mensaje cambia entero según esto.
   */
  seJunto?: boolean;
  /** Cuando hubo que abrir uno nuevo igual, por qué. */
  porQueNo?: PorQueNoSeJunta | null;
  /** Resumen en castellano de qué se completó de la persona. */
  completados?: string;
  /** Y qué se completó del lead. */
  completadosDelLead?: string;
  /** Datos distintos que se conservaron como estaban. */
  choques?: Choque[];
  /** Los del lead, con sus propias etiquetas. */
  choquesDelLead?: Choque[];
}

/**
 * Juntar un alta con un contacto que ya existe, sin dejar dos leads.
 *
 * ---------------------------------------------------------------------------
 * LO QUE HACÍA ANTES, Y POR QUÉ ESTABA MAL
 * ---------------------------------------------------------------------------
 *
 * Unificaba la ficha de la persona —eso siempre anduvo— y después abría una
 * oportunidad NUEVA. Quedaba una ficha con dos leads colgando, que en la
 * pantalla de Clientes se ve idéntico a un duplicado porque lo es: CRM-2625 y
 * CRM-2626, la misma persona, el mismo día, los dos vacíos.
 *
 * El comentario que estaba acá decía que el esquema contempla varias
 * oportunidades por persona, y es cierto —una por programa—, pero eso no
 * convierte en dos tratos a la misma carga hecha dos veces.
 *
 * ---------------------------------------------------------------------------
 * LO QUE HACE AHORA
 * ---------------------------------------------------------------------------
 *
 * Le pregunta a `leadRepetido.ts` cuál de los leads que ya tiene el contacto
 * se queda con éste. Si hay uno, lo completa y no crea nada: queda uno solo.
 * Si no lo hay —porque el que tiene es de otro programa, o porque ya está
 * cerrado— abre uno nuevo como antes, pero devuelve el motivo para que la
 * pantalla lo pueda decir en vez de dejar aparecer un código de la nada.
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
    .select(COLUMNAS_DE_FUSION)
    .eq("id", clienteId)
    .maybeSingle();

  if (errLeer) return { ok: false, error: errLeer.message };
  if (!existente) {
    return { ok: false, error: "Ese contacto ya no existe. Recargá y volvé a intentar." };
  }

  /*
   * Todo lo que trajo el alta, no sólo el contacto.
   *
   * Antes iban nombre, teléfono, correo y territorio, y nada más. La edad y
   * los datos del responsable se escribían en el formulario y se perdían al
   * unificar: un menor que ya estaba cargado sin responsable seguía sin él,
   * aunque quien lo dio de alta acabara de escribir el nombre del adulto.
   */
  const plan = planificarFusion(existente as unknown as DatosCliente, {
    nombre: datos.nombre,
    telefono: datos.telefono,
    correo: datos.correo,
    territorio_id: datos.territorio_id,
    edad: datos.edad ?? null,
    responsable_nombre: datos.responsable_nombre ?? null,
    responsable_telefono: datos.responsable_telefono ?? null,
    responsable_correo: datos.responsable_correo ?? null,
  });

  if (Object.keys(plan.parche).length > 0) {
    const { error } = await supabase
      .from("clientes")
      .update(plan.parche)
      .eq("id", clienteId);
    if (error) return { ok: false, error: error.message };
  }

  /*
   * Acá está el arreglo del duplicado: antes de abrir nada, se mira si alguno
   * de los leads que ya tiene el contacto es este mismo lead.
   */
  const entrante = {
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
  };

  const { data: suyas, error: errSuyas } = await supabase
    .from("oportunidades")
    .select(COLUMNAS_DE_LEAD)
    .eq("cliente_id", clienteId);

  if (errSuyas) return { ok: false, error: errSuyas.message };

  const { lead, porQueNo } = cualAbsorbe(
    (suyas ?? []) as unknown as LeadExistente[],
    entrante,
    await estadosFinales(supabase),
  );

  if (lead) {
    const p = planificarLead(lead, entrante, await comoSeLeeUnLead(supabase));

    if (Object.keys(p.parche).length > 0) {
      const { error } = await supabase
        .from("oportunidades")
        .update(p.parche)
        .eq("id", lead.id);
      if (error) return { ok: false, error: error.message };
    }

    await anotarCanal(supabase, clienteId, datos.canal_id, datos.fecha_registro);

    /*
     * Lo que no entró queda escrito en la bitácora del lead.
     *
     * Es la otra mitad de «que la información adicional se agregue»: un dato
     * que choca no se aplica —completar nunca borra— pero tampoco se tira. Se
     * anota, y queda en la ficha para que alguien lo mire.
     */
    if (p.choques.length > 0) {
      await supabase.from("oportunidad_notas").insert({
        oportunidad_id: lead.id,
        origen: "unificacion",
        nota:
          "Se unificó otra carga de este mismo lead. Datos que llegaron distintos " +
          "y no se aplicaron: " +
          p.choques
            .map(
              (c) =>
                `${ETIQUETA_LEAD[c.campo as unknown as CampoLead]}: llegó «${c.entrante}», ` +
                `quedó «${c.actual}»`,
            )
            .join("; ") +
          ".",
      });
    }

    revalidatePath("/");
    return {
      ok: true,
      error: null,
      codigo: lead.codigo ?? undefined,
      seJunto: true,
      porQueNo: null,
      completados: listarCampos(plan.completados),
      completadosDelLead: listarCamposDeLead(p.completados),
      choques: plan.choques,
      choquesDelLead: p.choques,
    };
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

    const { data: op, error: errOp } = await supabase.from("oportunidades").insert({
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
    })
      // El que vale es el que quedó guardado: si el propuesto ya lo tenía
      // otro, el disparador de la base le puso el siguiente libre.
      .select("codigo")
      .single();

    if (!errOp) {
      // El canal por el que llegó esta vez se suma al historial del contacto.
      // Es el punto de todo esto: unificar sin perder que ahora también
      // escribió por otro lado.
      await anotarCanal(supabase, clienteId, datos.canal_id, datos.fecha_registro);

      revalidatePath("/");
      return {
        ok: true,
        error: null,
        codigo: (op as { codigo: string | null } | null)?.codigo ?? codigo,
        // Se abrió uno nuevo: la pantalla tiene que decir por qué, o el código
        // que aparece se lee como el duplicado que se venía de arreglar.
        seJunto: false,
        porQueNo,
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

/**
 * Borra los leads seleccionados. Sólo dirección.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ SE COMPRUEBA ACÁ SI LA BASE YA LO HACE CUMPLIR
 * ------------------------------------------------------------------------
 *
 * Porque un borrado que la política niega no falla: no toca ninguna fila y
 * devuelve bien. Sin esta comprobación, una asesora apretaría el botón, vería
 * «listo» y los leads seguirían en la lista. Un permiso que se niega en
 * silencio se lee como una falla del sistema, y lo que hace la gente es
 * intentarlo otra vez.
 *
 * Así que la base sigue siendo la que manda —esto no la reemplaza— y acá se
 * traduce su «no» a algo que se entiende.
 *
 * ------------------------------------------------------------------------
 * LO QUE SE LLEVA
 * ------------------------------------------------------------------------
 *
 * El lead y todo lo que cuelga de él: notas, adjuntos, eventos, links de pago,
 * recordatorios y seguimientos. La ficha del cliente NO se borra: una persona
 * puede tener otros leads, y aunque no los tenga, su ficha es el registro de
 * que existió. Borrar contactos es otra decisión y se hace desde otro lado.
 *
 * Devuelve cuántos se borraron de verdad, contados sobre la base y no sobre lo
 * que se pidió: si alguno ya no estaba —dos personas borrando lo mismo— el
 * número lo dice en vez de afirmar de más.
 */
export async function borrarLeads(
  ids: number[],
): Promise<ActionResult & { cuantos?: number }> {
  const supabase = await getServerClient();
  if (!supabase) return NO_SESSION;

  const limpios = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (limpios.length === 0) return { ok: false, error: "No hay ningún lead seleccionado." };

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) {
    return {
      ok: false,
      error: "Borrar leads es de dirección. Pedile a dirección que los elimine.",
    };
  }

  const { data: borrados, error } = await supabase
    .from("oportunidades")
    .delete()
    .in("id", limpios)
    .select("id");

  if (error) return { ok: false, error: error.message };

  const cuantos = (borrados ?? []).length;
  revalidatePath("/");
  return { ok: true, error: null, cuantos };
}

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
