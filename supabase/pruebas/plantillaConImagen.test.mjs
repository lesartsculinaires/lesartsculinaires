/**
 * Una plantilla con imagen de encabezado, mandada a UN cliente desde el hilo.
 *
 *     node --test supabase/pruebas/plantillaConImagen.test.mjs
 *
 * ============================================================================
 * EL ERROR QUE ESTO VIGILA
 * ============================================================================
 *
 * La escuela quiso mandarle a una clienta la plantilla del workshop, que lleva
 * una imagen de encabezado y está aprobada por Meta. El CRM contestaba:
 *
 *     Esta plantilla lleva una imagen de encabezado, y hay que darle su
 *     dirección para poder mandarla.
 *
 * …y no ofrecía ninguna casilla para dársela. Eran dos fallas encadenadas:
 *
 *   LA PANTALLA NO LA PEDÍA     El selector del hilo dibujaba sólo los huecos
 *                               `{{1}}` del cuerpo, así que la imagen no tenía
 *                               dónde escribirse.
 *
 *   Y EL SERVIDOR LA TIRABA     `enviarPlantillaAConversacion` armaba
 *                               `{ encabezado: [], cuerpo: …, botones: [] }`,
 *                               o sea que aunque la pantalla la hubiera
 *                               mandado, ahí se perdía.
 *
 * El envío MASIVO sí podía mandarlas: usaba `pedidosDe` y `repartirValores`.
 * Esta prueba fija que las dos pantallas repartan igual.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { quePide, pedidosDe, repartirValores, componentesPara, loQueFalta } =
  await compilar("src/lib/whatsapp/piezas.ts");

/** La del workshop: imagen de encabezado y un cuerpo sin huecos. */
const CON_IMAGEN = {
  components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "🍫 WORKSHOP: BARRA DUBAI\n\nSábado 03 de octubre." },
  ],
};

/** Una normal, para comprobar que no se rompió lo que ya andaba. */
const SOLO_TEXTO = {
  components: [{ type: "BODY", text: "Hola {{1}}, te esperamos el {{2}}." }],
};

const LA_IMAGEN = "https://ejemplo.test/barra-dubai.jpg";

test("── QUÉ PIDE UNA PLANTILLA CON IMAGEN ──", () => {
  const pide = quePide(CON_IMAGEN, CON_IMAGEN.components[1].text);

  assert.equal(pide.encabezado?.esArchivo, true);
  assert.equal(pide.encabezado?.formato, "IMAGE");

  // Una sola casilla: la dirección de la imagen. El cuerpo no tiene huecos.
  const pedidos = pedidosDe(pide);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].esArchivo, true);
  assert.equal(pedidos[0].pieza, "encabezado");
});

test("── LA DIRECCIÓN LLEGA AL ENCABEZADO, NO AL CUERPO ──", () => {
  /*
   * Es exactamente lo que se perdía. Antes el servidor armaba el reparto a
   * mano con `encabezado: []`, así que la imagen se caía por el camino y
   * `loQueFalta` contestaba que faltaba —sin que hubiera forma de darla—.
   */
  const pide = quePide(CON_IMAGEN, CON_IMAGEN.components[1].text);
  const datos = repartirValores(pide, [LA_IMAGEN]);

  assert.equal(datos.archivoEncabezado, LA_IMAGEN);
  assert.deepEqual(datos.cuerpo, []);

  // Y con eso ya no falta nada.
  assert.equal(loQueFalta(pide, datos), null);
});

test("── SIN LA DIRECCIÓN, SE DICE QUÉ FALTA ──", () => {
  const pide = quePide(CON_IMAGEN, CON_IMAGEN.components[1].text);
  const falta = loQueFalta(pide, repartirValores(pide, []));

  assert.ok(falta, "tendría que avisar que falta algo");
  assert.match(falta, /imagen/i);
});

test("── LO QUE LE VA A META LLEVA LA IMAGEN ──", () => {
  const pide = quePide(CON_IMAGEN, CON_IMAGEN.components[1].text);
  const partes = componentesPara(pide, repartirValores(pide, [LA_IMAGEN]));

  const encabezado = (partes ?? []).find((c) => c.type === "header");
  assert.ok(encabezado, "tendría que ir un componente de encabezado");
  assert.equal(encabezado.parameters[0].type, "image");
  assert.equal(encabezado.parameters[0].image.link, LA_IMAGEN);
});

test("── LAS DE SÓLO TEXTO SIGUEN IGUAL ──", () => {
  // La mitad que no hay que romper: con dos huecos y sin encabezado, los dos
  // valores tienen que caer en el cuerpo.
  const pide = quePide(SOLO_TEXTO, SOLO_TEXTO.components[0].text);

  assert.equal(pedidosDe(pide).length, 2);

  const datos = repartirValores(pide, ["Karla", "3 de octubre"]);
  assert.equal(datos.archivoEncabezado, null);
  assert.deepEqual(datos.cuerpo, ["Karla", "3 de octubre"]);
  assert.equal(loQueFalta(pide, datos), null);
});

test("── EL ORDEN: PRIMERO LA IMAGEN, DESPUÉS EL TEXTO ──", () => {
  /*
   * Con las dos cosas a la vez, el orden es el que decide si el envío sale
   * bien o con la imagen metida dentro de la frase. Meta espera encabezado,
   * cuerpo y botones, en ese orden, y `pedidosDe` los devuelve así.
   */
  const mixta = {
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hola {{1}}." },
    ],
  };
  const pide = quePide(mixta, mixta.components[1].text);

  assert.deepEqual(
    pedidosDe(pide).map((x) => x.pieza),
    ["encabezado", "cuerpo"],
  );

  const datos = repartirValores(pide, [LA_IMAGEN, "Karla"]);
  assert.equal(datos.archivoEncabezado, LA_IMAGEN);
  assert.deepEqual(datos.cuerpo, ["Karla"]);
});
