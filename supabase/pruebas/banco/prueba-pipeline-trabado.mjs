/**
 * ¿El Pipeline puede quedarse en «Cargando…» para siempre?
 *
 *     node supabase/pruebas/banco/prueba-pipeline-trabado.mjs
 *
 * Lo que vio Estefany el 12 de octubre de 2026 a las 16:10: la cabecera del
 * Pipeline con sus 2664 oportunidades, y abajo «Cargando…» que no se iba, con
 * la base sana y sin ningún error anotado.
 *
 * El Pipeline necesita un conjunto que no viaja con la portada —las bases— y
 * lo pide aparte al abrirse. Si mientras viene llega un refresco en vivo
 * (alguien movió un lead), el pedido que estaba en camino se descartaba, y el
 * nuevo no salía porque «ya se estaba pidiendo eso». Nadie lo volvía a pedir:
 * «Cargando…» hasta recargar la página.
 *
 * Lo que se exige:
 *   1. Abierto el Pipeline, con la base lenta y un refresco en el medio, el
 *      tablero aparece igual.
 *   2. Si el pedido falla (se cortó la red), no queda «Cargando…» callado: se
 *      dice que falló y se vuelve a intentar.
 *   3. Si la pestaña es de antes de un despliegue y el servidor ya no conoce
 *      la acción, se recarga la página sola (una vez), que es lo único que
 *      lo arregla.
 */
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const PROXY = "http://127.0.0.1:3141";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};
const espera = (ms) => new Promise((s) => setTimeout(s, ms));
const lentitud = (ms) => fetch(`${PROXY}/__lento?ms=${ms}`, { method: "POST" });

execSync(`pkill -f "node realtime[.]js" || true`, { cwd: BANCO });
await espera(500);
const rt = spawn("node", ["realtime.js"], { cwd: BANCO, stdio: ["pipe", "ignore", "inherit"] });
const avisar = async (tabla, tipo) => {
  rt.stdin.write(`${tabla} ${tipo}\n`);
  await espera(200);
};
await espera(1000);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function pestaña(mod) {
  const ctx = await nav.newContext({ viewport: { width: 1300, height: 850 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: encodeURIComponent(mod), domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await espera(1500);
  return { p, ctx };
}
const trabado = (p) => p.locator("main p", { hasText: /^Cargando…$/ }).count();

try {
  // ══════════════════════════════════════════════════════════════════════════
  console.log("── 1. UN REFRESCO MIENTRAS EL PIPELINE PIDE LO SUYO ──");
  // ══════════════════════════════════════════════════════════════════════════
  for (let vuelta = 1; vuelta <= 3; vuelta++) {
    const { p, ctx } = await pestaña("Dashboard");
    await lentitud(2500);
    await p.locator('aside button[data-mod="Pipeline"]').click();
    await espera(300);
    await avisar("oportunidades", "UPDATE");
    await espera(9000);
    await lentitud(0);
    await espera(8000);
    es(`vuelta ${vuelta}: el tablero aparece (no queda «Cargando…»)`, await trabado(p), 0);
    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EL PEDIDO SE CORTA ──");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { p, ctx } = await pestaña("Dashboard");
    let cortados = 0;
    await p.route("**/*", (r) => {
      const h = r.request().headers();
      if (r.request().method() === "POST" && h["next-action"] && cortados < 1) {
        cortados++;
        return r.abort("connectionreset");
      }
      return r.continue();
    });
    await p.locator('aside button[data-mod="Pipeline"]').click();
    await espera(12000);
    es("se cortó un pedido", cortados, 1);
    es("Y AUN ASÍ EL TABLERO APARECE (se reintentó)", await trabado(p), 0);
    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. LA PESTAÑA ES DE ANTES DE UN DESPLIEGUE ──");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const { p, ctx } = await pestaña("Dashboard");
    let negadas = 0;
    let cargas = 0;
    p.on("load", () => cargas++);
    // Lo que contesta Next cuando la acción no existe en el servidor nuevo.
    await p.route("**/*", (r) => {
      if (r.request().method() === "POST" && r.request().headers()["next-action"] && negadas < 1) {
        negadas++;
        return r.fulfill({
          status: 404,
          headers: { "content-type": "text/plain", "x-nextjs-action-not-found": "1" },
          body: "Server action not found.",
        });
      }
      return r.continue();
    });
    await p.locator('aside button[data-mod="Pipeline"]').click();
    await espera(10000);
    es("el servidor negó la acción", negadas, 1);
    es("LA PÁGINA SE RECARGÓ SOLA", cargas >= 1, true);
    es("y quedó en el Pipeline, con el tablero", await trabado(p), 0);
    es("en la pantalla correcta", (await p.locator("main h1").first().innerText()).trim(), "Pipeline");
    await ctx.close();
  }
} finally {
  await lentitud(0).catch(() => {});
  await nav.close();
  rt.kill();
  spawn("node", ["realtime.js"], { cwd: BANCO, stdio: "ignore", detached: true }).unref();
}

console.log(f ? `\n${f} fallaron.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
