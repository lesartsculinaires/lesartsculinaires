#!/usr/bin/env node
/**
 * Firmar un `signed_request` como lo firma Facebook, para poder probar los
 * callbacks de cuenta sin esperar a que Meta los llame.
 *
 *     node --env-file=.env.local scripts/firmar-meta.mjs 17841400000000001
 *     node --env-file=.env.local scripts/firmar-meta.mjs 17841400000000001 --alterada
 *
 * ============================================================================
 * PARA QUÉ HACE FALTA ESTO
 * ============================================================================
 *
 * `/api/meta/deauthorize` y `/api/meta/data-deletion` no se pueden probar con un
 * curl a mano: lo primero que hacen es comprobar la firma del cuerpo, así que sin
 * una firma válida nunca se llega a ver si el resto funciona. Y con una inválida
 * tampoco se sabe si el 401 vino de la firma o de un error más abajo.
 *
 * Esto genera las dos: la buena y una alterada, que es la única forma de
 * comprobar que el rechazo es de verdad y no un efecto de haber mandado basura.
 *
 * ============================================================================
 * NO ES LA FIRMA DE LOS WEBHOOKS
 * ============================================================================
 *
 * Los webhooks de mensajes llegan con `x-hub-signature-256` en la CABECERA.
 * Esto es el formato viejo de Facebook y va en el CUERPO:
 *
 *     signed_request = base64url(HMAC-SHA256(contenido, secreto)) + "." + contenido
 *     contenido      = base64url(JSON)
 *
 * El detalle que lo rompe todo: el HMAC se calcula sobre el SEGUNDO TROZO TAL
 * COMO VIAJA —el base64url—, no sobre el JSON decodificado. Firmar el JSON da
 * otra cosa y no valida nunca. Es el mismo orden que comprueba `leerFirmado`
 * en `src/lib/meta/firmado.ts`, y por eso este script existe al lado y no
 * reimplementa su propia idea de cómo se firma.
 *
 * ============================================================================
 * EL SECRETO NO SE IMPRIME
 * ============================================================================
 *
 * Se lee del entorno y no se muestra nunca, ni en los mensajes de error. Lo que
 * sale por pantalla es el `signed_request`, que es público por naturaleza: viaja
 * en el cuerpo de un POST de Facebook.
 *
 * El orden en que se busca es EL MISMO que usa la ruta
 * (`INSTAGRAM_APP_SECRET ?? WHATSAPP_APP_SECRET`). Si acá se eligiera otro, el
 * script firmaría con una llave y la ruta comprobaría con otra, y el 401 que
 * saldría de ahí parecería un fallo del callback.
 */
import crypto from "node:crypto";

const args = process.argv.slice(2);
const alterada = args.includes("--alterada");
const userId = args.find((a) => !a.startsWith("--"));

if (!userId) {
  console.error(
    "Falta el user_id (el IGSID de quien pidió la baja).\n\n" +
      "  node --env-file=.env.local scripts/firmar-meta.mjs <user_id> [--alterada]\n",
  );
  process.exit(2);
}

const secreto = process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
if (!secreto) {
  console.error(
    "No hay App Secret en el entorno: falta INSTAGRAM_APP_SECRET (o WHATSAPP_APP_SECRET).\n" +
      "Si estás contra el banco de pruebas, corré el script con --env-file=.env.local.\n",
  );
  process.exit(2);
}

/*
 * El contenido, con los tres campos que manda Facebook.
 *
 * `issued_at` va en segundos, no en milisegundos: es lo que manda Facebook, y
 * aunque hoy ninguna ruta lo mire, un script de pruebas que miente en el formato
 * deja de servir el día que alguien decida comprobar la antigüedad del aviso.
 */
const contenido = Buffer.from(
  JSON.stringify({
    user_id: userId,
    algorithm: "HMAC-SHA256",
    issued_at: Math.floor(Date.now() / 1000),
  }),
).toString("base64url");

const firma = crypto.createHmac("sha256", secreto).update(contenido).digest("base64url");

/*
 * La alterada cambia UN carácter de la firma y le deja el mismo largo.
 *
 * A propósito: si se acortara, el rechazo podría venir de la comprobación de
 * longitud y no de la comparación del HMAC, y entonces la prueba no diría nada
 * sobre lo único que importa —que una firma del largo correcto pero equivocada
 * no pasa—.
 */
const salida = alterada
  ? `${(firma[0] === "A" ? "B" : "A") + firma.slice(1)}.${contenido}`
  : `${firma}.${contenido}`;

console.log(salida);
