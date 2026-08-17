import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ¿Este webhook lo mandó Meta de verdad?
 *
 * La URL del webhook es pública —tiene que serlo, Meta la llama desde sus
 * servidores— así que sin esta comprobación cualquiera que la descubra puede
 * inventar mensajes: meter conversaciones falsas en la bandeja, hacerse pasar
 * por un cliente, o llenar la base de basura. La firma es lo único que separa
 * un mensaje real de uno fabricado.
 *
 * Meta firma el cuerpo crudo con el App Secret. Hay que verificar sobre los
 * bytes exactos que llegaron: si se pasa por `JSON.parse` y se vuelve a
 * serializar, cualquier diferencia de espacios o de orden cambia el hash y la
 * firma deja de coincidir aunque el mensaje sea legítimo.
 *
 * La comparación es en tiempo constante. Con `===`, el tiempo que tarda en
 * fallar delata cuántos caracteres acertó, y eso permite ir adivinando la
 * firma byte por byte.
 */
export function firmaValida(crudo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera || !secreto) return false;

  const esperado = "sha256=" + createHmac("sha256", secreto).update(crudo, "utf8").digest("hex");

  const a = Buffer.from(cabecera);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` explota si los largos difieren, y el largo no es
  // secreto: una firma de otro tamaño es inválida y punto.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
