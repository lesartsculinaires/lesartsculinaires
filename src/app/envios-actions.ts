"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarPlantilla, hayWhatsapp } from "@/lib/whatsapp/enviar";
import { conValores, cuantosHuecos } from "@/lib/whatsapp/huecos";
import {
  paraMeta,
  repartir,
  valoresPara,
  type Candidato,
  type Descarte,
  type Valor,
} from "@/lib/envios";
import type { ActionResult } from "@/app/actions";

/**
 * Envíos masivos por WhatsApp.
 *
 * ============================================================================
 * POR QUÉ ESTO NO ES «UNA LISTA Y UN BOTÓN»
 * ============================================================================
 *
 * Porque un envío masivo mal hecho no falla: funciona, y a las dos semanas el
 * número de la escuela deja de poder mandar nada. Meta le pone a cada número
 * una calificación de calidad que baja cuando la gente bloquea o reporta, y lo
 * que más hace que alguien bloquee es recibir dos veces el mismo mensaje.
 *
 * De ahí salen las cuatro decisiones que explican todo el archivo:
 *
 *   SE MANDA DE A TANDAS       La pantalla llama una vez por tanda, igual que
 *                              la importación. Una función de Netlify tiene
 *                              diez segundos; trescientos mensajes no entran.
 *                              Y así un corte a la mitad no pierde nada: los
 *                              que faltan siguen en «pendiente».
 *
 *   CADA UNO TIENE SU FILA     Se marca uno por uno al mandarlo. Reanudar es
 *                              seguir por los pendientes, y nadie recibe dos
 *                              veces.
 *
 *   SÓLO PLANTILLAS APROBADAS  Es lo único que WhatsApp deja mandarle a
 *                              alguien que no escribió en las últimas 24
 *                              horas. Un envío masivo por definición le llega
 *                              a gente fuera de esa ventana.
 *
 *   EL «NO MOLESTAR» MANDA     Se comprueba acá y no sólo en la pantalla: la
 *                              lista de destinatarios se arma en el servidor,
 *                              a partir de los ids que llegan, y quien pidió
 *                              que no le escriban queda afuera aunque venga
 *                              seleccionado.
 */

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** La tabla todavía no existe: falta correr la migración. */
const faltaLaTabla = (e: { code?: string; message?: string } | null): boolean =>
  e != null &&
  (e.code === "PGRST205" ||
    e.code === "42P01" ||
    e.code === "PGRST202" ||
    /Could not find the (table|function)|does not exist/i.test(e.message ?? ""));

const FALTA_MIGRACION =
  "Falta correr supabase/migrations/20261014120000_envios_masivos.sql en Supabase → SQL Editor.";

// ---------------------------------------------------------------- preparar

export interface Preparado extends ActionResult {
  envioId: number | null;
  /** Cuántos van a recibir el mensaje. */
  van: number;
  /** Cuántos quedaron afuera, por razón. */
  fuera: { porque: Descarte; cuantos: number; ejemplos: string[] }[];
  /** Cuántos destinatarios únicos salieron en las últimas 24 horas. */
  mandadosHoy: number;
}

const NADA: Preparado = {
  ok: true,
  error: null,
  envioId: null,
  van: 0,
  fuera: [],
  mandadosHoy: 0,
};

/**
 * Arma el envío con la gente seleccionada, sin mandar nada.
 *
 * Devuelve el reparto para que la pantalla pueda decir a quién se le va a
 * escribir y a quién no antes de que alguien apriete. Un «¿seguro?» sin ese
 * detalle no es una confirmación: mandarle a trescientas personas no se puede
 * deshacer, y la mitad de las veces lo que hay que revisar es justamente
 * quién quedó afuera.
 */
export async function prepararEnvio(
  /** Los leads seleccionados en la pantalla. */
  oportunidadIds: number[],
  nombre: string,
): Promise<Preparado> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...NADA, ...SIN_SESION };

  if (oportunidadIds.length === 0) {
    return { ...NADA, ok: false, error: "No hay nadie seleccionado." };
  }

  const { data: filas, error } = await supabase
    .from("oportunidades")
    .select("id, cliente_id, clientes(id, nombre, telefono, no_molestar)")
    .in("id", oportunidadIds);

  if (error) {
    if (/no_molestar/.test(error.message ?? "")) {
      return { ...NADA, ok: false, error: FALTA_MIGRACION };
    }
    return { ...NADA, ok: false, error: error.message };
  }

  const candidatos: Candidato[] = ((filas ?? []) as unknown as Record<string, unknown>[]).map(
    (f) => {
      // PostgREST devuelve la relación como objeto o como arreglo de uno.
      const anidado = f.clientes;
      const c = (Array.isArray(anidado) ? anidado[0] : anidado) as
        | Record<string, unknown>
        | null;
      return {
        clienteId: Number(f.cliente_id),
        oportunidadId: Number(f.id),
        nombre: c?.nombre == null ? null : String(c.nombre),
        telefono: c?.telefono == null ? null : String(c.telefono),
        noMolestar: Boolean(c?.no_molestar),
      };
    },
  );

  // A quiénes les mandamos algo en los últimos siete días. Repetirle a la
  // misma persona es lo que más hace que alguien bloquee el número.
  const recientes = new Set<number>();
  {
    const { data } = await supabase.rpc("ya_le_mandamos", {
      p_clientes: [...new Set(candidatos.map((c) => c.clienteId))],
      p_dias: 7,
    });
    for (const r of (data ?? []) as { cliente_id: number }[]) {
      recientes.add(Number(r.cliente_id));
    }
  }

  const reparto = repartir(candidatos, recientes);

  if (reparto.van.length === 0) {
    return {
      ...NADA,
      ok: false,
      error: "No queda nadie a quien mandarle: revisá el detalle de abajo.",
      fuera: agrupar(reparto.fuera),
    };
  }

  const { data: envio, error: errEnvio } = await supabase
    .from("envios")
    .insert({ nombre: nombre.trim() || "Envío sin nombre", creado_por: user.id })
    .select("id")
    .single();

  if (errEnvio) {
    return { ...NADA, ok: false, error: faltaLaTabla(errEnvio) ? FALTA_MIGRACION : errEnvio.message };
  }

  const envioId = Number(envio.id);

  const { error: errDest } = await supabase.from("envio_destinatarios").insert(
    reparto.van.map((c) => ({
      envio_id: envioId,
      cliente_id: c.clienteId,
      oportunidad_id: c.oportunidadId,
      /*
       * Ya normalizado, que es a dónde se va a mandar de verdad.
       *
       * En la ficha el teléfono está escrito de cualquier forma —«7797-2598»,
       * «+503 7797 2598»— y Meta acepta una sola. Guardar acá la versión que
       * sale sirve además para lo que viene después: cuando esa persona
       * conteste, el webhook trae el número en este mismo formato y puede
       * cruzarlo sin volver a normalizar nada.
       */
      telefono: paraMeta(c.telefono ?? ""),
      nombre: c.nombre,
    })),
  );

  if (errDest) {
    // El envío sin destinatarios no sirve para nada y quedaría en la lista
    // confundiendo. Se deshace.
    await supabase.from("envios").delete().eq("id", envioId);
    return { ...NADA, ok: false, error: errDest.message };
  }

  const { data: hoy } = await supabase.rpc("enviados_hoy");

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    envioId,
    van: reparto.van.length,
    fuera: agrupar(reparto.fuera),
    mandadosHoy: Number(hoy ?? 0),
  };
}

/** Junta los descartes por razón, con algunos nombres para poder revisarlos. */
function agrupar(
  fuera: { candidato: Candidato; porque: Descarte }[],
): { porque: Descarte; cuantos: number; ejemplos: string[] }[] {
  const m = new Map<Descarte, Candidato[]>();
  for (const f of fuera) {
    const lista = m.get(f.porque) ?? [];
    lista.push(f.candidato);
    m.set(f.porque, lista);
  }
  return [...m.entries()].map(([porque, gente]) => ({
    porque,
    cuantos: gente.length,
    // Tres alcanzan para reconocer si el descarte tiene sentido. La lista
    // entera sería una pantalla de nombres que nadie lee.
    ejemplos: gente.slice(0, 3).map((c) => c.nombre ?? c.telefono ?? "sin nombre"),
  }));
}

// ------------------------------------------------------------------ mandar

export interface Tanda extends ActionResult {
  /** Cuántos salieron en esta tanda. */
  enviados: number;
  fallidos: number;
  /** Cuántos quedan pendientes después de ésta. */
  faltan: number;
}

const SIN_TANDA: Tanda = { ok: true, error: null, enviados: 0, fallidos: 0, faltan: 0 };

/**
 * Cuántos van por llamada.
 *
 * La función tiene diez segundos para contestar y cada mensaje tarda unos
 * cientos de milisegundos, así que veinte entran con margen de sobra. Más
 * grande no gana nada: la pantalla llama otra vez enseguida, y una tanda que
 * se pasa del tiempo pierde el trabajo de todos los mensajes que ya salieron.
 */
const POR_TANDA = 20;

/**
 * Manda la siguiente tanda de un envío.
 *
 * ============================================================================
 * PRIMERO META, DESPUÉS LA BASE — Y UNO POR UNO
 * ============================================================================
 *
 * Cada destinatario se marca en el momento en que Meta lo acepta, no al final
 * de la tanda. Marcarlos todos juntos al terminar sería más rápido y estaría
 * mal: si la función se corta a la mitad, los diez que ya salieron quedarían
 * como pendientes y la siguiente tanda se los mandaría de nuevo.
 *
 * ============================================================================
 * UN FALLO NO CORTA LA TANDA
 * ============================================================================
 *
 * Un número que no tiene WhatsApp falla y no dice nada del resto. Se anota el
 * motivo en su fila y se sigue. Lo que sí corta es quedarse sin token, que
 * haría fallar a los trescientos.
 */
export async function mandarTanda(
  envioId: number,
  plantillaId: string,
  valores: Valor[],
): Promise<Tanda> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...SIN_TANDA, ...SIN_SESION };

  if (!hayWhatsapp()) {
    return { ...SIN_TANDA, ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: plantilla, error: errPlantilla } = await supabase
    .from("plantillas")
    .select("id, nombre, idioma, estado, cuerpo")
    .eq("id", plantillaId)
    .maybeSingle();

  if (errPlantilla) return { ...SIN_TANDA, ok: false, error: errPlantilla.message };
  if (!plantilla) return { ...SIN_TANDA, ok: false, error: "No se encontró la plantilla." };

  if (String(plantilla.estado).toUpperCase() !== "APPROVED") {
    return {
      ...SIN_TANDA,
      ok: false,
      error: "Esa plantilla no está aprobada por Meta, así que no se puede mandar.",
    };
  }

  const cuerpo = plantilla.cuerpo == null ? null : String(plantilla.cuerpo);
  const faltan = cuantosHuecos(cuerpo) - valores.length;
  if (faltan > 0) {
    return {
      ...SIN_TANDA,
      ok: false,
      error: `Faltan ${faltan} ${faltan === 1 ? "dato" : "datos"} de la plantilla.`,
    };
  }

  // Se deja constancia de con qué se mandó, en el propio envío: la plantilla
  // se puede borrar o cambiar en Meta y el historial no puede quedar diciendo
  // «plantilla 47».
  await supabase
    .from("envios")
    .update({
      plantilla_id: plantilla.id,
      plantilla_nombre: plantilla.nombre,
      idioma: plantilla.idioma,
      cuerpo,
      valores,
      estado: "enviando",
      empezado_en: new Date().toISOString(),
    })
    .eq("id", envioId)
    .is("empezado_en", null);

  const { data: pendientes, error: errPend } = await supabase
    .from("envio_destinatarios")
    .select("id, telefono, nombre")
    .eq("envio_id", envioId)
    .eq("estado", "pendiente")
    .order("id")
    .limit(POR_TANDA);

  if (errPend) {
    return { ...SIN_TANDA, ok: false, error: faltaLaTabla(errPend) ? FALTA_MIGRACION : errPend.message };
  }

  let enviados = 0;
  let fallidos = 0;

  for (const d of (pendientes ?? []) as unknown as Record<string, unknown>[]) {
    const nombre = d.nombre == null ? null : String(d.nombre);
    const suyos = valoresPara(valores, nombre);

    const envio = await enviarPlantilla(
      // Ya viene normalizado de cuando se armó el envío.
      String(d.telefono),
      String(plantilla.nombre),
      String(plantilla.idioma ?? "es"),
      suyos,
      cuerpo,
    );

    if (envio.ok) {
      enviados++;
      await supabase
        .from("envio_destinatarios")
        .update({
          estado: "enviado",
          wa_id: envio.waId,
          enviado_en: new Date().toISOString(),
          motivo: null,
        })
        .eq("id", Number(d.id));

      // Y queda en el hilo de esa persona, si tiene uno abierto: el envío
      // masivo no puede ser invisible desde la conversación, porque quien
      // conteste va a estar contestando algo que la asesora no vio salir.
      await dejarEnElHilo(supabase, String(d.telefono), conValores(cuerpo, suyos), envio.waId, user.id);
    } else {
      fallidos++;
      await supabase
        .from("envio_destinatarios")
        .update({ estado: "fallido", motivo: envio.error })
        .eq("id", Number(d.id));

      /*
       * Un token caído hace fallar a todos, y seguir sería marcar como
       * fallidos a trescientas personas a las que en realidad nunca se
       * intentó. Se corta y se dice.
       */
      if (/token de WhatsApp/i.test(envio.error ?? "")) {
        return {
          ok: false,
          error: envio.error,
          enviados,
          fallidos,
          faltan: await cuantosFaltan(supabase, envioId),
        };
      }
    }
  }

  const restantes = await cuantosFaltan(supabase, envioId);

  if (restantes === 0) {
    await supabase
      .from("envios")
      .update({ estado: "terminado", terminado_en: new Date().toISOString() })
      .eq("id", envioId);
  }

  revalidatePath("/");
  return { ok: true, error: null, enviados, fallidos, faltan: restantes };
}

type Cliente = NonNullable<Awaited<ReturnType<typeof getServerClient>>>;

async function cuantosFaltan(supabase: Cliente, envioId: number): Promise<number> {
  const { count } = await supabase
    .from("envio_destinatarios")
    .select("id", { count: "exact", head: true })
    .eq("envio_id", envioId)
    .eq("estado", "pendiente");
  return count ?? 0;
}

/**
 * Deja el mensaje en la conversación de esa persona, si ya tiene una.
 *
 * No abre hilos nuevos: crear trescientas conversaciones de golpe llenaría la
 * bandeja de gente que todavía no contestó nada, y la bandeja es una fila de
 * trabajo, no un registro de lo que salió. Cuando alguno conteste, el webhook
 * abre su hilo como con cualquier mensaje entrante.
 *
 * Nunca lanza: el mensaje ya salió, y no poder dejar la copia es molesto pero
 * no puede hacer que la tanda se dé por fallida.
 */
async function dejarEnElHilo(
  supabase: Cliente,
  telefono: string,
  texto: string,
  waId: string | null,
  usuarioId: string,
) {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("telefono", paraMeta(telefono))
      .maybeSingle();

    if (!conv) return;

    await supabase.from("mensajes").insert({
      conversacion_id: Number(conv.id),
      wa_id: waId,
      direccion: "saliente",
      tipo: "text",
      texto,
      estado: "enviado",
      enviado_por: usuarioId,
    });
  } catch {
    // Ver arriba: no puede costar la tanda.
  }
}

/** Frena un envío a mitad de camino. Lo mandado, mandado está. */
export async function cancelarEnvio(envioId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("envios")
    .update({ estado: "cancelado", terminado_en: new Date().toISOString() })
    .eq("id", envioId);

  if (error) return { ok: false, error: error.message };

  // Los que no salieron se marcan para que el resumen no los muestre como
  // pendientes para siempre.
  await supabase
    .from("envio_destinatarios")
    .update({ estado: "omitido", motivo: "se canceló el envío" })
    .eq("envio_id", envioId)
    .eq("estado", "pendiente");

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Marca —o desmarca— que esta persona no quiere recibir envíos. */
export async function noMolestar(clienteId: number, valor: boolean): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("clientes")
    .update({ no_molestar: valor })
    .eq("id", clienteId);

  if (error) {
    return { ok: false, error: faltaLaTabla(error) || /no_molestar/.test(error.message) ? FALTA_MIGRACION : error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
