import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hayLlaves, identificar, type Identidad } from "@/lib/api/llaves";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Lo común a todos los endpoints de `/api/v1`: cómo se contesta y quién pasa.
 *
 * La API existe para que n8n y el asistente hagan lo mismo que hace una
 * persona en la pantalla, sin sesión de navegador. Por eso no comparte el
 * camino de autenticación del CRM: entra con una llave en la cabecera y no
 * con la cookie de Supabase.
 */

/** Respuesta con datos. */
export function ok(datos: unknown, estado = 200): NextResponse {
  return NextResponse.json(datos, {
    status: estado,
    // Estas respuestas cambian a cada rato y nunca deberían quedar guardadas
    // en un intermediario: un lead viejo servido de caché sería peor que un
    // error.
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Respuesta de error, siempre con la misma forma.
 *
 * `error` es un texto para leer; `codigo` es lo que una automatización puede
 * comparar sin depender de cómo esté redactado el mensaje.
 */
export function falla(
  estado: number,
  codigo: string,
  mensaje: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      codigo,
      // Los errores de Supabase no siempre traen `message` —un 404 del
      // servidor devuelve el objeto vacío—, y `JSON.stringify` borra las
      // claves con `undefined`. Sin esta red, la respuesta saldría sin campo
      // `error` y del otro lado sólo se vería un código suelto.
      error: mensaje || `Error sin detalle (${codigo}).`,
      ...extra,
    },
    { status: estado, headers: { "cache-control": "no-store" } },
  );
}

export interface Sesion {
  identidad: Identidad;
  /**
   * Cliente con la llave de servicio.
   *
   * Se salta las políticas de fila, porque del otro lado no hay una persona
   * con un rol: hay una automatización. El control de acceso de esta puerta
   * es la llave de API, y por eso el endpoint falla cerrado si no hay
   * ninguna configurada — con la lista vacía, `identificar` no dejaría pasar
   * a nadie, pero prefiero decirlo con un mensaje entendible.
   */
  supabase: SupabaseClient;
}

/**
 * Deja pasar o devuelve la respuesta que hay que contestar.
 *
 * Se usa así, en la primera línea de cada endpoint:
 *
 *     const paso = abrir(req.headers);
 *     if (paso instanceof NextResponse) return paso;
 *     const { supabase, identidad } = paso;
 */
export function abrir(cabeceras: Headers): Sesion | NextResponse {
  if (!hayLlaves()) {
    console.error("[api] falta CRM_API_KEYS; la API queda cerrada");
    return falla(
      503,
      "sin_configurar",
      "La API no está habilitada en este servidor. Falta definir CRM_API_KEYS.",
    );
  }

  const identidad = identificar(cabeceras);
  if (!identidad) {
    return falla(
      401,
      "sin_permiso",
      "Falta la llave de API o no es válida. Mandala en la cabecera Authorization: Bearer <llave> o X-API-Key: <llave>.",
    );
  }

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[api] falta SUPABASE_SERVICE_ROLE_KEY; la API no puede leer la base");
    return falla(
      503,
      "sin_configurar",
      "El servidor no tiene llave de servicio de Supabase configurada.",
    );
  }

  return { identidad, supabase };
}

/**
 * Envuelve un endpoint para que nada salga en HTML.
 *
 * Un error no previsto en un Route Handler termina en la página de error de
 * Next, que es HTML. Del otro lado hay un flujo de n8n esperando JSON: recibe
 * `<!DOCTYPE html>`, no lo puede parsear, y el mensaje que muestra no tiene
 * nada que ver con lo que pasó. Acá se convierte en un 502 con la misma forma
 * que el resto de los errores, y lo de veras roto queda en el registro del
 * servidor.
 */
export function manejar<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      console.error("[api] error no previsto:", detalle);
      return falla(502, "error_interno", detalle);
    }
  };
}

/**
 * El cuerpo de la petición como objeto, o null si no vino como JSON.
 *
 * No revienta con un cuerpo vacío ni con texto suelto: quien está armando un
 * flujo en n8n se equivoca con esto todo el tiempo, y un 400 que explica qué
 * pasó ahorra media hora.
 */
export async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json();
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Texto recortado, o null si venía vacío. Acepta números por comodidad. */
export function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const t = s.trim();
  return t ? t : null;
}

/** Entero, o null. Acepta el número escrito como texto, que es como llega de n8n. */
export function entero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Decimal, o null. Tolera "$1,200.50", que es como lo pega la gente. */
export function decimal(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
