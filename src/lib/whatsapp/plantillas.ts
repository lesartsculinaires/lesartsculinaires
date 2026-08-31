import "server-only";

import { cuantosHuecos } from "@/lib/whatsapp/huecos";

/**
 * Las plantillas, leídas de Meta.
 *
 * Una plantilla es un mensaje aprobado de antemano. Sirve para una sola cosa,
 * pero es importante: pasadas 24 horas desde el último mensaje del cliente,
 * WhatsApp no deja escribirle libremente, y una plantilla aprobada es la única
 * manera de volver a abrir la conversación.
 *
 * El CRM no puede crearlas ni aprobarlas: eso pasa en el panel de Meta. Acá
 * sólo se leen, se guardan y se mandan.
 */

const VERSION = "v21.0";

export interface PlantillaMeta {
  id: string;
  nombre: string;
  idioma: string;
  /** APPROVED / PENDING / REJECTED / PAUSED / DISABLED. */
  estado: string;
  categoria: string | null;
  cuerpo: string | null;
  /** Cuántos {{n}} hay que llenar para poder mandarla. */
  variables: number;
  payload: unknown;
}

export type ResultadoPlantillas =
  | { ok: true; plantillas: PlantillaMeta[] }
  | { ok: false; error: string };

/** El identificador de la cuenta de WhatsApp Business, que no es el del número. */
export const hayWaba = (): boolean =>
  Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_TOKEN);

/**
 * La dirección del panel de Meta donde se crean.
 *
 * Se arma con el id de la cuenta cuando se lo tiene, para caer directo en las
 * plantillas de esta escuela y no en el panel general.
 */
export function panelDeMeta(): string {
  const waba = process.env.WHATSAPP_WABA_ID;
  return waba
    ? `https://business.facebook.com/wa/manage/message-templates/?waba_id=${waba}`
    : "https://business.facebook.com/wa/manage/message-templates/";
}

export async function traerPlantillas(): Promise<ResultadoPlantillas> {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID;

  if (!token || !waba) {
    return {
      ok: false,
      error:
        "Faltan WHATSAPP_TOKEN y WHATSAPP_WABA_ID en el servidor. " +
        "Sin eso no se pueden leer las plantillas de Meta.",
    };
  }

  try {
    const r = await fetch(
      `https://graph.facebook.com/${VERSION}/${waba}/message_templates` +
        "?fields=id,name,language,status,category,components&limit=200",
      { headers: { authorization: `Bearer ${token}` } },
    );

    const cuerpo = (await r.json().catch(() => null)) as
      | { data?: unknown[]; error?: { message?: string; code?: number } }
      | null;

    if (!r.ok) {
      return { ok: false, error: explicar(cuerpo?.error, r.status) };
    }

    return { ok: true, plantillas: (cuerpo?.data ?? []).map(leerUna).filter((p) => p != null) };
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `No se pudo hablar con Meta: ${causa}` };
  }
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

function leerUna(cruda: unknown): PlantillaMeta | null {
  const p = obj(cruda);
  const id = texto(p?.id);
  const nombre = texto(p?.name);
  if (!p || !id || !nombre) return null;

  const cuerpo = cuerpoDe(p);

  return {
    id,
    nombre,
    idioma: texto(p.language) ?? "—",
    estado: texto(p.status) ?? "DESCONOCIDO",
    categoria: texto(p.category),
    cuerpo,
    variables: cuantasVariables(cuerpo),
    payload: cruda,
  };
}

/** El texto del componente BODY, que es lo que se previsualiza y se manda. */
function cuerpoDe(p: Record<string, unknown>): string | null {
  const partes = Array.isArray(p.components) ? p.components : [];
  for (const c of partes) {
    const parte = obj(c);
    if (texto(parte?.type)?.toUpperCase() === "BODY") return texto(parte?.text);
  }
  return null;
}

/**
 * Cuántos huecos tiene el cuerpo.
 *
 * Se cuentan los distintos y no las apariciones: `{{1}}` puede repetirse en el
 * mismo texto y sigue siendo un solo dato que hay que dar. Contar de más haría
 * pedir un valor que Meta no espera, y el envío fallaría.
 */
export function cuantasVariables(cuerpo: string | null): number {
  return cuantosHuecos(cuerpo);
}

/** Con los huecos llenos, para poder verla antes de mandarla. */
export { conValores } from "@/lib/whatsapp/huecos";

function explicar(error: { message?: string; code?: number } | undefined, estado: number): string {
  if (error?.code === 190) {
    return "El token de WhatsApp no sirve o venció. Hay que renovarlo en Meta.";
  }
  if (estado === 404) {
    return "Meta no encuentra esa cuenta. Revisá que WHATSAPP_WABA_ID sea el de la cuenta de WhatsApp Business, no el del número.";
  }
  return error?.message ?? `Meta contestó ${estado} sin decir por qué.`;
}
