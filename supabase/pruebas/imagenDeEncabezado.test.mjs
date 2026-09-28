/**
 * La imagen de encabezado: se guarda la ruta, se firma al mandar.
 *
 *     node --test supabase/pruebas/imagenDeEncabezado.test.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ CUIDANDO
 * ============================================================================
 *
 * Que lo que queda guardado sea la RUTA dentro del bucket y no una dirección
 * firmada. Parece un detalle y decide si una campaña larga llega al final:
 *
 *   CON LA RUTA        Cada tanda del envío masivo firma la suya. Una campaña
 *                      que quedó a medias el martes sigue el jueves.
 *
 *   CON LA DIRECCIÓN   Se muere a los diez minutos, y del destinatario ciento
 *                      uno en adelante Meta contesta que no pudo bajar la
 *                      imagen —un error que no menciona ninguna firma, así que
 *                      se busca donde no es—.
 *
 * Y que un enlace pegado a mano pase de largo sin tocarse: ya es público.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const {
  MARCA_DE_SUBIDA,
  comoSubida,
  esSubida,
  rutaDeSubida,
  enlaceParaMeta,
  comoSeLlama,
  MINUTOS_DE_FIRMA,
  IMAGENES_DE_ENCABEZADO,
} = await compilar("src/lib/whatsapp/imagenDeEncabezado.ts");

const RUTA = "saliente/plantillas/9f3e-0000-4444";
const PEGADO = "https://ejemplo.test/ya-publicada.jpg";

/** Un Supabase de mentira que anota qué le pidieron firmar. */
const firmante = (respuesta) => {
  const pedidos = [];
  return {
    pedidos,
    storage: {
      from(balde) {
        return {
          async createSignedUrl(ruta, segundos) {
            pedidos.push({ balde, ruta, segundos });
            return respuesta;
          },
        };
      },
    },
  };
};

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

test("── UNA SUBIDA SE FIRMA CONTRA EL BUCKET ──", async () => {
  const sb = firmante({ data: { signedUrl: "https://supabase.test/firmada?token=x" }, error: null });
  const r = await enlaceParaMeta(sb, "whatsapp", comoSubida(RUTA));

  assert.equal(r.ok, true);
  assert.equal(r.enlace, "https://supabase.test/firmada?token=x");

  // Y se firmó la ruta pelada, sin la marca: con la marca adentro el
  // almacenamiento buscaría un archivo llamado «subida:saliente/…» que no existe.
  assert.deepEqual(sb.pedidos, [
    { balde: "whatsapp", ruta: RUTA, segundos: MINUTOS_DE_FIRMA * 60 },
  ]);
});

test("── UN ENLACE PEGADO PASA DE LARGO ──", async () => {
  const sb = firmante({ data: null, error: { message: "no tendría que llamarse" } });
  const r = await enlaceParaMeta(sb, "whatsapp", PEGADO);

  assert.equal(r.ok, true);
  assert.equal(r.enlace, PEGADO);
  // Lo importante: NO se fue a firmar nada. Ya es público.
  assert.equal(sb.pedidos.length, 0);
});

test("── SIN NADA QUE FIRMAR, TAMPOCO SE LLAMA ──", async () => {
  /*
   * Es el caso de una plantilla sin encabezado de archivo, que es la mayoría.
   * Si acá se firmara igual, cada envío de una plantilla común pagaría una
   * llamada al almacenamiento para nada.
   */
  const sb = firmante({ data: null, error: { message: "no tendría que llamarse" } });
  const r = await enlaceParaMeta(sb, "whatsapp", "");

  assert.equal(r.ok, true);
  assert.equal(r.enlace, "");
  assert.equal(sb.pedidos.length, 0);
});

test("── SI LA FIRMA FALLA, SE DICE Y NO SE MANDA ──", async () => {
  /*
   * Mandar igual sería mandarle a Meta una dirección vacía: rechaza el mensaje
   * con «falta un parámetro», que manda a buscar el problema a la plantilla
   * cuando el problema es el archivo.
   */
  const sb = firmante({ data: null, error: { message: "Object not found" } });
  const r = await enlaceParaMeta(sb, "whatsapp", comoSubida(RUTA));

  assert.equal(r.ok, false);
  assert.match(r.error, /imagen/i);
  assert.match(r.error, /Object not found/);
});

test("── UNA FIRMA VACÍA TAMBIÉN ES UN FALLO ──", async () => {
  // El almacenamiento puede contestar sin error y sin dirección. Tratarlo como
  // éxito mandaría `link: undefined`.
  const sb = firmante({ data: { signedUrl: "" }, error: null });
  const r = await enlaceParaMeta(sb, "whatsapp", comoSubida(RUTA));

  assert.equal(r.ok, false);
});

test("── LA RUTA NO SE MUESTRA NUNCA COMO TEXTO ──", () => {
  // «saliente/plantillas/9f3e…» no le dice nada a nadie y encima se vería
  // dentro de la vista previa del mensaje.
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
