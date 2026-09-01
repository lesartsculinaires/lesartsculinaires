"use server";

import { revalidatePath } from "next/cache";

import { altaLead } from "@/lib/crm/altaLead";
import {
  armarLead,
  nombreParaElLead,
  redactarNota,
  revisar,
  type Campo,
  type Formulario,
  type Respuestas,
} from "@/lib/formularios";
import type { Coincidencia } from "@/lib/duplicados";
import { getServerClient, getUser } from "@/lib/supabase/server";

/**
 * Responder un formulario de feria: un lead que entra ya cargado.
 *
 * Reusa `altaLead`, el mismo camino que usan la pantalla de alta y la API de
 * n8n. Eso importa: el aviso de duplicados, el código «CRM-0582» y el registro
 * de actividad salen de ahí, así que un lead de feria queda igual de completo
 * que cualquier otro. Escribir el insert acá habría sido más corto y habría
 * dejado leads de segunda.
 */

export interface ResultadoRespuesta {
  ok: boolean;
  error: string | null;
  /** Falta correr la migración de formularios. */
  faltaMigracion: boolean;
  /** El código asignado, para poder mostrarlo al terminar. */
  codigo?: string;
  oportunidadId?: number;
  /** Un problema por pregunta, para pintarlo al lado. */
  problemas?: Record<number, string>;
  /** Contactos parecidos que frenaron el alta; se puede insistir. */
  coincidencias?: Coincidencia[];
}

const SIN_SESION: ResultadoRespuesta = {
  ok: false,
  error: "Sesión vencida. Volvé a entrar.",
  faltaMigracion: false,
};

/** Hoy, como «2026-08-21». Es la fecha de registro del lead. */
function hoy(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export async function responderFormulario(
  formulario: Formulario,
  respuestas: Respuestas,
  /** Dar de alta aunque se parezca a alguien que ya está. */
  forzar = false,
): Promise<ResultadoRespuesta> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return SIN_SESION;

  const campos: Campo[] = formulario.campos;

  // Se revisa de nuevo del lado del servidor. La pantalla ya avisó mientras se
  // escribía, pero eso es una cortesía: por acá también entran pedidos que no
  // pasaron por ella.
  const problemas = revisar(campos, respuestas);
  if (Object.keys(problemas).length > 0) {
    return {
      ok: false,
      faltaMigracion: false,
      error: "Faltan cosas por contestar.",
      problemas,
    };
  }

  const lead = armarLead(campos, respuestas);

  /*
   * El nombre, que es lo único que la base exige sí o sí.
   *
   * Ninguna pregunta es obligatoria, así que puede llegar vacío. Cuando pasa,
   * se arma con el teléfono o el correo en vez de frenar: en una feria, con la
   * persona enfrente, perder el contacto entero por un campo en blanco es peor
   * que una ficha que hay que renombrar después.
   */
  const nombre = nombreParaElLead(lead);
  if (!nombre) {
    return {
      ok: false,
      faltaMigracion: false,
      error:
        campos.some((c) => c.mapeaA === "nombre")
          ? "Poné al menos el nombre, el teléfono o el correo. Con el formulario " +
            "en blanco no hay a quién guardar."
          : "Este formulario no tiene ninguna pregunta que dé el nombre del lead. " +
            "Editalo y marcá cuál de las preguntas es el nombre.",
    };
  }

  /**
   * Quién lo atiende: el asesor que está llenando, si tiene ficha de vendedor.
   *
   * Sale de la base y no de la pantalla —`mi_vendedor_id()` es la misma
   * función que decide qué oportunidades ve cada quien—, así que el lead nace
   * asignado a quien lo levantó en la feria. Sin ficha enlazada queda sin
   * dueño, que es lo correcto: es un lead de todos hasta que alguien lo tome.
   */
  const { data: vendedorId } = await supabase.rpc("mi_vendedor_id");

  const alta = await altaLead(
    supabase,
    {
      nombre,
      telefono: lead.telefono,
      correo: lead.correo,
      edad: lead.edad,
      responsable_nombre: lead.responsable_nombre,
      responsable_telefono: lead.responsable_telefono,
      responsable_correo: lead.responsable_correo,
      vendedor_id: vendedorId == null ? null : Number(vendedorId),
      producto_id: lead.producto_id,
      territorio_id: lead.territorio_id ?? formulario.territorioId,
      canal_id: formulario.canalId,
      etapa_id: formulario.etapaId,
      estado_id: formulario.estadoId,
      fecha_registro: hoy(),
      fecha_cierre: null,
      valor_oportunidad: null,
      descuento_promocion: null,
    },
    forzar,
  );

  if (!alta.ok) {
    return {
      ok: false,
      faltaMigracion: false,
      error: alta.error,
      coincidencias: alta.coincidencias,
    };
  }

  /**
   * La nota con todo lo contestado.
   *
   * Va después del alta y su fallo no tumba el lead: si por lo que sea no se
   * puede escribir, es preferible un lead sin la nota que perder a la persona
   * que está parada en el stand. La respuesta cruda queda guardada igual más
   * abajo, así que el dato no se pierde en ningún caso.
   */
  if (alta.oportunidadId != null) {
    await supabase.from("oportunidad_notas").insert({
      oportunidad_id: alta.oportunidadId,
      nota: redactarNota(formulario, campos, respuestas),
    });
  }

  /*
   * Los demás programas que marcó.
   *
   * En una feria alguien dice que le interesan Pastelería y Barismo. El
   * primero va en `producto_id` —es el que lleva la plata del trato— y los
   * demás quedan anotados acá. Con eso, la próxima base que la traiga por
   * Barismo cae sobre este mismo lead en vez de abrirle otro.
   *
   * No frena el alta si falla: la persona ya está guardada, que es lo que
   * importa, y lo marcado queda igual en la nota y en la respuesta cruda.
   */
  if (alta.oportunidadId != null && lead.programas_interes.length > 0) {
    await supabase
      .from("oportunidad_programas")
      .insert(
        lead.programas_interes.map((producto_id) => ({
          oportunidad_id: alta.oportunidadId as number,
          producto_id,
        })),
      );
  }

  const { error } = await supabase.from("formulario_respuestas").insert({
    formulario_id: formulario.id,
    cliente_id: alta.clienteId ?? null,
    oportunidad_id: alta.oportunidadId ?? null,
    datos: respuestas,
    creado_por: user.id,
  });

  revalidatePath("/");

  /*
   * El lead ya existe. Que la copia cruda no se haya podido guardar no puede
   * contarse como un fracaso —el asesor lo cargaría dos veces, y en una feria
   * eso es una ficha duplicada por cada error—, pero tampoco puede pasar en
   * silencio: sin esto, un formulario que dejó de contar sus respuestas se ve
   * exactamente igual que uno que las cuenta bien.
   *
   * Lo contestado no se pierde en ningún caso: ya quedó escrito con todas las
   * letras en la nota de la ficha, unas líneas más arriba.
   */
  if (error) {
    return {
      ok: true,
      // Un cuerpo vacío es cómo contesta PostgREST cuando la tabla no está en
      // su esquema, y según la versión llega como 404 sin código. Se toma como
      // «falta la migración», que es lo que casi siempre es.
      faltaMigracion: error.code === "PGRST205" || !error.message,
      error:
        "El lead quedó cargado, pero no se pudo guardar la copia de lo contestado: " +
        (error.message || "faltan las tablas de formularios en Supabase.") +
        " Las respuestas están en la nota de la ficha.",
      codigo: alta.codigo,
      oportunidadId: alta.oportunidadId,
    };
  }

  return {
    ok: true,
    faltaMigracion: false,
    error: null,
    codigo: alta.codigo,
    oportunidadId: alta.oportunidadId,
  };
}

// ------------------------------------------------------- armar un formulario
//
// Crear y editar formularios es de administración, igual que los programas o
// los vendedores: una pregunta cambiada a mitad de la feria arruina los leads
// de ese día. La base lo hace cumplir con su política; acá se comprueba
// también para poder dar un mensaje en vez de un error crudo.

export interface ResultadoFormulario {
  ok: boolean;
  error: string | null;
  faltaMigracion: boolean;
  /** El formulario recién creado. */
  id?: number;
}

const SIN_PERMISO = (que: string): ResultadoFormulario => ({
  ok: false,
  error: `No tenés permiso para ${que}. Pedile a dirección que te habilite la casilla en Usuarios y Roles.`,
  faltaMigracion: false,
});

/**
 * ¿El rol de quien pide tiene esta casilla en Formularios?
 *
 * Antes acá se preguntaba `es_admin`, y por eso dirección podía tildarle
 * «crear» al Jefe de ventas sin que sirviera de nada. `puede` mira la casilla
 * del rol, y sigue devolviendo verdadero para dirección.
 *
 * Si la función todavía no existe —falta correr la migración— se cae a la
 * pregunta vieja. Es el comportamiento de antes, que es preferible a que nadie
 * pueda armar un formulario hasta que se corra el SQL.
 */
async function tienePermiso(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  accion: "crear" | "editar" | "eliminar",
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("puede", {
    p_modulo: "formularios",
    p_accion: accion,
  });

  const faltaLaFuncion =
    error != null &&
    (error.code === "PGRST202" ||
      /Could not find the function|does not exist/i.test(error.message ?? ""));

  if (!faltaLaFuncion) return data === true;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  return esAdmin === true;
}

/** Traduce el error de PostgREST a algo con lo que se pueda hacer algo. */
function explicar(codigo: string | undefined, mensaje: string | undefined): ResultadoFormulario {
  // Con la tabla ausente PostgREST contesta con el cuerpo vacío, así que un
  // mensaje en blanco significa eso y no «salió bien».
  if (codigo === "PGRST205" || codigo === "42P01" || !mensaje) {
    return {
      ok: false,
      faltaMigracion: true,
      error: "Falta correr la migración 20260906120000_formularios.sql en Supabase.",
    };
  }
  return { ok: false, faltaMigracion: false, error: mensaje };
}

export interface DatosFormulario {
  nombre: string;
  descripcion: string | null;
  canalId: number | null;
  etapaId: number | null;
  estadoId: number | null;
  territorioId: number | null;
}

export async function crearFormulario(datos: DatosFormulario): Promise<ResultadoFormulario> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  if (!(await tienePermiso(supabase, "crear"))) return SIN_PERMISO("armar formularios");

  const nombre = datos.nombre.trim();
  if (!nombre) {
    return { ok: false, error: "El formulario necesita un nombre.", faltaMigracion: false };
  }

  const { data, error } = await supabase
    .from("formularios")
    .insert({
      nombre,
      descripcion: datos.descripcion?.trim() || null,
      canal_id: datos.canalId,
      etapa_id: datos.etapaId,
      estado_id: datos.estadoId,
      territorio_id: datos.territorioId,
      creado_por: user.id,
    })
    .select("id")
    .single();

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false, id: Number((data as { id: number }).id) };
}

export async function editarFormulario(
  id: number,
  datos: DatosFormulario,
): Promise<ResultadoFormulario> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  if (!(await tienePermiso(supabase, "editar"))) return SIN_PERMISO("cambiar este formulario");

  const nombre = datos.nombre.trim();
  if (!nombre) {
    return { ok: false, error: "El formulario necesita un nombre.", faltaMigracion: false };
  }

  const { error } = await supabase
    .from("formularios")
    .update({
      nombre,
      descripcion: datos.descripcion?.trim() || null,
      canal_id: datos.canalId,
      etapa_id: datos.etapaId,
      estado_id: datos.estadoId,
      territorio_id: datos.territorioId,
    })
    .eq("id", id);

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false };
}

export async function alternarFormulario(
  id: number,
  activo: boolean,
): Promise<ResultadoFormulario> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  if (!(await tienePermiso(supabase, "editar"))) return SIN_PERMISO("cerrar o reabrir formularios");

  const { error } = await supabase.from("formularios").update({ activo }).eq("id", id);
  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false };
}

/** Una pregunta tal como la deja el constructor, todavía sin id de base. */
export interface CampoParaGuardar {
  etiqueta: string;
  ayuda: string | null;
  tipo: string;
  requerido: boolean;
  opciones: { texto: string; valor: number | null }[];
  mapeaA: string | null;
}

/**
 * Guardar las preguntas: se borran las de antes y se escriben las nuevas.
 *
 * Reemplazar en vez de ir campo por campo tiene un costo que conviene decir en
 * voz alta: los ids cambian, así que las respuestas viejas —que guardan el id
 * de cada pregunta— dejan de poder emparejarse con la pregunta actual. Se
 * acepta porque la alternativa es peor: llevar altas, bajas y reordenamientos
 * de a uno significa que un fallo a mitad de camino deja el formulario en un
 * estado que nadie pidió, con preguntas nuevas y viejas mezcladas.
 *
 * Las respuestas ya guardadas no se tocan y siguen siendo el registro de lo
 * que se contestó; además, cada lead se llevó su nota con las preguntas
 * escritas con todas las letras, así que lo contestado se sigue leyendo aunque
 * la pregunta cambie después.
 */
export async function guardarCampos(
  formularioId: number,
  campos: CampoParaGuardar[],
): Promise<ResultadoFormulario> {
  const supabase = await getServerClient();
  if (!supabase) {
    return { ok: false, error: "Sesión vencida. Volvé a entrar.", faltaMigracion: false };
  }

  if (!(await tienePermiso(supabase, "editar"))) return SIN_PERMISO("cambiar las preguntas");

  const limpios = campos.filter((c) => c.etiqueta.trim() !== "");
  if (limpios.length === 0) {
    return {
      ok: false,
      error: "Un formulario sin preguntas no se puede llenar.",
      faltaMigracion: false,
    };
  }
  if (!limpios.some((c) => c.mapeaA === "nombre")) {
    return {
      ok: false,
      error:
        "Marcá cuál de las preguntas es el nombre del lead. Sin eso no se puede crear la ficha.",
      faltaMigracion: false,
    };
  }

  const borrado = await supabase
    .from("formulario_campos")
    .delete()
    .eq("formulario_id", formularioId);
  if (borrado.error) return explicar(borrado.error.code, borrado.error.message);

  const { error } = await supabase.from("formulario_campos").insert(
    limpios.map((c, i) => ({
      formulario_id: formularioId,
      orden: i + 1,
      etiqueta: c.etiqueta.trim(),
      ayuda: c.ayuda?.trim() || null,
      tipo: c.tipo,
      requerido: c.requerido,
      // Sólo los tipos de opción las llevan; en los demás una lista con cosas
      // adentro sería basura que después hay que explicar.
      opciones:
        c.tipo === "opcion" || c.tipo === "opciones"
          ? c.opciones.filter((o) => o.texto.trim() !== "")
          : [],
      mapea_a: c.mapeaA,
    })),
  );

  if (error) return explicar(error.code, error.message);

  revalidatePath("/");
  return { ok: true, error: null, faltaMigracion: false };
}
