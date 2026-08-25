/**
 * ¿Qué le mandamos a Meta cuando sale un documento?
 *
 *     npx esbuild src/lib/whatsapp/enviar.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src \
 *       --alias:server-only=./supabase/pruebas/server-only-vacio.mjs \
 *       --outfile=/tmp/env.mjs
 *     node supabase/pruebas/adjuntos.test.mjs /tmp/env.mjs
 *
 * Mandar un documento son dos llamadas a Meta y el detalle está en la segunda.
 * Lo que se vigila acá:
 *
 *   · que vaya `filename`. Sin eso el cliente recibe la lista de precios
 *     llamada «document.pdf» y en su teléfono no se distingue de nada;
 *   · que el tipo sea «document» y no «image», que es lo que hacía antes el
 *     único camino que existía;
 *   · que un .exe o un .zip se frenen acá y no en Meta, donde el error habla
 *     de «type» y no dice qué había que hacer;
 *   · que el tope de tamaño corte antes de subir cuatro megas al pedo.
 *
 * No toca la red: se reemplaza `fetch` y se mira qué se le pidió.
 *
 * El alias de `server-only` no es un atajo para saltarse una protección: ese
 * módulo existe para que el build falle si alguien importa esto desde el
 * navegador, y acá se corre en Node a propósito, que es donde vive de verdad.
 */
const { enviarDocumento, enviarImagen } = await import(process.argv[2] ?? "/tmp/env.mjs");

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
    const esSubida = String(url).endsWith("/media");
    return {
      ok: true,
      status: 200,
      json: async () =>
        esSubida ? { id: "media-123" } : { messages: [{ id: "wamid.ABC" }] },
    };
  };
  return llamadas;
}

const pdf = (bytes = 1024) => ({
  bytes: new ArrayBuffer(bytes),
  mime: "application/pdf",
  nombre: "Lista de precios 2026.pdf",
});

console.log("── un PDF ──");
{
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", pdf(), "Te paso los precios");

  es("sale bien", r.ok, true);
  es("devuelve el id de Meta", r.waId, "wamid.ABC");
  es("son dos llamadas: subir y mandar", llamadas.length, 2);
  es("la primera sube el archivo", llamadas[0].url.endsWith("/111/media"), true);

  const cuerpo = JSON.parse(llamadas[1].opciones.body);
  es("la segunda va a messages", llamadas[1].url.endsWith("/111/messages"), true);
  es("EL TIPO ES DOCUMENT", cuerpo.type, "document");
  es("apunta al archivo subido", cuerpo.document.id, "media-123");
  es("VA EL NOMBRE DEL ARCHIVO", cuerpo.document.filename, "Lista de precios 2026.pdf");
  es("y el pie como caption", cuerpo.document.caption, "Te paso los precios");
  es("al número correcto", cuerpo.to, "50370000000");
}

console.log("\n── sin pie no manda un caption vacío ──");
{
  const llamadas = espiar();
  await enviarDocumento("50370000000", pdf(), "   ");
  const cuerpo = JSON.parse(llamadas[1].opciones.body);
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
  const r = await enviarDocumento("50370000000", { bytes: new ArrayBuffer(64), mime, nombre }, "");
  es(`${nombre} sale`, r.ok, true);
  es(`${nombre} conserva su nombre`, JSON.parse(llamadas[1].opciones.body).document.filename, nombre);
}

console.log("\n── lo que no se puede, se frena acá ──");
{
  const llamadas = espiar();
  const r = await enviarDocumento(
    "50370000000",
    { bytes: new ArrayBuffer(64), mime: "application/x-msdownload", nombre: "virus.exe" },
    "",
  );
  es("un .exe se rechaza", r.ok, false);
  es("NO SE LLAMÓ A META", llamadas.length, 0);
  es("y el error dice qué sí se puede", /PDF, Word, Excel/.test(r.error), true);
}
{
  const llamadas = espiar();
  const r = await enviarDocumento("50370000000", pdf(9 * 1024 * 1024), "");
  es("un PDF de 9 MB se rechaza", r.ok, false);
  es("tampoco se subió nada", llamadas.length, 0);
  es("y el error dice cuánto entra", /4 MB/.test(r.error), true);
}

console.log("\n── la foto sigue andando igual ──");
{
  const llamadas = espiar();
  const r = await enviarImagen(
    "50370000000",
    { bytes: new ArrayBuffer(2048), mime: "image/jpeg", nombre: "recibo.jpg" },
    "Recibido",
  );
  const cuerpo = JSON.parse(llamadas[1].opciones.body);
  es("sale bien", r.ok, true);
  es("sigue siendo tipo image", cuerpo.type, "image");
  es("con su caption", cuerpo.image.caption, "Recibido");
  // Meta rechaza `filename` en una imagen; que el camino compartido no se lo
  // haya contagiado al refactorizar es justo lo que hay que comprobar.
  es("Y SIN FILENAME, QUE EN UNA FOTO NO VA", "filename" in cuerpo.image, false);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
