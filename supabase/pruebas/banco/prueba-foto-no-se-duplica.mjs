/**
 * Una imagen que tarda en salir, ¿le llega UNA vez al cliente?
 *
 *     node supabase/pruebas/banco/prueba-foto-no-se-duplica.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * El 9 de octubre de 2026 una asesora le mandó a una clienta la captura de un
 * temario: «TEMARIO BOLLERIA FRANCESA.png», 80 KB, un PNG común. Le llegó
 * CUATRO veces, a las 15:14:43, 15:15:10, 15:15:50 y 15:17:00, cada una con su
 * `wamid`: WhatsApp aceptó cuatro envíos.
 *
 * No era el formato ni el tamaño: ese mismo día salieron otras capturas en uno
 * o dos segundos. Era la base, lenta a esa hora —subir 80 KB tardó 9,5 s, y el
 * envío entero unos 33—, y un botón que mentía: «Cancelar» mientras la ventana
 * decía «Enviando…». Para ese momento el servidor ya le había pasado la imagen
 * a WhatsApp; el botón cerraba la ventana, borraba el archivo e IGNORABA el
 * resultado. La imagen salía igual, en el hilo no aparecía nada, y la asesora
 * la volvía a mandar.
 *
 * ============================================================================
 * LO QUE SE EXIGE
 * ============================================================================
 *
 *   CERRAR NO MIENTE   Durante «Enviando…» el botón dice «Cerrar», la ventana se
 *                      cierra y se avisa que el envío SIGUE.
 *
 *   EL RESULTADO LLEGA Cuando el servidor termina se refresca el hilo y se dice
 *                      que salió, aunque la ventana ya esté cerrada.
 *
 *   EL ARCHIVO QUEDA   No se borra: es la copia que muestra el hilo.
 *
 *   PREGUNTA ANTES DE REPETIR  Volver a adjuntar el mismo archivo al mismo hilo
 *                      enseguida pide confirmación. Si se dice que no, no sale.
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const PROXY = "http://127.0.0.1:3141";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, {
    encoding: "utf8",
  })
    .split("\n")
    .find((l) => l.trim() !== "")
    ?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};
const lentitud = (ms) => fetch(`${PROXY}/__lento?ms=${ms}`, { method: "POST" });

// ── un hilo de WhatsApp, entrando por el webhook ──
const TEL = "50378" + String(Date.now()).slice(-6);
const NOMBRE = "Foto Lenta";
const crudo = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "222", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "111" },
    contacts: [{ profile: { name: NOMBRE }, wa_id: TEL }],
    messages: [{ from: TEL, id: "wamid." + crypto.randomUUID(),
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text",
      text: { body: "Me pasa el temario?" } }],
  } }] }],
});
await fetch(`${APP}/api/whatsapp/webhook`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-signature-256":
      "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex"),
  },
  body: crudo,
});
await new Promise((s) => setTimeout(s, 1000));
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
if (!conv) {
  console.log("✗ no se pudo sembrar el hilo");
  process.exit(1);
}

// La captura: un PNG de verdad, con nombre propio de esta corrida.
const ARCHIVO = `/tmp/TEMARIO-PRUEBA-${process.pid}.png`;
fs.writeFileSync(
  ARCHIVO,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const imagenes = () =>
  Number(sql(`select count(*) from mensajes where conversacion_id=${conv} and direccion='saliente' and tipo='image'`));

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript(
  (h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toISOString().slice(0, 10),
);
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const dialogos = [];
p.on("dialog", async (d) => {
  dialogos.push(d.message());
  await d.dismiss(); // «no, no lo mandes otra vez»
});
// La ventana de «Se va a enviar», no el recuadro del chat, que también tiene «Enviar».
const visor = () => p.locator('div[role="dialog"][aria-label*="Se va a enviar"]');
const cuerpo = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");

try {
  await lentitud(0);
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("button.row", { hasText: NOMBRE }).first().click();
  await p.waitForTimeout(1500);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("── 1. CON LA BASE LENTA, «CERRAR» DURANTE «ENVIANDO…» NO MIENTE ──");
  // ══════════════════════════════════════════════════════════════════════════
  await p.locator('main input[type="file"]').setInputFiles(ARCHIVO);
  await p.waitForTimeout(800);
  // Como la tarde del 9 de octubre: cada consulta tarda segundo y medio.
  await lentitud(1500);
  await visor().locator('button:text-is("Enviar")').click();

  // Esperar a que el servidor ya tenga la imagen en la mano.
  await visor().locator('button:text-is("Enviando…")').waitFor({ timeout: 30000 });
  const boton = visor().locator('button:text-is("Cerrar"), button:text-is("Cancelar")').first();
  es("durante «Enviando…» el botón dice «Cerrar»", (await boton.innerText()).trim(), "Cerrar");
  await boton.click();
  await p.waitForTimeout(500);
  es("Y AVISA QUE EL ENVÍO SIGUE", /se sigue enviando/i.test(await cuerpo()), true);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. CUANDO TERMINA, SE DICE Y SE VE ──");
  // ══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < 60 && imagenes() === 0; i++) await p.waitForTimeout(500);
  await p.waitForTimeout(3000);
  es("salió una imagen", imagenes(), 1);
  es("Y SE DICE QUE SALIÓ", /se envió/i.test(await cuerpo()), true);
  /*
   * El archivo tiene que seguir EN EL BUCKET, no sólo nombrado en la fila: es
   * la copia que el hilo muestra y la que WhatsApp puede estar descargando. El
   * botón viejo lo borraba al «cancelar», con el mensaje ya en camino.
   * `/storage/v1/__archivos` es la ventana del banco a lo que queda guardado.
   */
  const ruta = sql(`select media_ruta from mensajes where conversacion_id=${conv} and tipo='image' limit 1`);
  const estado = await (await fetch(`${PROXY}/storage/v1/__archivos`)).json();
  const borrado = estado.borrados.some((b) => JSON.stringify(b).includes(ruta));
  es("Y EL ARCHIVO NO SE BORRÓ DEL BUCKET", Boolean(ruta) && !borrado, true);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. VOLVER A ADJUNTARLA ENSEGUIDA PREGUNTA ANTES ──");
  // ══════════════════════════════════════════════════════════════════════════
  await lentitud(0);
  await p.locator('main input[type="file"]').setInputFiles(ARCHIVO);
  await p.waitForTimeout(800);
  await visor().locator('button:text-is("Enviar")').click();
  await p.waitForTimeout(2500);
  es("SE PREGUNTÓ", dialogos.length, 1);
  es("y la pregunta dice que ya se mandó", /ya se le mandó/i.test(dialogos[0] ?? ""), true);
  es("AL DECIR QUE NO, NO SALIÓ OTRA", imagenes(), 1);

  console.log("\n── 4. nada reventó por el camino ──");
  es("sin errores de JavaScript", errores, []);
} finally {
  await lentitud(0).catch(() => {});
  await nav.close();
  fs.rmSync(ARCHIVO, { force: true });
  sql(`delete from mensajes where conversacion_id = ${conv}`);
  sql(`delete from conversaciones where id = ${conv}`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
  sql(`delete from clientes where telefono='${TEL}'`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
