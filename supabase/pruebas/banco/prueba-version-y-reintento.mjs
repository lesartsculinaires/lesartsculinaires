/**
 * Los tres errores que vio ventas el 14 y el 15 de octubre de 2026.
 *
 *     node supabase/pruebas/banco/prueba-version-y-reintento.mjs
 *
 *   «(#131000) Something went wrong»   Meta falló de su lado; seis minutos
 *                                      después el mismo texto salió. Ahora el
 *                                      CRM reintenta solo, y si Meta sigue
 *                                      fallando lo dice en castellano y el
 *                                      texto queda en la caja.
 *
 *   «Server Action … was not found»    La pestaña era de antes de un
 *   (dos veces)                        despliegue. Ahora: aviso de versión
 *                                      nueva, el borrador sobrevive a la
 *                                      recarga, y si igual pasa, el mensaje
 *                                      dice qué hacer y ofrece recargar.
 *
 * Que los números de las acciones no cambien entre compilaciones se comprobó
 * aparte, compilando dos veces (ver el commit).
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" })
    .split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ── un hilo al que contestar, entrando por el webhook ──
const TEL = "50378" + String(Date.now()).slice(-6);
const NOMBRE = "Prueba Version " + String(Date.now()).slice(-4);
const crudo = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "222", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "111" },
    contacts: [{ profile: { name: NOMBRE }, wa_id: TEL }],
    messages: [{ from: TEL, id: "wamid." + crypto.randomUUID(),
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hola" } }],
  } }] }],
});
await fetch(`${APP}/api/whatsapp/webhook`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex"),
  },
  body: crudo,
});
await new Promise((s) => setTimeout(s, 1000));
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
if (!conv) {
  console.log("✗ no se pudo sembrar el hilo");
  process.exit(1);
}

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
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
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const caja = () => p.locator("main textarea").first();
const enBase = (texto) =>
  Number(sql(`select count(*) from mensajes where conversacion_id=${conv} and direccion='saliente' and texto='${texto}' and estado is distinct from 'failed'`));

try {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("button.row", { hasText: NOMBRE }).first().click();
  await caja().waitFor({ state: "visible", timeout: 15000 });

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. «(#131000) Something went wrong»: se reintenta solo ──");
  // ══════════════════════════════════════════════════════════════════════
  const PASAJERA = "Recibido, muchas gracias [falla:2]";
  await caja().fill(PASAJERA);
  await caja().press("Enter");
  await p.waitForFunction(() => (document.querySelector("main textarea")?.value ?? "x") === "", null, { timeout: 15000 });
  await p.waitForTimeout(5000);
  es("Meta falló dos veces y a la tercera salió: queda UN mensaje enviado", enBase(PASAJERA), 1);
  es("sin ningún aviso de error", await p.getByText("Something went wrong").count(), 0);

  const TERCA = "Este no sale [falla:9]";
  await caja().fill(TERCA);
  await caja().press("Enter");
  await p.getByText("WhatsApp tuvo una falla de su lado").first().waitFor({ timeout: 20000 });
  es("si Meta sigue fallando, lo dice en castellano", true, true);
  es("y el texto vuelve a la caja para mandarlo de nuevo", await caja().inputValue(), TERCA);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EL BORRADOR SOBREVIVE A UNA RECARGA ──");
  // ══════════════════════════════════════════════════════════════════════
  const BORRADOR = "Te comparto el pensum del diplomado";
  await caja().fill(BORRADOR);
  await p.waitForTimeout(300);
  await p.reload({ waitUntil: "networkidle" });
  await caja().waitFor({ state: "visible", timeout: 15000 });
  await p.waitForTimeout(1000);
  es("vuelve al mismo chat", (await p.locator("main").innerText()).includes(NOMBRE), true);
  es("con el texto que estaba escribiendo", await caja().inputValue(), BORRADOR);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. UNA PESTAÑA DE UNA VERSIÓN ANTERIOR ──");
  // ══════════════════════════════════════════════════════════════════════
  const version = await p.evaluate(async () => (await (await fetch("/api/version")).json()).version);
  es("el servidor dice qué versión está publicada", typeof version === "string" && version.length > 0 && version !== "desarrollo", true);

  // Se publica «otra» versión: la pestaña se entera al volver a ella.
  await p.route("**/api/version", (r) => r.fulfill({ json: { version: "otra-version" } }));
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.locator("[data-version-nueva]").waitFor({ timeout: 10000 });
  es("aparece el aviso de versión nueva, con su botón", (await p.locator("[data-version-nueva]").innerText()).includes("Recargar"), true);
  await p.unroute("**/api/version");

  // Y si igual se manda algo con un número de acción que el servidor ya no
  // conoce —lo que pasó de verdad—, el mensaje dice qué hacer.
  await p.route("**/*", (r) => {
    const h = r.request().headers();
    if (r.request().method() === "POST" && h["next-action"]) {
      return r.continue({ headers: { ...h, "next-action": "00".repeat(21) } });
    }
    return r.continue();
  });
  const VIEJA = "Mensaje desde una pestaña vieja";
  await caja().fill(VIEJA);
  await caja().press("Enter");
  await p.getByText("El CRM se actualizó").first().waitFor({ timeout: 20000 });
  const aviso = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  es("dice que el CRM se actualizó, en castellano", aviso.includes("El CRM se actualizó"), true);
  es("y no el error en inglés", aviso.includes("was not found on the server"), false);
  es("el texto no se pierde", await caja().inputValue(), VIEJA);
  await p.unroute("**/*");

  es("sin errores en la página", errores.filter((e) => !/Server Action|not found/i.test(e)), []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-version.png" }).catch(() => {});
} finally {
  await nav.close();
  sql(`delete from mensajes where conversacion_id=${conv}`);
  sql(`delete from conversaciones where id=${conv}`);
}

console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
