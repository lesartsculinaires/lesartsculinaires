import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Claves de API para integraciones: n8n, el asistente, lo que venga.
 *
 * Van en la variable `CRM_API_KEYS` de Netlify, separadas por coma, con un
 * nombre opcional para saber cuál es cuál:
 *
 *     CRM_API_KEYS = n8n:kLm9...,asistente:pQr7...
 *
 * En variables de entorno y no en la base a propósito. Guardarlas en una tabla
 * pediría una pantalla para administrarlas, y mientras sean dos o tres, un
 * campo en Netlify se edita igual de rápido y no deja el secreto escrito en
 * ningún lado consultable. Revocar una es borrarla de la lista.
 *
 * Cada integración con la suya: si mañana hay que cortarle el acceso a n8n,
 * se quita esa y el asistente sigue andando.
 */

export interface Identidad {
  /** Nombre de la integración, para poder decir en el registro quién entró. */
  nombre: string;
}

/** Compara sin delatar cuántos caracteres se acertaron por el tiempo que tarda. */
function igual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // `timingSafeEqual` explota con largos distintos, y el largo no es secreto.
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function configuradas(): { nombre: string; clave: string }[] {
  return (process.env.CRM_API_KEYS ?? "")
    .split(",")
    .map((entrada) => entrada.trim())
    .filter(Boolean)
    .map((entrada) => {
      const corte = entrada.indexOf(":");
      // Sin nombre también vale; queda como «sin nombre» en el registro.
      return corte === -1
        ? { nombre: "sin nombre", clave: entrada }
        : { nombre: entrada.slice(0, corte), clave: entrada.slice(corte + 1) };
    })
    .filter((k) => k.clave.length > 0);
}

export const hayLlaves = (): boolean => configuradas().length > 0;

/**
 * Quién está llamando, o null si no debería estar acá.
 *
 * Acepta la clave en `Authorization: Bearer ...` o en `X-API-Key`. Las dos
 * porque n8n manda una y muchos clientes de IA mandan la otra, y pelear con
 * eso en la configuración no aporta nada.
 *
 * Se recorren todas las claves aunque la primera coincida: cortar antes haría
 * que el tiempo de respuesta revelara en qué posición de la lista está la
 * clave acertada.
 */
export function identificar(cabeceras: Headers): Identidad | null {
  const bearer = cabeceras.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const directa = cabeceras.get("x-api-key")?.trim();
  const enviada = bearer || directa;

  if (!enviada) return null;

  let encontrada: Identidad | null = null;
  for (const k of configuradas()) {
    if (igual(enviada, k.clave)) encontrada = { nombre: k.nombre };
  }
  return encontrada;
}
