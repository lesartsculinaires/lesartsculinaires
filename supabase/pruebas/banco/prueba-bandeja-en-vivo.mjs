/**
 * Un mensaje que entra con el chat abierto: aparece, y no se recarga todo.
 *
 *     node supabase/pruebas/banco/prueba-bandeja-en-vivo.mjs
 *
 * 27/10/2026: cada mensaje que entraba —y cada tilde de entregado o leído—
 * hacía que cada Inbox abierto volviera a pedir la pantalla entera (3,8 MB con
 * mil chats). Ahora se pide sólo el hilo que cambió (`hilosDeLaBandeja`).
 * Esta prueba manda un mensaje por el webhook y comprueba que:
 *   - aparece en el hilo abierto y en la fila de la lista, sin tocar nada;
 *   - la pestaña NO pidió la pantalla entera (ningún refresco RSC);
 *   - el número rojo del hilo de al lado sube igual;
 *   - abrir un chat sin leer no baja la pantalla entera.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const sufijo = String(Date.now()).slice(-6);
const A = { tel: "50377" + sufijo, nombre: "Vivo Abierta " + sufijo.slice(-3) };
const B = { tel: "50366" + sufijo, nombre: "Vivo Otra " + sufijo.slice(-3) };

const entra = async (quien, texto) => {
  const crudo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: "111" },
      contacts: [{ profile: { name: quien.nombre }, wa_id: quien.tel }],
      messages: [{ from: quien.tel, id: "wamid." + crypto.randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }],
    } }] }],
  });
  await fetch(`${APP}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex") },
    body: crudo,
  });
};

await entra(A, "Hola, quiero información");
await entra(B, "Buenas tardes");
await new Promise((r) => setTimeout(r, 1500));
const convA = sql(`select id from conversaciones where telefono='${A.tel}'`);
const convB = sql(`select id from conversaciones where telefono='${B.tel}'`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
let refrescosEnteros = 0;
let kbBajados = 0;
p.on("requestfinished", async (rq) => {
  const h = rq.headers();
  if (h["rsc"] === "1" && rq.method() === "GET") refrescosEnteros++;
  if (h["rsc"] === "1" || h["next-action"]) {
    const r = await rq.response();
    kbBajados += ((await r?.body().catch(() => null))?.length ?? 0) / 1024;
  }
});

try {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator("button.row", { hasText: A.nombre }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);

  console.log("── 1. ABRIR UN CHAT SIN LEER ──");
  refrescosEnteros = 0; kbBajados = 0;
  await p.locator("button.row", { hasText: A.nombre }).first().click();
  await p.getByText("Hola, quiero información").first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(2500);
  es("no pidió la pantalla entera", refrescosEnteros, 0);
  es("y bajó menos de 50 KB", kbBajados < 50, true);
  es("quedó leído en la base", sql(`select sin_leer from conversaciones where id=${convA}`), "0");

  console.log("\n── 2. ENTRA UN MENSAJE CON EL CHAT ABIERTO ──");
  refrescosEnteros = 0; kbBajados = 0;
  const TEXTO = "¿Y los horarios de la tarde? " + sufijo;
  await entra(A, TEXTO);
  await p.locator("main").getByText(TEXTO).first().waitFor({ timeout: 15000 });
  es("aparece en el hilo abierto, sin tocar nada", true, true);
  await p.waitForTimeout(2000);
  es("sin pedir la pantalla entera", refrescosEnteros, 0);
  console.log(`   (bajó ${kbBajados.toFixed(1)} KB)`);

  console.log("\n── 3. ENTRA UNO EN OTRO CHAT ──");
  refrescosEnteros = 0;
  await entra(B, "Me interesa el diplomado " + sufijo);
  await p.waitForTimeout(4000);
  const filaB = (await p.locator("main div", { has: p.locator(`button.row:has-text("${B.nombre}")`) }).last().innerText()).replace(/\s+/g, " ");
  es("la fila del otro muestra el mensaje nuevo", filaB.includes("Me interesa el diplomado " + sufijo), true);
  es("y su número sin leer", /\b2\b/.test(filaB), true);
  es("sin pedir la pantalla entera", refrescosEnteros, 0);

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-en-vivo.png" }).catch(() => {});
} finally {
  await nav.close();
  for (const c of [convA, convB]) if (c) { sql(`delete from mensajes where conversacion_id=${c}`); sql(`delete from conversaciones where id=${c}`); }
}
console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
