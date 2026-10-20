/**
 * Mandar un video desde el Inbox.
 *
 *     node supabase/pruebas/banco/prueba-enviar-video.mjs
 *
 * Hasta el 20/10/2026 el clip sólo ofrecía fotos y documentos, y para un video
 * había que mandar un enlace. Ahora se pueden mandar MP4 y 3GP de hasta 16 MB
 * (el tope de WhatsApp). Se comprueba que:
 *   - un MP4 chico se elige, pide confirmar, sale y queda guardado como video;
 *   - el pie escrito junto al video viaja con él;
 *   - un .mov de iPhone se rechaza al elegirlo, diciendo cómo arreglarlo;
 *   - un MP4 de más de 16 MB se rechaza al elegirlo, sugiriendo el enlace;
 *   - no sale nada en esos dos casos.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" })
    .split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const TEL = "50376" + String(Date.now()).slice(-6);
const NOMBRE = "Prueba Video " + String(Date.now()).slice(-4);
const crudo = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "222", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "111" },
    contacts: [{ profile: { name: NOMBRE }, wa_id: TEL }],
    messages: [{ from: TEL, id: "wamid." + crypto.randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hola" } }],
  } }] }],
});
await fetch(`${APP}/api/whatsapp/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex") },
  body: crudo,
});
await new Promise((s) => setTimeout(s, 1000));
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
if (!conv) { console.log("✗ no se pudo sembrar el hilo"); process.exit(1); }

// Un MP4 mínimo (cabecera ftyp) y los casos malos.
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(2048)]);
fs.writeFileSync("/tmp/prueba-video.mp4", mp4);
fs.writeFileSync("/tmp/prueba-iphone.mov", mp4);
fs.writeFileSync("/tmp/prueba-grande.mp4", Buffer.alloc(17 * 1024 * 1024, 1));

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const entrada = () => p.locator('main input[type="file"]');
const mensajesSalientes = () => Number(sql(`select count(*) from mensajes where conversacion_id=${conv} and direccion='saliente'`));

try {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("button.row", { hasText: NOMBRE }).first().click();
  await p.locator("main textarea").first().waitFor({ timeout: 15000 });

  console.log("── 1. UN MP4 CHICO SALE ──");
  es("el selector ofrece video", (await entrada().getAttribute("accept")).includes("video/mp4"), true);
  await entrada().setInputFiles("/tmp/prueba-video.mp4");
  const vista = p.locator('div[role="dialog"][aria-label*="Se va a enviar"]');
  await vista.waitFor({ timeout: 10000 });
  es("pide confirmar antes de mandarlo", await vista.count(), 1);
  await vista.locator('input[placeholder*="junto al archivo"]').fill("Aquí el video del diplomado");
  await vista.locator('button:text-is("Enviar")').click();
  await p.waitForTimeout(6000);
  es("quedó guardado como video", sql(`select tipo from mensajes where conversacion_id=${conv} and direccion='saliente' order by id desc limit 1`), "video");
  es("con el pie que se escribió", sql(`select texto from mensajes where conversacion_id=${conv} and direccion='saliente' order by id desc limit 1`), "Aquí el video del diplomado");
  es("y con su tipo y nombre", sql(`select media_mime||'|'||media_nombre from mensajes where conversacion_id=${conv} and direccion='saliente' order by id desc limit 1`), "video/mp4|prueba-video.mp4");
  es("estado enviado, con el id de WhatsApp", sql(`select (estado='enviado' and wa_id is not null)::text from mensajes where conversacion_id=${conv} and direccion='saliente' order by id desc limit 1`), "true");
  es("la lista de chats dice «Aquí el video…»", sql(`select ultimo_texto from conversaciones where id=${conv}`), "Aquí el video del diplomado");
  es("y en el hilo hay un reproductor", await p.locator("main video").count() > 0, true);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/video-enviado.png` });

  const antes = mensajesSalientes();
  console.log("\n── 2. UN .MOV DE IPHONE SE RECHAZA AL ELEGIRLO ──");
  await entrada().setInputFiles("/tmp/prueba-iphone.mov");
  await p.getByText("no es un video que WhatsApp acepte").first().waitFor({ timeout: 8000 });
  es("dice que tiene que ser MP4 y cómo arreglarlo", (await p.locator("main").innerText()).includes("Más compatible"), true);
  es("no abre la vista de envío", await p.locator('div[role="dialog"][aria-label*="Se va a enviar"]').count(), 0);

  console.log("\n── 3. UN MP4 DE MÁS DE 16 MB SE RECHAZA ──");
  await entrada().setInputFiles("/tmp/prueba-grande.mp4");
  await p.getByText("deja mandar videos de hasta 16 MB").first().waitFor({ timeout: 8000 });
  es("sugiere el enlace de YouTube o Drive", (await p.locator("main").innerText()).includes("YouTube"), true);
  es("no salió nada más", mensajesSalientes(), antes);

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-video.png" }).catch(() => {});
} finally {
  await nav.close();
  sql(`delete from mensajes where conversacion_id=${conv}`);
  sql(`delete from conversaciones where id=${conv}`);
  for (const x of ["prueba-video.mp4", "prueba-iphone.mov", "prueba-grande.mp4"]) fs.rmSync(`/tmp/${x}`, { force: true });
}
console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
