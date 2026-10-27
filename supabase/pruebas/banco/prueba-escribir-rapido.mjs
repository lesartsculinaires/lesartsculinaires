/**
 * ¿Cuánto tarda en aparecer lo que se escribe en el chat, con mil chats?
 *
 *     node supabase/pruebas/banco/prueba-escribir-rapido.mjs
 *
 * El 27/10/2026 ventas avisó que al escribir en el chat de WhatsApp las letras
 * tardaban en aparecer. La lista de chats se volvía a dibujar entera con cada
 * tecla, y Alexandra tiene 995. Esta prueba siembra 1.000 chats, abre uno,
 * escribe 40 letras y mide, por tecla, cuánto pasa desde que se aprieta hasta
 * que el navegador pinta. Con la lista guardada (`filasDeLaLista`) tiene que
 * quedar por debajo de lo que se nota.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).trim();

const N = Number(process.env.CHATS ?? 1000);
const TOPE_MS = Number(process.env.TOPE_MS ?? 50);
sql("delete from mensajes where conversacion_id in (select id from conversaciones where identificador like 'rapido-%')");
sql("delete from conversaciones where identificador like 'rapido-%'");
sql(`insert into conversaciones (identificador, telefono, canal, vendedor_id, ultimo_mensaje_en, ultimo_texto) select 'rapido-' || g, '5037' || lpad(g::text, 7, '0'), 'whatsapp', 901, now() - (g || ' minutes')::interval, 'Hola, quiero información del diplomado ' || g from generate_series(1, ${N}) g`);
sql("insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) select id, 'entrante', 'text', ultimo_texto, ultimo_mensaje_en from conversaciones where identificador like 'rapido-%'");

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
let f = 0;
try {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator("button.row").first().waitFor({ timeout: 30000 });
  const filas = await p.locator("button.row").count();
  console.log(`filas dibujadas en la lista: ${filas}`);
  await p.locator("button.row").first().click();
  const caja = p.locator("main textarea").first();
  await caja.waitFor({ timeout: 15000 });
  await caja.click();
  await p.evaluate(() => {
    const ta = document.querySelector("main textarea");
    window.__tiempos = [];
    ta.addEventListener("keydown", () => {
      const t0 = performance.now();
      requestAnimationFrame(() => setTimeout(() => window.__tiempos.push(performance.now() - t0), 0));
    }, true);
  });
  for (const letra of "Con gusto te comparto la informacion del!") {
    await p.keyboard.type(letra);
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => window.__tiempos);
  t.sort((a, b) => a - b);
  const prom = t.reduce((a, b) => a + b, 0) / t.length;
  const p90 = t[Math.floor(t.length * 0.9)];
  console.log(`por tecla: promedio ${prom.toFixed(1)} ms · p90 ${p90.toFixed(1)} ms · máx ${t[t.length - 1].toFixed(1)} ms`);
  if (p90 > TOPE_MS) { f++; console.log(`✗ p90 por encima de ${TOPE_MS} ms`); } else console.log(`✓ p90 por debajo de ${TOPE_MS} ms`);
} catch (e) {
  f++; console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  sql("delete from mensajes where conversacion_id in (select id from conversaciones where identificador like 'rapido-%')");
  sql("delete from conversaciones where identificador like 'rapido-%'");
}
process.exit(f ? 1 : 0);
