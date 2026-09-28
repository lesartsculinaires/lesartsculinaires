/**
 * La imagen se le SUBE a Meta; Meta no la va a buscar.
 *
 *     node --test supabase/pruebas/encabezadoParaMeta.test.mjs
 *
 * ============================================================================
 * EL ERROR QUE ESTO VIGILA
 * ============================================================================
 *
 * En el hilo de la escuela, debajo de la invitación al workshop:
 *
 *     03:45 p. m. · No se pudo entregar
 *     Media upload error
 *
 * Meta ACEPTÓ el mensaje y después no pudo bajar la imagen del encabezado. El
 * CRM le estaba pasando una dirección —`image: { link: … }`— y eso tiene un
 * defecto de fondo: que el envío funcione depende de si Meta alcanza o no un
 * servidor, y cuando no lo alcanza, falla TARDE. El mensaje ya salió, la
 * conversación quedó con un mensaje muerto, y no hay nada que reintentar.
 *
 * Falló incluso con la dirección de la imagen que Meta tenía aprobada de esa
 * misma plantilla: su propio CDN no la vuelve a servir.
 *
 * Ahora el CRM consigue los bytes —del bucket o de la dirección—, se los sube a
 * Meta, y manda `image: { id: … }`. El envío deja de depender de nadie, y si
 * algo falla, falla ANTES de mandarle nada a ningún cliente.
 *
 * ============================================================================
 * POR QUÉ SE PRUEBA CON DOBLES
 * ============================================================================
 *
 * Porque lo que hay que fijar es el ORDEN y el reparto —de dónde salen los
 * bytes, y que siempre terminen subidos—, no que Meta conteste. Con dobles se
 * recorren todos los finales, incluidos los que en producción aparecieron una
 * sola vez y a destiempo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

import { compilar } from "./compilar.mjs";

const { encabezadoParaMeta } = await compilar("src/lib/whatsapp/encabezadoParaMeta.ts");

/**
 * El subidor de mentira: anota qué le pidieron subir y contesta lo que se le
 * diga. Va como parámetro, así que no hace falta tocar el empaquetado.
 */
let subido = [];
let rechazo = null;
const subidor = async (bytes, mime) => {
  subido.push({ bytes, mime });
  return rechazo ? { ok: false, error: rechazo } : { ok: true, id: "media-de-mentira-1" };
};
const loQueSeSubio = () => subido;

const RUTA = "saliente/plantillas/workshop_es/9f3e";
const MARCADA = `subida:${RUTA}`;

/** Un Supabase de mentira que devuelve los bytes que se le digan. */
const bajador = (respuesta) => ({
  storage: {
    from() {
      return {
        async download(ruta) {
          bajador.pedida = ruta;
          return respuesta;
        },
      };
    },
  },
});

const unPng = (texto = "imagen") =>
  new Blob([new TextEncoder().encode(texto)], { type: "image/png" });

test.beforeEach(() => {
  subido = [];
  rechazo = null;
  bajador.pedida = null;
  mock.restoreAll();
});

test("── SIN ENCABEZADO DE ARCHIVO, NO SE LLAMA A NADIE ──", async () => {
  /*
   * La mayoría de las plantillas de la escuela son sólo texto. Si acá se
   * subiera algo igual, cada envío común pagaría una llamada a Meta para nada.
   */
  for (const nada of ["", null, undefined, "   "]) {
    const r = await encabezadoParaMeta(bajador({ data: null, error: null }), nada, subidor);
    assert.equal(r.ok, true);
    assert.equal(r.id, null);
  }
  assert.equal(loQueSeSubio().length, 0);
});

test("── UNA SUBIDA SE BAJA DEL BUCKET Y SE SUBE A META ──", async () => {
  const sb = bajador({ data: unPng(), error: null });
  const r = await encabezadoParaMeta(sb, MARCADA, subidor);

  assert.equal(r.ok, true);
  assert.equal(r.id, "media-de-mentira-1");

  // Se bajó la ruta PELADA, sin la marca: con la marca adentro el
  // almacenamiento buscaría un archivo llamado «subida:saliente/…».
  assert.equal(bajador.pedida, RUTA);

  // Y lo que se subió es lo que se bajó, con su tipo.
  assert.equal(loQueSeSubio().length, 1);
  assert.equal(loQueSeSubio()[0].mime, "image/png");
  assert.equal(loQueSeSubio()[0].bytes.byteLength > 0, true);
});

test("── UNA DIRECCIÓN TAMBIÉN SE BAJA Y SE SUBE ──", async () => {
  /*
   * Acá entra la imagen que Meta tenía aprobada. Que el servidor pueda bajarla
   * NO quiere decir que Meta pudiera —de hecho no podía, y por eso el mensaje
   * moría— así que igual se sube.
   */
  mock.method(globalThis, "fetch", async () =>
    new Response(new TextEncoder().encode("imagen"), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    }),
  );

  const r = await encabezadoParaMeta(
    bajador({ data: null, error: null }),
    "https://cdn.test/a.jpg",
    subidor,
  );

  assert.equal(r.ok, true);
  assert.equal(r.id, "media-de-mentira-1");
  assert.equal(loQueSeSubio()[0].mime, "image/jpeg");
  // No se tocó el bucket: la dirección no es una subida.
  assert.equal(bajador.pedida, null);
});

test("── SI LA DIRECCIÓN NO SE PUEDE BAJAR, SE DICE QUÉ HACER ──", async () => {
  /*
   * Es el caso de producción. El mensaje no puede quedarse en «no se pudo»:
   * la imagen existe y está aprobada en Meta, lo que falta es que el CRM tenga
   * una copia. Sin esa frase, quien atiende vuelve a intentar lo mismo.
   */
  mock.method(globalThis, "fetch", async () => new Response("no", { status: 403 }));

  const r = await encabezadoParaMeta(
    bajador({ data: null, error: null }),
    "https://cdn.test/a.jpg",
    subidor,
  );

  assert.equal(r.ok, false);
  assert.match(r.error, /403/);
  assert.match(r.error, /Subir imagen/);
  // Y no se le mandó nada a Meta: el fallo es ANTES del envío.
  assert.equal(loQueSeSubio().length, 0);
});

test("── UN ENLACE DE DRIVE DEVUELVE UNA PÁGINA, NO UNA IMAGEN ──", async () => {
  /*
   * El caso más común de una dirección pegada a mano: se abre en el navegador
   * de quien la pegó —que ya tiene la sesión— y lo que entrega es HTML.
   * Subirlo a Meta como imagen daría un error suyo que no menciona ningún Drive.
   */
  mock.method(globalThis, "fetch", async () =>
    new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
  );

  const r = await encabezadoParaMeta(
    bajador({ data: null, error: null }),
    "https://drive.test/x",
    subidor,
  );

  assert.equal(r.ok, false);
  assert.match(r.error, /Drive/);
  assert.equal(loQueSeSubio().length, 0);
});

test("── SI EL BUCKET NO LA TIENE, SE DICE ──", async () => {
  const sb = bajador({ data: null, error: { message: "Object not found" } });
  const r = await encabezadoParaMeta(sb, MARCADA, subidor);

  assert.equal(r.ok, false);
  assert.match(r.error, /Object not found/);
  assert.equal(loQueSeSubio().length, 0);
});

test("── Y SI META RECHAZA LA SUBIDA, ESO SE DEVUELVE ──", async () => {
  // El fallo de Meta al subir es el único que llega hasta acá, y tiene que
  // pasar tal cual: es lo único que explica por qué no salió.
  rechazo = "No se pudo subirle la imagen a Meta: archivo muy grande";

  const r = await encabezadoParaMeta(bajador({ data: unPng(), error: null }), MARCADA, subidor);

  assert.equal(r.ok, false);
  assert.match(r.error, /archivo muy grande/);
});

test("── UNA DIRECCIÓN QUE NO ES DIRECCIÓN ──", async () => {
  /*
   * `4::aW1n…`, la forma vieja del `header_handle` de Meta. No es una dirección
   * y no se puede bajar; el mensaje tiene que mandar a subir el archivo en vez
   * de intentar una descarga que no existe.
   */
  const r = await encabezadoParaMeta(
    bajador({ data: null, error: null }),
    "4::aW1nL3BuZw==:ARZ",
    subidor,
  );

  assert.equal(r.ok, false);
  assert.match(r.error, /Subir imagen/);
  assert.equal(loQueSeSubio().length, 0);
});
