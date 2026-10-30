/**
 * Los números de Envíos cuentan a TODOS los destinatarios, y la lista de
 * quiénes contestaron dice nombres de verdad (30/10/2026).
 *
 *     node supabase/pruebas/banco/prueba-envios-completos.mjs
 *
 * El servidor corta cada respuesta en mil filas. Con 1.251 destinatarios
 * entre los últimos envíos, el masivo «Le Petit» decía 6 destinatarios y
 * tenía 59, y en «Contestaron» salía un «.»: el nombre de perfil de WhatsApp
 * de alguien, en vez del de su ficha.
 *
 *   1. Un envío de 1.200 personas dice 1200 destinatarios y 40 contestaron.
 *   2. El envío viejo, que quedaba detrás de la fila mil, dice lo suyo.
 *   3. Quien se puso «.» en WhatsApp aparece con el nombre de su ficha.
 *   4. Quien no tiene ficha ni nombre con letras aparece con su número.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const GRANDE = "Completo prueba grande";
const VIEJO = "Completo prueba viejo";
const limpiar = () => {
  sql("delete from envio_destinatarios where envio_id in (select id from envios where nombre like 'Completo prueba%')");
  sql("delete from envios where nombre like 'Completo prueba%'");
  sql("delete from clientes where correo like 'completo%@prueba.test'");
};

limpiar();
// 1.200 fichas: el destinatario siempre tiene una. La 1 se llama «Lucía Ramos»
// en el CRM y «.» en WhatsApp; la 2 no tiene letras en ningún lado.
sql("insert into clientes (nombre, telefono, correo) select case g when 1 then 'Lucía Ramos' when 2 then '🙏🏻' else 'Persona ' || g end, '5037' || lpad(g::text, 7, '0'), 'completo' || g || '@prueba.test' from generate_series(1, 1200) g");
const viejo = sql(`insert into envios (nombre, estado, creado_en, terminado_en) values ('${VIEJO}', 'terminado', now() - interval '2 days', now() - interval '2 days') returning id`);
const grande = sql(`insert into envios (nombre, estado, creado_en, terminado_en) values ('${GRANDE}', 'terminado', now(), now()) returning id`);
// El viejo primero: sus filas tienen los id más bajos. Tres personas, una contestó.
sql(`insert into envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado) select ${viejo}, c.id, c.telefono, c.nombre, case c.telefono when '50370000010' then 'respondio' when '50370000011' then 'leido' else 'entregado' end from clientes c where c.telefono in ('50370000010', '50370000011', '50370000012')`);
// El grande: 1.200, de los que 40 contestaron.
sql(`insert into envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado) select ${grande}, c.id, c.telefono, case c.telefono when '50370000001' then '.' else c.nombre end, case when right(c.telefono, 7)::int <= 40 then 'respondio' when right(c.telefono, 7)::int <= 600 then 'leido' else 'entregado' end from clientes c where c.correo like 'completo%@prueba.test'`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
// El navegador en El Salvador y el servidor en UTC, como Netlify: así se ve
// si la hora de las tarjetas sale igual en los dos lados.
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: "America/El_Salvador" });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: encodeURIComponent("Envíos"), domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

const numeros = async (nombre) => {
  const t = (await p.getByRole("button", { name: new RegExp(nombre) }).first().innerText()).replace(/\s+/g, " ");
  return { destinatarios: Number(t.match(/(\d+) destinatarios/)?.[1]), contestaron: Number(t.match(/(\d+) contestaron/)?.[1]) };
};

try {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: new RegExp(GRANDE) }).first().waitFor({ timeout: 20000 });

  console.log("── 1. el envío grande ──");
  es("cuenta a los 1.200", await numeros(GRANDE), { destinatarios: 1200, contestaron: 40 });

  console.log("\n── 2. el viejo ──");
  es("dice lo suyo", await numeros(VIEJO), { destinatarios: 3, contestaron: 1 });

  console.log("\n── 3 y 4. quiénes contestaron ──");
  // El más nuevo ya abre desplegado; tocarlo lo plegaría.
  await p.waitForTimeout(1500);
  if ((await p.locator("[data-contestaron]").count()) === 0) {
    await p.getByRole("button", { name: new RegExp(GRANDE) }).first().click();
    await p.waitForTimeout(800);
  }
  const pastillas = await p.locator("[data-contestaron] .pill").allInnerTexts();
  es("son 40", pastillas.length, 40);
  es("el «.» con ficha sale con el nombre de la ficha", pastillas.includes("Lucía Ramos"), true);
  es("el «🙏🏻» sin ficha sale con su número", pastillas.includes("+50370000002"), true);
  es("ninguna pastilla sin letras ni número", pastillas.filter((x) => !/[\p{L}\d]/u.test(x)), []);
  if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/envios-completos.png` });

  // Incluye el #418: la hora de la tarjeta escrita distinto en el servidor y
  // en el navegador.
  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  if (!process.env.DEJAR) limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
