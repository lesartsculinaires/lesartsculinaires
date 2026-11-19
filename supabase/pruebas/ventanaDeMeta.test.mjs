/**
 * ¿Con qué sobre sale un mensaje de Instagram o Messenger?
 *
 *     node --test supabase/pruebas/ventanaDeMeta.test.mjs
 *
 * ============================================================================
 * EL ERROR QUE ESTO VIGILA
 * ============================================================================
 *
 * La escuela no podía contestar NINGÚN mensaje de Messenger. Meta rechazaba
 * todos con «(#100) No se puede agregar la etiqueta HUMAN_AGENT a los mensajes
 * sin aprobación previa».
 *
 * El CRM le ponía esa etiqueta a todos los envíos. Es un permiso que Meta da
 * por App Review y la aplicación no lo tiene, así que el envío se caía incluso
 * un minuto después de que el cliente escribiera —justo cuando la etiqueta no
 * hacía ninguna falta, porque dentro de las 24 horas se contesta sin permiso—.
 *
 * Los dos bordes son lo que importa, y por eso se prueban con la hora pasada
 * como dato en vez de esperar un día:
 *
 *   ANTES DE LAS 24 h   tiene que salir SIN etiqueta, o rebota.
 *   DESPUÉS             tiene que salir CON etiqueta, que es la única forma de
 *                       escribir; si Meta la rechaza, el mensaje de error dice
 *                       qué permiso falta.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const {
  sobreDeEnvio,
  dentroDeLaVentana,
  esFaltaDePermisoHumanAgent,
  esVentanaCerrada,
  esSinPermisoParaEscribir,
  sinPermisoParaEscribir,
  HORAS_SIN_ETIQUETA,
} = await compilar("src/lib/meta/ventana.ts");

const AHORA = new Date("2026-09-28T15:00:00.000Z");
const haceHoras = (n) => new Date(AHORA.getTime() - n * 3_600_000).toISOString();

test("── LOS DOS BORDES DE LA VENTANA ──", () => {
  assert.equal(HORAS_SIN_ETIQUETA, 24);

  // Recién escribió: sin etiqueta. Es el caso que estaba roto.
  assert.deepEqual(sobreDeEnvio(haceHoras(0), AHORA), { messaging_type: "RESPONSE" });

  // A las 23 horas todavía entra.
  assert.deepEqual(sobreDeEnvio(haceHoras(23), AHORA), { messaging_type: "RESPONSE" });

  // A las 25 ya no: ahí la etiqueta es la única forma de escribir.
  assert.deepEqual(sobreDeEnvio(haceHoras(25), AHORA), {
    messaging_type: "MESSAGE_TAG",
    tag: "HUMAN_AGENT",
  });
});

test("── CUANDO NO SE SABE, SE SUPONE ABIERTA ──", () => {
  /*
   * Es la suposición correcta por cómo fallan las dos.
   *
   * Suponer abierta y estar cerrada: Meta contesta «pasó la ventana», que el
   * CRM traduce a «hay que esperar a que vuelva a escribir». Se entiende.
   *
   * Suponer cerrada y estar abierta: se manda la etiqueta sin necesidad y HOY
   * eso rebota. Se pierde un mensaje que se podía mandar.
   */
  for (const sinDato of [null, undefined, "", "no es una fecha"]) {
    assert.deepEqual(
      sobreDeEnvio(sinDato, AHORA),
      { messaging_type: "RESPONSE" },
      `«${String(sinDato)}» tendría que tratarse como ventana abierta`,
    );
  }
});

test("── LA VENTANA, POR SÍ SOLA ──", () => {
  assert.equal(dentroDeLaVentana(haceHoras(1), AHORA), true);
  assert.equal(dentroDeLaVentana(haceHoras(48), AHORA), false);
  // Justo en el borde: 24 horas exactas ya está afuera.
  assert.equal(dentroDeLaVentana(haceHoras(24), AHORA), false);
});

test("── RECONOCER EL ERROR DEL PERMISO, Y NO CONFUNDIRLO ──", () => {
  // El de verdad, tal como lo devuelve Meta.
  assert.equal(
    esFaltaDePermisoHumanAgent({
      code: 100,
      message: 'Cannot add "HUMAN_AGENT" tag to messages without prior approval',
    }),
    true,
  );

  /*
   * El 100 es genérico: Meta lo usa para cualquier parámetro mal. Por eso no
   * alcanza con el código, y se pide además que el texto nombre la etiqueta.
   * Sin eso, cualquier error de parámetros se traduciría como «falta el
   * permiso Human Agent» y mandaría a pedirle a Meta algo que no hace falta.
   */
  assert.equal(
    esFaltaDePermisoHumanAgent({ code: 100, message: "Invalid parameter" }),
    false,
  );

  // Y el de la ventana vencida es otro error, con otro arreglo.
  assert.equal(esFaltaDePermisoHumanAgent({ code: 10, message: "outside window" }), false);
  assert.equal(esFaltaDePermisoHumanAgent(undefined), false);
});

test("── EL 10 NO SIEMPRE ES LA VENTANA ──", () => {
  // Lo que pasó el 19/11 en HC: la clienta había escrito 20 minutos antes y el
  // CRM dijo «pasaron más de siete días». Era el permiso de la app.
  const permiso = { code: 10, message: "(#10) Application does not have permission for this action" };
  assert.equal(esVentanaCerrada(permiso), false);
  assert.equal(esSinPermisoParaEscribir(permiso), true);
  const texto = sinPermisoParaEscribir("Messenger", permiso);
  assert.match(texto, /No es la ventana/);
  assert.match(texto, /pages_messaging/);
  assert.match(texto, /Application does not have permission/);
  assert.match(sinPermisoParaEscribir("Instagram", permiso), /instagram_manage_messages/);

  // La ventana de verdad sigue reconociéndose, por subcódigo o por texto.
  for (const e of [
    { code: 10, error_subcode: 2018278, message: "x" },
    { code: 10, error_subcode: 2534022, message: "x" },
    { code: 10, message: "This message is sent outside of allowed window." },
  ]) {
    assert.equal(esVentanaCerrada(e), true);
    assert.equal(esSinPermisoParaEscribir(e), false);
  }
  assert.equal(esSinPermisoParaEscribir({ code: 100, message: "HUMAN_AGENT" }), false);
  assert.equal(esSinPermisoParaEscribir(undefined), false);
});
