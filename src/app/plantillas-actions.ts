"use server";

import { revalidatePath } from "next/cache";

import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarPlantilla } from "@/lib/whatsapp/enviar";
import { conValores } from "@/lib/whatsapp/huecos";
import { encabezadoParaMeta } from "@/lib/whatsapp/encabezadoParaMeta";
import { hayWaba, panelDeMeta, traerPlantillas } from "@/lib/whatsapp/plantillas";
import type { Plantilla } from "@/lib/types";
import {
  componentesPara,
  loQueFalta,
  pedidosDe,
  quePide,
  repartirValores,
} from "@/lib/whatsapp/piezas";

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
      .select("id, nombre, idioma, estado, categoria, cuerpo, variables, payload")
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
      /*
       * Qué exige esta plantilla, resuelto en el servidor.
       *
       * Va calculado y no crudo: `payload` es el objeto entero de Meta —con
       * ejemplos, identificadores internos y cosas que no se usan— y mandarlo
       * al navegador por cada plantilla sería peso y detalle que a la pantalla
       * no le sirve. Lo que la pantalla necesita es qué pedirle a quien manda.
       */
      pide: quePide(p.payload, p.cuerpo ? String(p.cuerpo) : null),
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
      .select("nombre, idioma, estado, cuerpo, variables, payload")
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

  /*
   * Las piezas, no sólo el cuerpo.
   *
   * Una plantilla puede llevar encabezado y botones con dato, y faltando
   * cualquiera Meta rechaza el mensaje entero. Se comprueba ANTES de mandar
   * —`loQueFalta`— para poder decir qué falta en vez de mostrar el «(#131008)
   * Required parameter is missing» de Meta, que no dice cuál.
   */
  const pide = quePide(plantilla.payload, plantilla.cuerpo ? String(plantilla.cuerpo) : null);

  /*
   * LOS VALORES SE REPARTEN ENTRE LAS PIEZAS. ACÁ SE TIRABAN.
   *
   * Esto decía `{ encabezado: [], cuerpo: valores.slice(0, faltan), botones: [] }`,
   * o sea: todo lo que no fuera del cuerpo se descartaba. Con una plantilla de
   * imagen —la del workshop de la escuela— el envío quedaba imposible: aunque
   * la pantalla hubiera mandado la dirección de la imagen, acá se perdía, y
   * `loQueFalta` contestaba «lleva una imagen de encabezado, y hay que darle su
   * dirección» sin que hubiera forma de dársela.
   *
   * `repartirValores` es la misma función que usa el envío masivo, que sí
   * mandaba estas plantillas. Ahora las dos pantallas reparten igual.
   */
  const datos = repartirValores(pide, valores);

  /*
   * Cuántas casillas hay que llenar de verdad.
   *
   * Son las de las tres piezas —encabezado, cuerpo y botones—, no sólo los
   * huecos del texto: contar sólo el texto dejaba pasar un envío al que le
   * faltaba la imagen.
   *
   * Y sin las opcionales. La imagen del encabezado no cuenta cuando Meta ya
   * tiene una aprobada: ahí no falta nada, se manda ésa.
   */
  const pedidos = pedidosDe(pide);
  const faltan = pedidos.filter((p) => !p.opcional).length;
  const dados = pedidos.filter((p, i) => !p.opcional && (valores[i] ?? "").trim() !== "").length;
  if (dados < faltan) {
    return { ok: false, error: `Faltan datos: la plantilla pide ${faltan} y se dieron ${dados}.` };
  }

  const falta = loQueFalta(pide, datos);
  if (falta) return { ok: false, error: falta };

  /*
   * La imagen del encabezado se le SUBE a Meta antes de mandar.
   *
   * ==========================================================================
   * ESTO ANTES LE PASABA UNA DIRECCIÓN, Y ASÍ FALLÓ EN PRODUCCIÓN
   * ==========================================================================
   *
   * Con una dirección, Meta acepta el mensaje y después va a bajar la imagen.
   * Si no puede, el mensaje ya salió: en el hilo queda «No se pudo entregar ·
   * Media upload error» y no hay nada que hacer. Falló incluso con la dirección
   * de la imagen que Meta tenía aprobada de esa misma plantilla —su propio CDN
   * no la vuelve a servir—.
   *
   * Subiéndola antes, el envío no depende de que Meta alcance ningún servidor,
   * y si algo falla, falla ACÁ: antes de mandarle nada a nadie, y con un
   * motivo que se puede leer.
   */
  const laImagen = await encabezadoParaMeta(
    supabase,
    datos.archivoEncabezado,
    plantillaId,
  );
  if (!laImagen.ok) return { ok: false, error: laImagen.error };

  const paraMandar = { ...datos, idEncabezado: laImagen.id };

  const envio = await enviarPlantilla(
    String(conv.telefono),
    String(plantilla.nombre),
    String(plantilla.idioma),
    componentesPara(pide, paraMandar),
  );

  if (!envio.ok) return { ok: false, error: envio.error };

  // Se guarda el texto ya con los valores puestos: en el hilo hay que leer lo
  // que recibió la persona, no «{{1}}».
  // Sólo los del cuerpo: con la lista entera, la dirección de la imagen se
  // colaría dentro del texto que se guarda en el hilo.
  const texto = conValores(plantilla.cuerpo ? String(plantilla.cuerpo) : "", datos.cuerpo);

  const { error: errGuardar } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    wa_id: envio.waId,
    direccion: "saliente",
    tipo: "template",
    texto,
    estado: "enviado",
    enviado_por: user.id,
    /*
     * La imagen del encabezado, para que el hilo la muestre.
     *
     * Sin esto, la asesora manda la plantilla del workshop, el cliente recibe
     * la imagen, y en el CRM la burbuja sale con el texto solo: se ve como si
     * la imagen no hubiera salido. Lo que se guarda es la copia del bucket
     * —el identificador de Meta sirve para mandar y no se puede dibujar—.
     */
    media_ruta: laImagen.ruta,
    media_mime: laImagen.ruta ? laImagen.mime : null,
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

/** Reemplaza los huecos por lo que se escribió. */
function rellenarViejo(cuerpo: string, valores: string[]): string {
  return cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (entero, n: string) => {
    const v = valores[Number(n) - 1];
    return v != null && v !== "" ? v : entero;
  });
}
