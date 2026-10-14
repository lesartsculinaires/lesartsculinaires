/**
 * ¿Lo que se mueve en el Pipeline se ve en el Dashboard y en Clientes?
 *
 *     node supabase/pruebas/banco/prueba-pipeline-conectado.mjs
 *
 * Lo pidió la escuela el 14 de octubre de 2026: que lo que se cambia en el
 * Pipeline quede reflejado en los demás módulos. Se prueba como lo haría una
 * persona —arrastrando la tarjeta— y se mira en tres lugares:
 *
 *   1. El Dashboard de la MISMA pestaña, sin recargar.
 *   2. Clientes, en la misma pestaña: la fila con su etapa y su estado.
 *   3. El Dashboard de OTRA persona, que no tocó nada (el «En vivo»).
 *
 * Y las dos columnas que cierran un trato: «Ganado» y «Perdido». El Dashboard
 * cuenta ganados y perdidos por el ESTADO; el tablero los ubica por la ETAPA.
 * Si arrastrar a una columna no pone el estado, las pantallas no cuadran.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};
const espera = (ms) => new Promise((s) => setTimeout(s, ms));

// Dos leads abiertos para arrastrar, y el estado de partida para dejarlos igual.
const [X, Y] = sql(
  "select string_agg(codigo, ',' order by id) from (select o.id, o.codigo from oportunidades o join estados s on s.id=o.estado_id where not s.es_final and o.etapa_id is not null order by o.id limit 2) t",
).split(",");
const antes = sql(
  `select string_agg(codigo||':'||etapa_id||':'||estado_id, ',') from oportunidades where codigo in ('${X}','${Y}')`,
);
const restaurar = () => {
  for (const par of antes.split(",")) {
    const [c, et, st] = par.split(":");
    sql(`update oportunidades set etapa_id=${et}, estado_id=${st}, motivo_perdida_id=null where codigo='${c}'`);
  }
};
const fila = (c) => sql(`select etapa||' / '||estado from vw_pipeline where codigo='${c}'`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errores = [];

async function pestaña(mod) {
  const ctx = await nav.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: encodeURIComponent(mod), domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  return p;
}
const ir = async (p, mod) => {
  await p.locator(`aside button[data-mod="${mod}"]`).click();
  await p.waitForTimeout(1800);
};
const kpi = async (p, nombre) =>
  (await p.locator(`[data-kpi="${nombre}"] [data-valor]`).first().innerText()).trim();
const tablero = async (p) => ({
  pipeline: await kpi(p, "En pipeline"),
  tasa: await kpi(p, "Tasa de cierre"),
});
const arrastrar = async (p, codigo, etapa) => {
  await p.locator(`[data-ficha="${codigo}"]`).dragTo(p.locator(`[data-etapa="${etapa}"] > div:last-child`));
};
const enClientes = async (p, codigo) => {
  const t = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  const i = t.indexOf(codigo);
  return i < 0 ? "(no está)" : t.slice(i, i + 160);
};

try {
  const a = await pestaña("Dashboard");
  const b = await pestaña("Dashboard");
  const inicio = await tablero(a);
  console.log(`   (al empezar: en pipeline ${inicio.pipeline}, tasa de cierre ${inicio.tasa})`);
  es("las dos pestañas arrancan iguales", await tablero(b), inicio);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 1. ARRASTRAR A «GANADO» ──");
  // ══════════════════════════════════════════════════════════════════════════
  await ir(a, "Pipeline");
  await arrastrar(a, X, "Ganado");
  await a.waitForTimeout(2500);
  es("en la base quedó en Ganado y GANADO", fila(X), "Ganado / Ganado");

  await ir(a, "Dashboard");
  const trasGanar = await tablero(a);
  console.log(`   (después: en pipeline ${trasGanar.pipeline}, tasa de cierre ${trasGanar.tasa})`);
  es("EL DASHBOARD DE LA MISMA PESTAÑA LO CUENTA: uno menos en pipeline",
    Number(trasGanar.pipeline), Number(inicio.pipeline) - 1);
  es("y la tasa de cierre subió", parseInt(trasGanar.tasa) > parseInt(inicio.tasa), true);

  await ir(a, "Clientes");
  const cx = await enClientes(a, X);
  es("EN CLIENTES LA FILA DICE Ganado (etapa y estado)", (cx.match(/Ganado/g) ?? []).length >= 2, true);

  let enB = null;
  for (let i = 0; i < 20; i++) {
    await b.waitForTimeout(1000);
    enB = await tablero(b);
    if (enB.pipeline === trasGanar.pipeline) break;
  }
  es("EL DASHBOARD DE OTRA PERSONA SE ACTUALIZÓ SOLO", enB, trasGanar);

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. ARRASTRAR A «PERDIDO» ──");
  // ══════════════════════════════════════════════════════════════════════════
  await ir(a, "Pipeline");
  await arrastrar(a, Y, "Perdido");
  await a.waitForTimeout(2500);
  console.log(`   (en la base: ${fila(Y)})`);
  es("EN LA BASE QUEDÓ EN Perdido y PERDIDO", fila(Y), "Perdido / Perdido");

  await ir(a, "Dashboard");
  const trasPerder = await tablero(a);
  console.log(`   (después: en pipeline ${trasPerder.pipeline}, tasa de cierre ${trasPerder.tasa})`);
  es("EL DASHBOARD YA NO LO CUENTA EN PIPELINE",
    Number(trasPerder.pipeline), Number(trasGanar.pipeline) - 1);

  await ir(a, "Clientes");
  const cy = await enClientes(a, Y);
  es("EN CLIENTES LA FILA DICE Perdido (etapa y estado)", (cy.match(/Perdido/g) ?? []).length >= 2, true);

  es("sin errores en pantalla", errores, []);
} finally {
  restaurar();
  await nav.close();
}

console.log(f ? `\n${f} fallaron.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
