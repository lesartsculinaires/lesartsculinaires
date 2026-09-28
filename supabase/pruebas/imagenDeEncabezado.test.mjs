/**
 * La imagen de encabezado: qué se guarda como valor, y dónde vive.
 *
 *     node --test supabase/pruebas/imagenDeEncabezado.test.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ CUIDANDO
 * ============================================================================
 *
 * Que lo que queda guardado sea la RUTA dentro del bucket y no algo que caduca.
 * Parece un detalle y decide si una campaña larga llega al final:
 *
 *   CON LA RUTA        Cada tanda del envío masivo resuelve la suya. Una
 *                      campaña que quedó a medias el martes sigue el jueves.
 *
 *   CON ALGO QUE VENCE Una dirección firmada dura minutos; el identificador
 *                      que devuelve Meta al subir una imagen, treinta días.
 *                      Guardar cualquiera de los dos mata la campaña a mitad
 *                      de camino, con un error que no menciona ninguna imagen.
 *
 * Y que la carpeta de cada plantilla se arme siempre igual: es lo que permite
 * encontrar la imagen la próxima vez en vez de tener que subirla de nuevo.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const {
  MARCA_DE_SUBIDA,
  comoSubida,
  esSubida,
  rutaDeSubida,
  comoSeLlama,
  carpetaDePlantilla,
  IMAGENES_DE_ENCABEZADO,
} = await compilar("src/lib/whatsapp/imagenDeEncabezado.ts");

const RUTA = "saliente/plantillas/workshop_es/9f3e-0000-4444";
const PEGADO = "https://ejemplo.test/ya-publicada.jpg";

test("── LA MARCA DISTINGUE UNA SUBIDA DE UN ENLACE ──", () => {
  const valor = comoSubida(RUTA);

  assert.equal(valor, `${MARCA_DE_SUBIDA}${RUTA}`);
  assert.equal(esSubida(valor), true);
  assert.equal(rutaDeSubida(valor), RUTA);

  // Un enlace pegado no es una subida, y no tiene ruta que sacarle.
  assert.equal(esSubida(PEGADO), false);
  assert.equal(rutaDeSubida(PEGADO), null);

  // Ni lo vacío ni lo que no está.
  for (const nada of ["", null, undefined]) {
    assert.equal(esSubida(nada), false);
    assert.equal(rutaDeSubida(nada), null);
  }
});

test("── CADA PLANTILLA TIENE SU CARPETA, Y SIEMPRE LA MISMA ──", () => {
  /*
   * Es lo que permite encontrar la imagen la próxima vez. Si esto devolviera
   * algo distinto en cada llamada, la imagen se guardaría bien y no se
   * encontraría nunca —sin fallar, que es lo peor—.
   */
  assert.equal(
    carpetaDePlantilla("workshop_barra_dubai_es"),
    "saliente/plantillas/workshop_barra_dubai_es",
  );
  assert.equal(
    carpetaDePlantilla("workshop_barra_dubai_es"),
    carpetaDePlantilla("workshop_barra_dubai_es"),
  );
});

test("── Y UN IDENTIFICADOR RARO NO PARTE LA RUTA ──", () => {
  /*
   * El id lo pone Meta y no hay ninguna promesa sobre qué caracteres trae. Uno
   * con una barra partiría la ruta en dos carpetas y la imagen quedaría donde
   * no se la busca; uno con «..» apuntaría fuera de «saliente/», que es la
   * única carpeta donde el bucket deja escribir.
   */
  assert.equal(carpetaDePlantilla("a/b"), "saliente/plantillas/a_b");
  assert.equal(carpetaDePlantilla("../otro"), "saliente/plantillas/___otro");
  assert.equal(carpetaDePlantilla("con espacio"), "saliente/plantillas/con_espacio");

  // Y todas quedan colgando de «saliente/», que es lo que mira la política.
  for (const id of ["a/b", "../otro", "x?y=1"]) {
    assert.ok(carpetaDePlantilla(id).startsWith("saliente/plantillas/"));
  }
});

test("── LA RUTA NO SE MUESTRA NUNCA COMO TEXTO ──", () => {
  // «saliente/plantillas/…» no le dice nada a nadie y encima se vería dentro de
  // la vista previa del mensaje.
  assert.equal(comoSeLlama(comoSubida(RUTA)), "la imagen subida");
  assert.equal(comoSeLlama(PEGADO), PEGADO);
});

test("── EN UN ENCABEZADO META SÓLO ACEPTA JPG Y PNG ──", () => {
  /*
   * Es más angosto que lo que acepta el chat, donde el webp entra. Si la
   * pantalla ofreciera webp, la subida saldría bien y el ENVÍO fallaría —con la
   * campaña ya empezada, que es el peor momento—.
   */
  assert.deepEqual(IMAGENES_DE_ENCABEZADO, ["image/jpeg", "image/png"]);
  assert.equal(IMAGENES_DE_ENCABEZADO.includes("image/webp"), false);
});
