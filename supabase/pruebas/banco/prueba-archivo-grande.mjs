/**
 * ¿Un archivo grande esquiva el servidor, y no deja basura si falla?
 *
 *     node --experimental-strip-types supabase/pruebas/banco/prueba-archivo-grande.mjs
 *
 * Las dos cosas que hacen posible mandar archivos grandes, y ninguna se ve
 * mirando la pantalla:
 *
 *   1. QUE EL ARCHIVO NO PASE POR EL SERVIDOR. Ese era el techo real: iba
 *      adentro de la llamada a la función de Netlify, que corta el cuerpo en
 *      6 MB. Acá se miran las peticiones que hace el navegador y se comprueba
 *      que el archivo sale derecho al bucket de Supabase. Si alguien volviera
 *      a meterlo en un FormData, todo seguiría andando con archivos chicos y
 *      el tope volvería a bajar a 6 MB sin que nadie se entere hasta que una
 *      asesora no pueda mandar un temario.
 *
 *   2. QUE PASADO EL TOPE SE FRENE ACÁ Y NO ALLÁ. Rechazar un archivo grande
 *      después de subirlo es hacerle esperar a la asesora toda la subida para
 *      después decirle que no. La comprobación tiene que pasar antes, y sin
 *      que se toque el bucket.
 *
 *   3. QUE NO QUEDE BASURA. Ahora el archivo se sube antes de saber si Meta lo
 *      va a aceptar. Si el envío falla y nadie lo borra, queda en el bucket un
 *      archivo de decenas de megas que no se ve desde ninguna pantalla y nadie
 *      va a salir a buscar.
 *
 * El envío falla a propósito: el banco tiene un token de WhatsApp de mentira,
 * así que Meta contesta 401. Eso es justo el caso que hay que limpiar.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const { TOPE_DOCUMENTO_BYTES } = await import("../../../src/lib/whatsapp/adjuntos.ts");

// Bastante más que los 6 MB donde cortaba el camino viejo, y por debajo del
// tope de hoy: lo que se prueba acá es que el archivo esquive el servidor, no
// el tope, que tiene su propia prueba en `adjuntos.test.mjs`.
const MEGAS = 12;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-grande-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ------------------------------------------------------- un PDF de verdad

const ARCHIVO = path.join(os.tmpdir(), "Temario 2026.pdf");
{
  const cabecera = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n");
  const relleno = Buffer.from("%" + "x".repeat(99) + "\n");
  const cuantos = Math.ceil((MEGAS * 1024 * 1024) / relleno.length);
  fs.writeFileSync(
    ARCHIVO,
    Buffer.concat([cabecera, Buffer.alloc(cuantos * relleno.length).fill(relleno),
                   Buffer.from("\ntrailer<</Root 1 0 R>>")]),
  );
}
const pesa = (fs.statSync(ARCHIVO).size / 1024 / 1024).toFixed(1);

// ------------------------------------------------------- un hilo para usar

/*
 * Se limpia antes, no sólo después.
 *
 * `clientes.telefono` no tiene restricción única —dos personas pueden compartir
 * un teléfono— así que el `on conflict do nothing` que había acá no hacía nada
 * y cada corrida dejaba un cliente más. Con dos, el insert de la conversación
 * pasaba a devolver dos filas y chocaba contra la única de
 * `conversaciones.telefono`: se quedaba sin sembrar, y a partir de ahí la
 * prueba no volvía a pasar nunca hasta rearmar el banco.
 *
 * Limpiar al empezar y no confiar en que la corrida anterior terminó bien es
 * lo que hace que una prueba se pueda repetir.
 */
sql(`
  delete from storage.objects where bucket_id='whatsapp';
  delete from mensajes where conversacion_id in
    (select id from conversaciones where telefono='50399000001');
  delete from conversaciones where telefono='50399000001';
  delete from oportunidades where cliente_id in
    (select id from clientes where telefono='50399000001');
  delete from clientes where telefono='50399000001';

  insert into clientes (nombre, telefono) values ('Prueba Grande','50399000001');
  insert into conversaciones (telefono, cliente_id, estado, ultimo_texto, ultimo_mensaje_en, sin_leer, archivada)
  select '50399000001', c.id, 'open', 'Hola', now(), 1, false from clientes c
   where c.telefono='50399000001'
     and not exists (select 1 from conversaciones where telefono='50399000001');
  insert into mensajes (conversacion_id, direccion, tipo, texto, estado, creado_en)
  select cv.id, 'entrante', 'text', 'Hola', 'recibido', now() from conversaciones cv
   where cv.telefono='50399000001'
     and not exists (select 1 from mensajes m where m.conversacion_id=cv.id);
`);

/*
 * Que el hilo haya quedado, antes de abrir el navegador.
 *
 * Sin esto, un sembrado que no entró se manifiesta treinta segundos después
 * como un `locator.click: Timeout` sobre la lista de conversaciones, que no se
 * parece en nada al problema: manda a buscar el error en la pantalla cuando
 * está en la base. Fue justamente este aviso el que dejó ver que el sembrado
 * se rompía solo por los clientes duplicados que dejaba cada corrida fallida.
 */
{
  const hilo = sql("select count(*) from conversaciones where telefono='50399000001';");
  if (hilo !== "1") {
    console.error(
      `No se pudo sembrar la conversación de prueba (hay ${hilo}, tendría que haber 1).\n` +
        "Revisá que el banco esté armado: bash supabase/pruebas/banco/armar.sh",
    );
    process.exit(1);
  }
}

// -------------------------------------------------------------- el navegador

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

// Acá está la prueba de fuego: adónde va el archivo.
const alBucket = [];
const alServidor = [];
p.on("request", (r) => {
  if (r.method() !== "POST") return;
  if (/storage\/v1\/object/.test(r.url())) alBucket.push(r.url());
  // Una acción de servidor con un cuerpo grande sería el camino viejo.
  const largo = Number(r.headers()["content-length"] ?? 0);
  if (largo > 2 * 1024 * 1024 && !/storage\/v1/.test(r.url())) alServidor.push(r.url());
});

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2200);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(1800);
await p.locator("main button").filter({ hasText: /50399000001|Prueba Grande/ }).first().click();
await p.waitForTimeout(1500);

console.log(`── un PDF de ${pesa} MB (el camino viejo cortaba en 6) ──`);
await p.locator('input[type="file"]').first().setInputFiles(ARCHIVO);
await p.waitForTimeout(2000);

const visor = p.locator('div[role="dialog"][aria-label*="Se va a enviar"]');
es("se abre la ventana de confirmación", await visor.count(), 1);
es("con el nombre del archivo", (await visor.innerText()).includes("Temario 2026.pdf"), true);
es(
  "NO LO RECHAZA POR TAMAÑO",
  /pesa .* y el tope es/.test(await p.evaluate(() => document.body.innerText)),
  false,
);

await visor.locator('button:has-text("Enviar")').click();
await p.waitForTimeout(10000);

console.log("");
es("EL ARCHIVO FUE DERECHO AL BUCKET", alBucket.length > 0, true);
if (alBucket.length) console.log("   " + alBucket[0].replace(/\?.*/, "").slice(0, 80));
es("Y NO PASÓ POR EL SERVIDOR DE LA APLICACIÓN", alServidor, []);
es(
  "subió bajo «saliente/», no bajo «wa/»",
  /\/whatsapp\/saliente\//.test(alBucket[0] ?? ""),
  true,
);

console.log("\n── el envío falla (el banco tiene un token de mentira) ──");
es(
  "avisa que no se pudo",
  /no se pudo|error|inválido|token/i.test(await p.evaluate(() => document.body.innerText)),
  true,
);
es("Y NO DEJÓ EL ARCHIVO TIRADO", sql("select count(*) from storage.objects where bucket_id='whatsapp';"), "0");
es(
  "ni un mensaje que el cliente no recibió",
  sql(
    "select count(*) from mensajes m join conversaciones c on c.id=m.conversacion_id" +
      " where c.telefono='50399000001' and m.direccion='saliente';",
  ),
  "0",
);

console.log(`\n── y uno pasado de tope (más de ${TOPE_DOCUMENTO_BYTES / 1024 / 1024} MB) ──`);
{
  const antes = alBucket.length;
  const gordo = path.join(os.tmpdir(), "Catalogo enorme.pdf");
  fs.writeFileSync(gordo, Buffer.alloc(TOPE_DOCUMENTO_BYTES + 1024 * 1024, 0x20));

  await p.locator('input[type="file"]').first().setInputFiles(gordo);
  await p.waitForTimeout(1200);
  await p
    .locator('div[role="dialog"][aria-label*="Se va a enviar"] button:has-text("Enviar")')
    .click();
  await p.waitForTimeout(2500);

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("avisa que pesa de más", /pesa .* y el tope es/.test(t), true);
  es("y dice cuánto pesa y cuánto entra", /MB y el tope es \d+ MB/.test(t), true);
  es("NI SIQUIERA LO SUBIÓ", alBucket.length, antes);
  es("y el bucket sigue vacío", sql("select count(*) from storage.objects where bucket_id='whatsapp';"), "0");
  fs.rmSync(gordo, { force: true });
}

/*
 * El caso que dejaba encerrada a la persona.
 *
 * Los dos pasos del envío pueden lanzar en vez de devolver un error —una
 * conexión que se corta a mitad, el servidor que contesta 500— y antes eso no
 * lo atrapaba nadie: el visor se quedaba diciendo «Subiendo…» para siempre y,
 * como no se dejaba cerrar mientras creía que estaba mandando, la única salida
 * era recargar la página. Un archivo de 2 MB con la red inestable bastaba.
 *
 * Acá se corta la subida a propósito y se comprueba lo único que importa: que
 * avise y que se pueda salir.
 */
console.log("\n── si la conexión se corta a mitad ──");
{
  await p.route("**/storage/v1/object/whatsapp/**", (ruta) => ruta.abort("failed"));

  await p.locator('input[type="file"]').first().setInputFiles(ARCHIVO);
  await p.waitForTimeout(1200);
  const v = p.locator('div[role="dialog"][aria-label*="Se va a enviar"]');
  await v.locator('button:has-text("Enviar")').click();
  await p.waitForTimeout(3000);

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("NO SE QUEDA EN «SUBIENDO…»", /Subiendo…/.test(t), false);
  es("avisa que no se pudo", /No se pudo|tardó demasiado|no deja subir/.test(t), true);

  // Y lo segundo que faltaba: poder salir.
  await v.locator('button:has-text("Cancelar")').click();
  await p.waitForTimeout(800);
  es(
    "Y SE PUEDE CERRAR EL VISOR",
    await p.locator('div[role="dialog"][aria-label*="Se va a enviar"]').count(),
    0,
  );
  await p.unroute("**/storage/v1/object/whatsapp/**");
}

es("sin errores en la página", errores, []);
await nav.close();

sql(`
  delete from storage.objects where bucket_id='whatsapp';
  delete from mensajes where conversacion_id in (select id from conversaciones where telefono='50399000001');
  delete from conversaciones where telefono='50399000001';
  delete from oportunidades where cliente_id in (select id from clientes where telefono='50399000001');
  delete from clientes where telefono='50399000001';
`);
fs.rmSync(ARCHIVO, { force: true });

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
