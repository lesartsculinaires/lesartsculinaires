/**
 * La imagen que Meta YA tiene aprobada se manda sola.
 *
 *     node --test supabase/pruebas/imagenAprobadaEnMeta.test.mjs
 *
 * ============================================================================
 * LA QUEJA QUE ESTO ARREGLA
 * ============================================================================
 *
 * «Meta aprobó la plantilla pero al usarla en el CRM vuelve a pedir la imagen
 * que ya está en la plantilla; la idea es sólo poder enviarla.»
 *
 * Y tenía razón a medias, que es lo que lo hacía difícil:
 *
 *   ERA CIERTO QUE META LA EXIGE   Una plantilla con encabezado de imagen
 *                                  necesita el archivo en CADA envío. La
 *                                  plantilla guarda el diseño, no la foto.
 *
 *   PERO NO QUE HUBIERA QUE PEDIRLA  Al aprobarla, Meta se queda con la imagen
 *                                  de muestra y la devuelve en
 *                                  `example.header_handle`. En las versiones
 *                                  actuales de la API eso es una dirección de
 *                                  su propio CDN: pública, y que Meta puede
 *                                  bajar sin permiso. O sea que el dato estaba
 *                                  guardado y nadie lo miraba.
 *
 * De no mirarlo salió el «Media upload error» del hilo: al no tener la imagen a
 * mano se pegó una dirección que Meta no podía bajar.
 *
 * ============================================================================
 * Y LA MITAD QUE NO SE PUEDE REUSAR
 * ============================================================================
 *
 * `header_handle` tiene DOS formas. La otra —`4::aW1n…`— es el comprobante de
 * la subida que se hizo al crear la plantilla, y no es una dirección: mandarlo
 * como si lo fuera termina en ese mismo «Media upload error». Por eso se mira
 * la forma y no la versión de la API.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { quePide, pedidosDe, repartirValores, loQueFalta, componentesPara } =
  await compilar("src/lib/whatsapp/piezas.ts");

const LA_DE_META =
  "https://scontent.whatsapp.net/v/t61.29466-34/barra_dubai.png?ccb=1-7&_nc_oc=abc";

/** Como la devuelve Meta hoy: el handle ES una dirección. */
const APROBADA_CON_IMAGEN = {
  components: [
    {
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [LA_DE_META] },
    },
    {
      type: "BODY",
      text: "Hola, buen día, {{order_id}} ¡Espero que estés muy bien!",
      example: { body_text_named_params: [{ example: "Diego", param_name: "order_id" }] },
    },
  ],
};

/** La forma vieja: un identificador de subida, que no sirve para mandar. */
const CON_HANDLE_VIEJO = {
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1nL3BuZw==:ARZ"] } },
    { type: "BODY", text: "Hola {{1}}." },
  ],
};

test("── SE LEE LA IMAGEN APROBADA ──", () => {
  const pide = quePide(APROBADA_CON_IMAGEN, APROBADA_CON_IMAGEN.components[1].text);

  assert.equal(pide.encabezado.esArchivo, true);
  assert.equal(pide.encabezado.imagenAprobada, LA_DE_META);
});

test("── Y POR ESO LA CASILLA DEJA DE SER OBLIGATORIA ──", () => {
  const pide = quePide(APROBADA_CON_IMAGEN, APROBADA_CON_IMAGEN.components[1].text);
  const pedidos = pedidosDe(pide);

  // La casilla SIGUE estando: a veces se quiere mandar otra imagen. Lo que
  // cambia es que ya no frena el envío.
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[0].pieza, "encabezado");
  assert.equal(pedidos[0].opcional, true);
  assert.equal(pedidos[0].porOmision, LA_DE_META);

  // El nombre del cliente sí sigue siendo obligatorio: es lo que la escuela
  // efectivamente personaliza.
  assert.equal(pedidos[1].pieza, "cuerpo");
  assert.equal(pedidos[1].opcional, false);
});

test("── SIN TOCAR NADA, SE MANDA LA DE META ──", () => {
  /*
   * El caso de la queja, entero: se elige la plantilla, se escribe el nombre y
   * se aprieta Mandar. La imagen no se pide y no falta.
   */
  const pide = quePide(APROBADA_CON_IMAGEN, APROBADA_CON_IMAGEN.components[1].text);
  const datos = repartirValores(pide, ["", "Diego"]);

  assert.equal(datos.archivoEncabezado, LA_DE_META);
  assert.deepEqual(datos.cuerpo, ["Diego"]);
  assert.equal(loQueFalta(pide, datos), null);

  const partes = componentesPara(pide, datos);
  const encabezado = partes.find((c) => c.type === "header");
  assert.equal(encabezado.parameters[0].image.link, LA_DE_META);

  // Y el nombre del cliente va con su `parameter_name`, porque esta plantilla
  // usa huecos con nombre y no posiciones.
  const cuerpo = partes.find((c) => c.type === "body");
  assert.equal(cuerpo.parameters[0].parameter_name, "order_id");
  assert.equal(cuerpo.parameters[0].text, "Diego");
});

test("── PERO SI SE ELIGE OTRA, GANA LA ELEGIDA ──", () => {
  // Reusar la de Meta es el camino corto, no una imposición: para una promoción
  // distinta con la misma plantilla hay que poder cambiarla.
  const pide = quePide(APROBADA_CON_IMAGEN, APROBADA_CON_IMAGEN.components[1].text);
  const datos = repartirValores(pide, ["https://otra.test/nueva.jpg", "Diego"]);

  assert.equal(datos.archivoEncabezado, "https://otra.test/nueva.jpg");
});

test("── UN HANDLE VIEJO NO SE USA: NO ES UNA DIRECCIÓN ──", () => {
  /*
   * `4::aW1n…` no se puede bajar. Tomarlo por una dirección mandaría el envío
   * derecho al «Media upload error» —el error que se está arreglando— y encima
   * sin casilla para corregirlo, porque el pedido habría quedado opcional.
   */
  const pide = quePide(CON_HANDLE_VIEJO, CON_HANDLE_VIEJO.components[1].text);

  assert.equal(pide.encabezado.imagenAprobada, null);
  assert.equal(pedidosDe(pide)[0].opcional, false);

  // Y sin nada puesto, se avisa que falta.
  const falta = loQueFalta(pide, repartirValores(pide, ["", "Diego"]));
  assert.match(falta ?? "", /imagen/i);
});

test("── SIN `example`, TAMPOCO SE INVENTA ──", () => {
  const sinEjemplo = {
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hola {{1}}." },
    ],
  };
  const pide = quePide(sinEjemplo, sinEjemplo.components[1].text);

  assert.equal(pide.encabezado.imagenAprobada, null);
  assert.equal(pedidosDe(pide)[0].opcional, false);
});

test("── LAS DE SÓLO TEXTO NO CAMBIAN EN NADA ──", () => {
  const soloTexto = { components: [{ type: "BODY", text: "Hola {{1}}, te esperamos." }] };
  const pide = quePide(soloTexto, soloTexto.components[0].text);

  assert.equal(pide.encabezado, null);
  assert.equal(pedidosDe(pide).length, 1);
  assert.equal(pedidosDe(pide)[0].opcional, false);
  assert.equal(repartirValores(pide, ["Ana"]).archivoEncabezado, null);
});
