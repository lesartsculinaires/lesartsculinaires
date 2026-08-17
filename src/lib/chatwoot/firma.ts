import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ventana de tolerancia del reloj, en segundos.
 *
 * Chatwoot firma junto con la marca de tiempo, así que una petición vieja
 * capturada por alguien no se puede reenviar más tarde: la firma sigue siendo
 * válida pero el momento ya no. Cinco minutos alcanza para cualquier
 * diferencia razonable de reloj entre servidores.
 */
const TOLERANCIA_S = 300;

export type ResultadoFirma =
  | { ok: true }
  | { ok: false; motivo: "sin-secreto" | "sin-firma" | "vencida" | "no-coincide" };

/**
 * ¿Este webhook lo mandó Chatwoot?
 *
 * La URL es pública, así que sin esta comprobación cualquiera que la
 * descubriera podría inventar conversaciones y meter clientes falsos en la
 * base.
 *
 * Chatwoot firma `"{timestamp}.{cuerpo crudo}"` con HMAC-SHA256 y el secreto
 * del webhook. Hay que verificar sobre los bytes exactos que llegaron: si se
 * parsea el JSON y se vuelve a serializar, cualquier diferencia de espacios o
 * de orden cambia el hash y la firma deja de coincidir aunque sea legítima.
 *
 * La comparación va en tiempo constante. Con `===`, lo que tarda en fallar
 * delata cuántos caracteres se acertaron, y eso permite ir adivinando la
 * firma de a poco.
 */
export function verificarFirma(
  crudo: string,
  firma: string | null,
  marca: string | null,
  secreto: string,
  ahoraS: number = Math.floor(Date.now() / 1000),
): ResultadoFirma {
  if (!secreto) return { ok: false, motivo: "sin-secreto" };
  if (!firma || !marca) return { ok: false, motivo: "sin-firma" };

  const t = Number(marca);
  if (!Number.isFinite(t)) return { ok: false, motivo: "sin-firma" };
  if (Math.abs(ahoraS - t) > TOLERANCIA_S) return { ok: false, motivo: "vencida" };

  const esperado =
    "sha256=" + createHmac("sha256", secreto).update(`${marca}.${crudo}`, "utf8").digest("hex");

  const a = Buffer.from(firma);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` explota si los largos difieren, y el largo no es
  // secreto: una firma de otro tamaño es inválida y punto.
  if (a.length !== b.length) return { ok: false, motivo: "no-coincide" };

  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, motivo: "no-coincide" };
}
