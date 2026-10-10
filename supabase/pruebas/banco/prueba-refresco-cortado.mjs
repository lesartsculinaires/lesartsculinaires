/**
 * Un refresco que llega cortado, ¿deja la pantalla blanca?
 *
 *     node supabase/pruebas/banco/prueba-refresco-cortado.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * El 10 de octubre de 2026 el equipo vio esto en lugar del CRM:
 *
 *     Application error: a client-side exception has occurred while loading
 *     crm-les-arts.netlify.app (see the browser console for more information).
 *
 * Y se quedaba ahí hasta que alguien apretaba F5.
 *
 * El CRM se refresca solo —cada minuto y con cada cambio de otra persona— y
 * cada refresco es una respuesta que llega de a pedazos mientras el servidor
 * junta los datos. Netlify corta toda respuesta a los sesenta segundos, y esa
 * mañana, entre las 10:32 y las 10:42, la base tardaba de tres a siete segundos
 * por consulta: la portada encadenaba nueve. Medido en el banco con los 2600
 * leads de producción y cuatro segundos por consulta: 69 s antes, 21 s ahora.
 *
 * Esta prueba pone delante de la aplicación un proxy que corta las respuestas
 * como Netlify, pero a los seis segundos en vez de sesenta, y una base lenta
 * para que el refresco no llegue a terminar. Es la misma pantalla blanca, con
 * «network error» en la consola: también es lo que pasa si la red de la oficina
 * parpadea a mitad de un refresco.
 *
 * ============================================================================
 * LO QUE SE EXIGE
 * ============================================================================
 *
 *   NO QUEDA EN BLANCO   Nunca «Application error».
 *   SE RECUPERA SOLA     Cuando la base vuelve, el CRM vuelve sin tocar nada.
 *   QUEDA ANOTADO        El error queda en `errores_cliente`, con la pantalla
 *                        en la que pasó.
 *
 * Para correrla contra otra versión: APP_PUERTO=3146.
 */
import http from "node:http";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const PUERTO_APP = Number(process.env.APP_PUERTO ?? 3142);
const PUERTO_CORTE = 3145;
const LIMITE = 6000;
const LENTO = 2500;

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" })
    .split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
const lentitud = (ms) => fetch(`http://127.0.0.1:3141/__lento?ms=${ms}`, { method: "POST" });

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ── el corte de Netlify, en chico ──
let cortes = 0;
const corte = http.createServer((req, res) => {
  const ida = http.request(
    { host: "127.0.0.1", port: PUERTO_APP, path: req.url, method: req.method, headers: req.headers },
    (vuelta) => {
      res.writeHead(vuelta.statusCode, vuelta.headers);
      vuelta.pipe(res);
    },
  );
  ida.on("error", () => {});
  const reloj = setTimeout(() => {
    cortes++;
    if (res.headersSent) res.socket?.destroy();
    else {
      res.writeHead(502, { "content-type": "text/html" });
      res.end("TimeoutError");
    }
    ida.destroy();
  }, LIMITE);
  res.on("close", () => clearTimeout(reloj));
  req.pipe(ida);
});
await new Promise((r) => corte.listen(PUERTO_CORTE, r));

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const tablaDeErrores = sql("select to_regclass('public.errores_cliente') is not null") === "t";
const antes = tablaDeErrores ? Number(sql("select count(*) from errores_cliente")) : 0;
const lead = sql("select id from oportunidades order by id limit 1");
const etapa = sql(`select etapa_id from oportunidades where id = ${lead}`);

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Pipeline", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript(
  (h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toISOString().slice(0, 10),
);
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const cuerpo = async () => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const enBlanco = async () => /Application error/i.test(await cuerpo());
const crmEnPie = async () => /MÓDULOS/i.test(await cuerpo()) && !(await enBlanco());

try {
  await lentitud(0);
  await p.goto(`http://127.0.0.1:${PUERTO_CORTE}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  es("el CRM cargó", await crmEnPie(), true);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 1. LA BASE SE PONE LENTA Y OTRA PERSONA MUEVE UN LEAD ──");
  // ══════════════════════════════════════════════════════════════════════════
  await lentitud(LENTO);
  sql(`update oportunidades set etapa_id = case when etapa_id = 2 then 1 else 2 end where id = ${lead}`);
  // El aviso llega, el refresco sale, y a los seis segundos se corta.
  for (let i = 0; i < 40 && cortes === 0; i++) await p.waitForTimeout(500);
  await p.waitForTimeout(1500);
  es("el refresco se cortó a la mitad (si no, la prueba no prueba nada)", cortes > 0, true);
  es("NO QUEDÓ LA PANTALLA BLANCA", await enBlanco(), false);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. LA BASE VUELVE, Y EL CRM VUELVE SOLO ──");
  // ══════════════════════════════════════════════════════════════════════════
  await lentitud(0);
  let volvio = false;
  for (let i = 0; i < 40 && !volvio; i++) {
    await p.waitForTimeout(500);
    volvio = await crmEnPie();
  }
  es("VOLVIÓ SIN TOCAR NADA", volvio, true);
  es("y no quedó en blanco por el camino", await enBlanco(), false);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. QUEDÓ ANOTADO ──");
  // ══════════════════════════════════════════════════════════════════════════
  es("existe la tabla", tablaDeErrores, true);
  if (tablaDeErrores) {
    const nuevos = Number(sql("select count(*) from errores_cliente")) - antes;
    es("QUEDÓ ANOTADO EN errores_cliente", nuevos > 0, true);
    es("con la pantalla en que pasó",
      sql("select modulo from errores_cliente order by id desc limit 1"), "Pipeline");
    console.log("   anotado:", sql("select nombre || ': ' || left(mensaje, 60) from errores_cliente order by id desc limit 1"));
  }
} finally {
  await lentitud(0).catch(() => {});
  await nav.close();
  corte.close();
  sql(`update oportunidades set etapa_id = ${etapa || "null"} where id = ${lead}`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
