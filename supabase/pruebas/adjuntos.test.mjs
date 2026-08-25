/**
 * ¿Qué le mandamos a Meta cuando sale un documento?
 *
 *     npx esbuild src/lib/whatsapp/enviar.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src \
 *       --alias:server-only=./supabase/pruebas/server-only-vacio.mjs \
 *       --outfile=/tmp/env.mjs
 *     node --experimental-strip-types supabase/pruebas/adjuntos.test.mjs /tmp/env.mjs
 *
 * El `--experimental-strip-types` es para poder leer el tope desde el mismo
 * archivo que usa la aplicación, en vez de repetir el número acá. Y ojo con el
 * empaquetado: esbuild incrusta la constante, así que cambiar el tope y no
 * volver a empaquetar hace fallar la prueba por una razón que no existe.
 *
 * A Meta se le pasa un enlace firmado al archivo, no el archivo: así mandar
 * veinte megas le cuesta al servidor lo mismo que mandar veinte kilos. Lo que
 * se vigila acá:
 *
 *   · que vaya `filename`. Sin eso el cliente recibe la lista de precios
 *     llamada «document.pdf» y en su teléfono no se distingue de nada;
 *   · que el tipo sea «document» y no «image», que es lo que hacía antes el
 *     único camino que existía;
 *   · que vaya el enlace y NO los bytes, que es lo que levanta el tope;
 *   · que un .exe o un .zip se frenen acá y no en Meta, donde el error habla
 *     de «type» y no dice qué había que hacer;
 *   · que el tope corte donde dice la constante, sin repetir el número acá:
 *     una prueba con el número escrito a mano se queda vieja el día que el
 *     tope cambie, y entonces falla sin que nada esté roto.
 *
 * No toca la red: se reemplaza `fetch` y se mira qué se le pidió.
 *
 * El alias de `server-only` no es un atajo para saltarse una protección: ese
 * módulo existe para que el build falle si alguien importa esto desde el
 * navegador, y acá se corre en Node a propósito, que es donde vive de verdad.
 */
const { enviarDocumento, enviarImagen } = await import(process.argv[2] ?? "/tmp/env.mjs");
const { TOPE_DOCUMENTO_BYTES } = await import("../../src/lib/whatsapp/adjuntos.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

process.env.WHATSAPP_TOKEN = "token-de-prueba";
process.env.WHATSAPP_PHONE_NUMBER_ID = "111";

/** Guarda lo que se le pidió a Meta y contesta como contestaría Meta. */
function espiar() {
  const llamadas = [];
  global.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), opciones });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.ABC" }] }),
    };
  };
  return llamadas;
}

const ENLACE = "https://ejemplo.supabase.co/storage/v1/object/sign/whatsapp/saliente/1/abc?token=xyz";

const pdf = (bytes = 1024) => ({
  enlace: ENLACE,
  bytes,
  mime: "application/pdf",
  nombre: "Lista de precios 2026.pdf",
});

console.log("── un PDF ──");
{
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", pdf(), "Te paso los precios");

  es("sale bien", r.ok, true);
  es("devuelve el id de Meta", r.waId, "wamid.ABC");
  es("ES UNA SOLA LLAMADA, NO SE SUBE NADA", llamadas.length, 1);

  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  es("va a messages", llamadas[0].url.endsWith("/111/messages"), true);
  es("EL TIPO ES DOCUMENT", cuerpo.type, "document");
  es("VA EL ENLACE FIRMADO", cuerpo.document.link, ENLACE);
  es("VA EL NOMBRE DEL ARCHIVO", cuerpo.document.filename, "Lista de precios 2026.pdf");
  es("y el pie como caption", cuerpo.document.caption, "Te paso los precios");
  es("al número correcto", cuerpo.to, "50370000000");
}

console.log("\n── sin pie no manda un caption vacío ──");
{
  const llamadas = espiar();
  await enviarDocumento("50370000000", pdf(), "   ");
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  es("no hay caption", "caption" in cuerpo.document, false);
  es("pero sí filename", cuerpo.document.filename, "Lista de precios 2026.pdf");
}

console.log("\n── Excel y PowerPoint también ──");
for (const [mime, nombre] of [
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cuotas.xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "Plan.pptx"],
  ["application/msword", "Contrato.doc"],
]) {
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", { enlace: ENLACE, bytes: 64, mime, nombre }, "");
  es(`${nombre} sale`, r.ok, true);
  es(`${nombre} conserva su nombre`, JSON.parse(llamadas[0].opciones.body).document.filename, nombre);
}

console.log("\n── lo que no se puede, se frena acá ──");
{
  const llamadas = espiar();
  const r = await enviarDocumento(
    "50370000000",
    { enlace: ENLACE, bytes: 64, mime: "application/x-msdownload", nombre: "virus.exe" },
    "",
  );
  es("un .exe se rechaza", r.ok, false);
  es("NO SE LLAMÓ A META", llamadas.length, 0);
  es("y el error dice qué sí se puede", /PDF, Word, Excel/.test(r.error), true);
}
const TOPE_MB = TOPE_DOCUMENTO_BYTES / 1024 / 1024;
{
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", pdf(TOPE_DOCUMENTO_BYTES + 1), "");
  es(`uno de más de ${TOPE_MB} MB se rechaza`, r.ok, false);
  es("no se llamó a Meta", llamadas.length, 0);
  es("y el error dice cuánto entra", r.error.includes(`${TOPE_MB} MB`), true);
}
{
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", pdf(TOPE_DOCUMENTO_BYTES), "");
  es(`UNO DE ${TOPE_MB} MB CLAVADOS SÍ PASA`, r.ok, true);
  es(
    "y a Meta le fue el enlace, no el archivo",
    JSON.parse(llamadas[0].opciones.body).document.link,
    ENLACE,
  );
}

console.log("\n── la foto sigue andando igual ──");
{
  const llamadas = espiar();
  const r = await enviarImagen(
    "50370000000",
    { enlace: ENLACE, bytes: 2048, mime: "image/jpeg", nombre: "recibo.jpg" },
    "Recibido",
  );
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  es("sale bien", r.ok, true);
  es("sigue siendo tipo image", cuerpo.type, "image");
  es("con su caption", cuerpo.image.caption, "Recibido");
  es("y con el enlace", cuerpo.image.link, ENLACE);
  // Meta rechaza `filename` en una imagen; que el camino compartido no se lo
  // haya contagiado al refactorizar es justo lo que hay que comprobar.
  es("Y SIN FILENAME, QUE EN UNA FOTO NO VA", "filename" in cuerpo.image, false);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
