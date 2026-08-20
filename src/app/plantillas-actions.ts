"use server";

import { revalidatePath } from "next/cache";

import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarPlantilla } from "@/lib/whatsapp/enviar";
import { hayWaba, panelDeMeta, traerPlantillas } from "@/lib/whatsapp/plantillas";
import type { Plantilla } from "@/lib/types";

/**
 * Las plantillas de WhatsApp.
 *
 * Meta es el dueño: se crean y se aprueban en su panel, y de acá sólo se leen
 * y se mandan. La copia local existe para que la pantalla sirva aunque la API
 * no conteste —o aunque WhatsApp todavía no esté conectado—, y para poder
 * decir cuándo fue la última sincronización.
 */

export interface EstadoPlantillas {
  plantillas: Plantilla[];
  /** Cuándo se intentó sincronizar por última vez, haya salido bien o no. */
  intentadoEn: string | null;
  logradoEn: string | null;
  /** Qué falló la última vez, si falló. */
  error: string | null;
  /** False cuando el servidor no tiene con qué hablar con Meta. */
  puedeSincronizar: boolean;
  /** A dónde manda el botón «Crear plantilla». */
  panel: string;
  faltaMigracion: boolean;
}

const faltaTabla = (codigo: string | undefined) =>
  codigo === "42P01" || codigo === "PGRST205";

const FALTA_MIGRACION =
  "Falta correr la migración 20260831120000_plantillas.sql en Supabase.";

export async function estadoPlantillas(): Promise<EstadoPlantillas> {
  const base: EstadoPlantillas = {
    plantillas: [],
    intentadoEn: null,
    logradoEn: null,
    error: null,
    puedeSincronizar: hayWaba(),
    panel: panelDeMeta(),
    faltaMigracion: false,
  };

  const supabase = await getServerClient();
  if (!supabase) return base;

  const [lista, sync] = await Promise.all([
    supabase
      .from("plantillas")
      .select("id, nombre, idioma, estado, categoria, cuerpo, variables")
      .order("nombre"),
    supabase
      .from("plantillas_sync")
      .select("intentado_en, logrado_en, error")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (lista.error) {
    return { ...base, faltaMigracion: faltaTabla(lista.error.code) || !lista.error.message };
  }

  return {
    ...base,
    plantillas: (lista.data ?? []).map((p) => ({
      id: String(p.id),
      nombre: String(p.nombre),
      idioma: String(p.idioma),
      estado: String(p.estado),
      categoria: p.categoria ? String(p.categoria) : null,
      cuerpo: p.cuerpo ? String(p.cuerpo) : null,
      variables: Number(p.variables ?? 0),
    })),
    intentadoEn: sync.data?.intentado_en ? String(sync.data.intentado_en) : null,
    logradoEn: sync.data?.logrado_en ? String(sync.data.logrado_en) : null,
    error: sync.data?.error ? String(sync.data.error) : null,
  };
}

/**
 * Trae de Meta lo que haya y pisa la copia local.
 *
 * Se escribe con la llave de servicio a propósito: la tabla no tiene política
 * de escritura porque no hay ningún caso en que una persona deba editarla a
 * mano —la copia se pisa en la siguiente sincronización y Meta no se entera—.
 *
 * Las que ya no están en Meta se borran acá. Dejarlas sería peor que no
 * tenerlas: aparecerían para elegir y el envío fallaría.
 */
export async function sincronizarPlantillas(): Promise<{ ok: boolean; error: string | null }> {
  const usuario = await getUser();
  if (!usuario) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const admin = getAdminClient();
  if (!admin) {
    return {
      ok: false,
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor: sin eso no se puede guardar lo que devuelve Meta.",
    };
  }

  const ahora = new Date().toISOString();
  const anotar = async (error: string | null, logrado: boolean) => {
    const fila: Record<string, unknown> = { id: 1, intentado_en: ahora, error };
    if (logrado) fila.logrado_en = ahora;
    await admin.from("plantillas_sync").upsert(fila, { onConflict: "id" });
  };

  const traido = await traerPlantillas();

  if (!traido.ok) {
    await anotar(traido.error, false);
    revalidatePath("/");
    return { ok: false, error: traido.error };
  }

  if (traido.plantillas.length > 0) {
    const { error } = await admin.from("plantillas").upsert(
      traido.plantillas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        idioma: p.idioma,
        estado: p.estado,
        categoria: p.categoria,
        cuerpo: p.cuerpo,
        variables: p.variables,
        payload: p.payload,
        sincronizada_en: ahora,
      })),
      { onConflict: "id" },
    );

    if (error) {
      const mensaje = faltaTabla(error.code) || !error.message ? FALTA_MIGRACION : error.message;
      await anotar(mensaje, false).catch(() => {});
      return { ok: false, error: mensaje };
    }
  }

  // Lo que Meta ya no tiene, acá tampoco.
  const vivos = traido.plantillas.map((p) => p.id);
  if (vivos.length > 0) {
    await admin.from("plantillas").delete().not("id", "in", `(${vivos.map((v) => `"${v}"`).join(",")})`);
  } else {
    await admin.from("plantillas").delete().neq("id", "");
  }

  await anotar(null, true);
  revalidatePath("/");
  return { ok: true, error: null };
}

/**
 * Manda una plantilla a una conversación.
 *
 * Es lo que destraba un hilo dormido: pasadas 24 horas desde el último mensaje
 * de la persona, es la única forma de escribirle. El orden es el mismo que en
 * `responderConversacion`: primero sale, después se guarda, para que nunca
 * quede en la bandeja una respuesta que el cliente no recibió.
 */
export async function enviarPlantillaAConversacion(
  conversacionId: number,
  plantillaId: string,
  valores: string[],
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ok: false, error: "Sesión no válida. Volvé a iniciar sesión." };

  const [{ data: plantilla }, { data: conv }] = await Promise.all([
    supabase
      .from("plantillas")
      .select("nombre, idioma, estado, cuerpo, variables")
      .eq("id", plantillaId)
      .maybeSingle(),
    supabase.from("conversaciones").select("id, telefono").eq("id", conversacionId).maybeSingle(),
  ]);

  if (!plantilla) return { ok: false, error: "No se encontró esa plantilla. Probá sincronizar." };
  if (!conv) return { ok: false, error: "No se encontró la conversación." };

  // Meta rechaza las que no aprobó, pero el error que devuelve no dice por qué
  // con claridad. Se comprueba acá para poder explicarlo.
  if (String(plantilla.estado).toUpperCase() !== "APPROVED") {
    return {
      ok: false,
      error: `Meta todavía no aprobó «${String(plantilla.nombre)}» (está en ${String(plantilla.estado)}). Sólo se pueden mandar las aprobadas.`,
    };
  }

  const faltan = Number(plantilla.variables ?? 0);
  const dados = valores.filter((v) => v.trim() !== "").length;
  if (dados < faltan) {
    return { ok: false, error: `Faltan datos: la plantilla tiene ${faltan} y se dieron ${dados}.` };
  }

  const envio = await enviarPlantilla(
    String(conv.telefono),
    String(plantilla.nombre),
    String(plantilla.idioma),
    valores.slice(0, faltan),
  );

  if (!envio.ok) return { ok: false, error: envio.error };

  // Se guarda el texto ya con los valores puestos: en el hilo hay que leer lo
  // que recibió la persona, no «{{1}}».
  const texto = rellenar(plantilla.cuerpo ? String(plantilla.cuerpo) : "", valores);

  const { error: errGuardar } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    wa_id: envio.waId,
    direccion: "saliente",
    tipo: "template",
    texto,
    estado: "enviado",
    enviado_por: user.id,
  });

  if (errGuardar) {
    return {
      ok: false,
      error: `Se envió, pero no se pudo guardar en la ficha: ${errGuardar.message}`,
    };
  }

  await supabase
    .from("conversaciones")
    .update({
      ultimo_texto: texto.slice(0, 200),
      ultimo_mensaje_en: new Date().toISOString(),
      sin_leer: 0,
    })
    .eq("id", conversacionId);

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Reemplaza los {{n}} por lo que se escribió. */
function rellenar(cuerpo: string, valores: string[]): string {
  return cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (entero, n: string) => {
    const v = valores[Number(n) - 1];
    return v != null && v !== "" ? v : entero;
  });
}
