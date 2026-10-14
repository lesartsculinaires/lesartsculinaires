/**
 * ¿Un lead que entró el mes pasado y se ganó este mes cuenta en este mes?
 *
 *     node supabase/pruebas/banco/prueba-ganados-del-mes.mjs
 *
 * El 14 de octubre de 2026 el tablero de octubre mostraba 4 ganados de
 * Alexandra cuando había cerrado 8: contaba cada ganado en el mes en que había
 * ENTRADO el lead. Ahora cuenta en el mes en que se cerró la venta. Se mira en
 * la pantalla —la tarjeta «Ganados» de Evolución y la tasa de cierre— y se
 * compara contra la base.
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

// Un lead que entró el mes pasado y se gana hoy.
const id = sql("select min(o.id) from oportunidades o join estados s on s.id=o.estado_id where not s.es_final");
const antes = sql(`select etapa_id||':'||estado_id||':'||fecha_registro||':'||coalesce(fecha_cierre::text,'') from oportunidades where id=${id}`);
const restaurar = () => {
  const [et, st, reg, cie] = antes.split(":");
  sql(`update oportunidades set etapa_id=${et}, estado_id=${st}, fecha_registro='${reg}', fecha_cierre=${cie ? `'${cie}'` : "null"} where id=${id}`);
};
sql(`update oportunidades set fecha_registro = (date_trunc('month', current_date) - interval '10 days')::date where id=${id}`);
sql(`update oportunidades set etapa_id=(select id from etapas where nombre='Ganado'), fecha_cierre=current_date where id=${id}`);

const enLaBase = (cond) => Number(sql(`select count(*) from oportunidades o join estados s on s.id=o.estado_id where s.nombre='Ganado' and ${cond}`));
const ganadosEsteMes = enLaBase("date_trunc('month', coalesce(o.fecha_cierre, o.fecha_registro)) = date_trunc('month', current_date)");
const leadsEsteMes = Number(sql("select count(*) from oportunidades where date_trunc('month', fecha_registro) = date_trunc('month', current_date)"));
const ganadosPorRegistro = enLaBase("date_trunc('month', o.fecha_registro) = date_trunc('month', current_date)");
console.log(`   (en la base: ${ganadosEsteMes} ganados cerrados este mes; por registro serían ${ganadosPorRegistro}; ${leadsEsteMes} leads entraron este mes)`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
  })).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  const ctx = await nav.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Dashboard", domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);

  const texto = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  const m = texto.match(/Ganados (\d+)/);
  es("LA TARJETA «GANADOS» CUENTA LOS CERRADOS ESTE MES", m ? Number(m[1]) : null, ganadosEsteMes);
  es("y no los registrados este mes", ganadosEsteMes !== ganadosPorRegistro, true);

  const tasa = (await p.locator('[data-kpi="Tasa de cierre"] [data-valor]').first().innerText()).trim();
  es("la tasa de cierre usa esos ganados", tasa,
    leadsEsteMes ? `${Math.round((ganadosEsteMes / leadsEsteMes) * 100)}%` : "—");
  es("la nota dice cómo se cuenta", /ganados por mes de cierre/.test(texto), true);
  es("sin errores en pantalla", errores, []);
} finally {
  restaurar();
  await nav.close();
}

console.log(f ? `\n${f} fallaron.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
