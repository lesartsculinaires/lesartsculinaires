/**
 * Cuánto pesa y cuánto traba el CRM, pantalla por pantalla.
 *
 *     node supabase/pruebas/banco/medir-fluidez.mjs
 *
 * Pedido el 27/10/2026: «mayor rapidez y fluidez en la interfaz para el equipo
 * de ventas», con más gente y más funciones por venir. Mide, con el volumen
 * que haya en el banco (para el de producción, sembrar antes `volumen.sql`),
 * para Dashboard, Inbox, Clientes y Pipeline:
 *
 *   ENTRAR      cuánto tarda en estar la pantalla dibujada.
 *   REFRESCAR   lo que pasa cada vez que cambia algo en el CRM (un mensaje que
 *               entra, un lead que se mueve): cuántos KB baja la pestaña,
 *               cuánto tarda, y cuánto tiempo queda trabado el navegador
 *               (tareas largas) mientras lo redibuja. Es lo que se siente como
 *               «se pega» mientras se trabaja.
 *
 * No es una prueba que pase o falle: imprime números para comparar antes y
 * después de un cambio.
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const PANTALLAS = (process.env.PANTALLAS ?? "Dashboard,Inbox,Clientes,Pipeline").split(",");
const VUELTAS = Number(process.env.VUELTAS ?? 4);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const fila = [];
for (const mod of PANTALLAS) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: mod, domain: "127.0.0.1", path: "/" }]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
    window.__largas = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__largas += e.duration; }).observe({ type: "longtask", buffered: true });
  }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const p = await ctx.newPage();

  const t0 = Date.now();
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator("main").first().waitFor();
  const entrar = Date.now() - t0;
  const largasEntrar = await p.evaluate(() => window.__largas);

  // Cada refresco: lo que dispara un cambio de otra persona. Se usa el botón
  // «Actualizar» del encabezado, que hace lo mismo que el aviso en vivo.
  let kb = 0, ms = 0, trabado = 0;
  for (let i = 0; i < VUELTAS; i++) {
    await p.waitForTimeout(1200);
    await p.evaluate(() => { window.__largas = 0; });
    const espera = p.waitForResponse((r) => r.request().method() === "GET" && r.request().headers()["rsc"] === "1", { timeout: 60000 });
    const a = Date.now();
    await p.getByRole("button", { name: /^Actualizar$/ }).first().click();
    const r = await espera;
    const cuerpo = await r.body().catch(() => Buffer.alloc(0));
    await p.waitForTimeout(300);
    await p.waitForLoadState("networkidle");
    ms += Date.now() - a;
    kb += cuerpo.length / 1024;
    trabado += await p.evaluate(() => window.__largas);
  }
  fila.push({ pantalla: mod, entrar_ms: entrar, trabado_al_entrar_ms: Math.round(largasEntrar), refresco_kb: Math.round(kb / VUELTAS), refresco_ms: Math.round(ms / VUELTAS), trabado_por_refresco_ms: Math.round(trabado / VUELTAS) });
  await ctx.close();
}
await nav.close();
console.table(fila);
