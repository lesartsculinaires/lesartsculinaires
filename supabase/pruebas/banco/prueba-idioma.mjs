/**
 * El cambio de idioma castellano / inglés.
 *
 *     node supabase/pruebas/banco/prueba-idioma.mjs
 *
 * Pedido el 21/10/2026 para grabar el video de la revisión de Meta. Se
 * comprueba el recorrido que ve el revisor —entrada, menú, Inbox con un hilo
 * abierto, Canales— en inglés, que el idioma se recuerda al recargar, y que
 * se puede volver al castellano. Con `MOSTRAR=1` imprime lo que quedó en
 * castellano en cada pantalla, para completar el diccionario.
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

// Un hilo de Messenger para tener qué abrir.
const NOMBRE = "Idioma Prueba " + String(Date.now()).slice(-4);
const cliente = sql("select id from clientes order by id limit 1");
const conv = sql(`insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en, nombre_perfil) values ('psid-idioma-${Date.now()}', null, 'messenger', ${cliente}, 901, now(), '${NOMBRE}') returning id`).split("\n")[0];
sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) values (${conv}, 'entrante', 'text', 'Hola, quiero información del diplomado', now())`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

// Lo que se ve en castellano: palabras comunes que no deberían estar en inglés.
const CASTELLANO = /\b(el|la|los|las|de|del|para|con|sin|una?|que|por|más|todavía|ya|se|hay|tu|tus|nuevo|nueva|conversaci[oó]n|mensaje|cuenta|enviar|buscar|ficha|sesi[oó]n|todas?|archivad[ao]s?|pendientes?)\b/i;
const sobrante = async (nombre) => {
  const textos = await p.evaluate(() => {
    const out = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, t = (n.textContent || "").replace(/\s+/g, " ").trim();
      const el = n.parentElement;
      if (!t || !el || ["SCRIPT", "STYLE", "CODE"].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.add(t);
    }
    for (const el of document.querySelectorAll("[placeholder],[title],[aria-label]")) {
      for (const a of ["placeholder", "title", "aria-label"]) { const v = el.getAttribute(a); if (v) out.add(`[${a}] ${v}`); }
    }
    return [...out];
  });
  const raros = textos.filter((t) => CASTELLANO.test(t));
  if (process.env.MOSTRAR) { console.log(`   ── ${nombre}: ${raros.length} textos que parecen castellano`); raros.slice(0, 60).forEach((t) => console.log("     ·", t.slice(0, 120))); }
  return raros;
};

try {
  console.log("── 1. ENTRADA ──");
  await p.goto(`${APP}/login`, { waitUntil: "networkidle" });
  es("por omisión, castellano", await p.locator("html").getAttribute("lang"), "es");
  es("se ve «Iniciar sesión»", await p.getByRole("button", { name: "Iniciar sesión" }).count(), 1);
  await p.locator('[data-idioma="en"]').click();
  es("al tocar EN, la página dice «Sign in»", await p.getByRole("button", { name: "Sign in" }).count() > 0, true);
  es("y el html queda lang=en", await p.locator("html").getAttribute("lang"), "en");
  await sobrante("Entrada");

  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
  ]);

  console.log("\n── 2. EL CRM EN INGLÉS: MENÚ E INBOX ──");
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  es("el idioma se recordó (galleta)", await p.locator("html").getAttribute("lang"), "en");
  const menu = (await p.locator("nav").innerText()).replace(/\s+/g, " ");
  es("el menú está en inglés", /Broadcasts/.test(menu) && /Clients/.test(menu) && /Calendar/.test(menu), true);
  es("«Cerrar sesión» ya es «Sign out»", await p.getByRole("button", { name: "Sign out" }).count(), 1);
  es("el título de la pantalla es Inbox", await p.locator("h1").innerText(), "Inbox");
  await p.locator("button.row", { hasText: NOMBRE }).first().click();
  await p.locator("main textarea").first().waitFor({ timeout: 15000 });
  es("la caja de respuesta está en inglés", (await p.locator("main textarea").first().getAttribute("placeholder")).startsWith("Write your reply"), true);
  es("los botones del hilo", (await p.locator("main").innerText()).includes("Archive") && (await p.locator("main").innerText()).includes("View profile"), true);
  es("el mensaje del cliente no se toca", (await p.locator("main").innerText()).includes("Hola, quiero información del diplomado"), true);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/inbox-en.png` });
  await sobrante("Inbox");

  console.log("\n── 3. CANALES ──");
  await p.getByRole("button", { name: "Channels" }).click();
  await p.waitForTimeout(2500);
  es("Canales en inglés", await p.locator("h1").innerText(), "Channels");
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/canales-en.png` });
  await sobrante("Canales");

  console.log("\n── 4. VOLVER AL CASTELLANO ──");
  await p.locator('[data-idioma="es"]').click();
  await p.waitForTimeout(500);
  es("el menú vuelve a «Envíos»", (await p.locator("nav").innerText()).includes("Envíos"), true);
  es("y la galleta queda en es", (await ctx.cookies()).find((c) => c.name === "lac.idioma")?.value, "es");
  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-idioma.png" }).catch(() => {});
} finally {
  await nav.close();
  sql(`delete from mensajes where conversacion_id=${conv}`);
  sql(`delete from conversaciones where id=${conv}`);
}
console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
