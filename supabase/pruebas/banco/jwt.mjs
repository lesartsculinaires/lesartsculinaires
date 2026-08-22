/**
 * Firma los JWT de las sesiones de prueba.
 *
 * La clave es la misma que lee PostgREST en `v.conf`. Es de mentira y sólo
 * vale acá: el banco no toca ninguna base real.
 */
import crypto from "node:crypto";

const SECRETO = "una-clave-de-pruebas-larguisima-para-firmar-jwt-0123456789";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function firmar(sub, email, rol = "authenticated") {
  const cab = b64({ alg: "HS256", typ: "JWT" });
  const cuerpo = b64({
    sub, email, role: rol, aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const firma = crypto.createHmac("sha256", SECRETO)
    .update(`${cab}.${cuerpo}`).digest("base64url");
  return `${cab}.${cuerpo}.${firma}`;
}
