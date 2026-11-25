/**
 * La proyección de la meta en el Dashboard y en el Tablero.
 *
 *     node supabase/pruebas/banco/prueba-proyeccion-meta.mjs
 *
 * Pedido el 25/11/2026 para LAC y HC. Se cargan ventas ganadas de este mes
 * (y una del mes pasado) y una meta, y se comprueba: la barra de la meta y la
 * del avance con su porcentaje, las asesoras, las semanas y los meses; que
 * Dirección cambie la meta desde el panel; que en el Tablero salga primero; y
 * que una asesora sin permiso del Tablero vea el total del equipo con sólo su
 * nombre. Al final se deja todo como estaba.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const FOTOS = process.env.FOTOS;
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const hoy = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
const mes = `${hoy.slice(0, 7)}-01`;
const mesPasado = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 15)).toISOString().slice(0, 10);
const GANADO = sql("select id from estados where nombre ilike 'ganad%' limit 1");
const DIPLOMADO = sql("select id from productos where categoria='Diplomado' order by id limit 1");
const CURSO = sql("select id from productos where categoria='Curso corto' order by id limit 1");
const ALE = 901, HURI = 902;

// Cuatro leads abiertos del banco se vuelven ventas ganadas.
const ids = sql("select string_agg(id::text, ',') from (select id from oportunidades where fecha_cierre is null order by id limit 4) x").split(",");
const respaldo = sql(`select string_agg(id||'|'||coalesce(estado_id::text,'')||'|'||coalesce(etapa_id::text,'')||'|'||coalesce(vendedor_id::text,'')||'|'||coalesce(producto_id::text,'')||'|'||coalesce(venta_cerrada::text,''), ',') from oportunidades where id in (${ids.join(",")})`);
const metaAntes = sql(`select coalesce(string_agg(mes||'|'||valor, ','), '') from tablero_metas where clave='venta_nueva'`);
const ganar = (id, vend, prod, monto, fecha) =>
  sql(`update oportunidades set estado_id=${GANADO}, vendedor_id=${vend}, producto_id=${prod}, venta_cerrada=${monto}, fecha_cierre='${fecha}' where id=${id}`);
ganar(ids[0], ALE, DIPLOMADO, 2000, hoy);
ganar(ids[1], ALE, CURSO, 250, hoy);
ganar(ids[2], HURI, DIPLOMADO, 1500, mes);
ganar(ids[3], HURI, DIPLOMADO, 3000, mesPasado);
sql("delete from tablero_metas where clave='venta_nueva'");
sql(`insert into tablero_metas (mes, clave, valor) values ('${mes}', 'venta_nueva', 10000)`);

// El banco trae corporativo cargado a mano; el panel lo suma, como el Tablero.
const corporativo = Number(sql(`select coalesce(sum(valor),0) from tablero_semanal where campo='ventas.corporativo_monto' and (semana+3) between '${mes}' and (date '${mes}' + interval '1 month - 1 day')::date`));
const total = 3750 + corporativo;
const fmt = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const conNombre = (xs) => xs.filter((x) => !/sin asesora|Resto del equipo/.test(x));

const limpiar = () => {
  for (const fila of respaldo.split(",")) {
    const [id, est, eta, ven, pro, vc] = fila.split("|");
    sql(`update oportunidades set estado_id=${est || "null"}, etapa_id=${eta || "null"}, vendedor_id=${ven || "null"}, producto_id=${pro || "null"}, venta_cerrada=${vc || "null"}, fecha_cierre=null where id=${id}`);
  }
  sql("delete from tablero_metas where clave='venta_nueva'");
  for (const x of metaAntes ? metaAntes.split(",") : []) {
    const [m, v] = x.split("|");
    sql(`insert into tablero_metas (mes, clave, valor) values ('${m}', 'venta_nueva', ${v})`);
  }
};

const galleta = (quien) => {
  const jwt = fs.readFileSync(`${BANCO}/jwt-${quien}.txt`, "utf8").trim();
  const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
  return "base64-" + Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: sub, email: `${quien}@lac.test` },
  })).toString("base64");
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
async function abrir(quien, mod) {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta(quien), domain: "127.0.0.1", path: "/" }]);
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=${encodeURIComponent(mod)}`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();
  await p.locator("[data-proyeccion]").first().waitFor({ timeout: 20000 });
  return p;
}

try {
  console.log("── 1. DASHBOARD, COMO DIRECCIÓN ──");
  let p = await abrir("jefa", "Dashboard");
  const panel = p.locator("[data-proyeccion]").first();
  es("barra de la meta con $10,000", /\$10,000/.test(await panel.locator("[data-barra-meta]").innerText()), true);
  es(`vendido ${fmt(total)} = ${Math.round(total / 100)} % de la meta`, (await panel.locator("[data-barra-avance]").innerText()).includes(fmt(total)) &&
    (await panel.locator("[data-porcentaje]").innerText()).includes(`${Math.round(total / 100)} % de la meta`), true);
  es("las dos asesoras, de mayor a menor", conNombre(await panel.locator("[data-asesora]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-asesora")))), ["Ale Prueba", "Huri Prueba"]);
  es("semanas del mes que suman lo vendido", await panel.locator("[data-semanas] > div").count() >= 4, true);
  es("seis meses, con la venta del mes pasado", await panel.locator("[data-meses] > div").count() === 6 && /\$3,000/.test(await panel.locator("[data-meses]").innerText()), true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/proyeccion-1-dashboard.png`, fullPage: false });

  console.log("\n── 2. DIRECCIÓN CAMBIA LA META ──");
  await panel.locator("[data-cambiar-meta]").click();
  await panel.locator("[data-meta-input]").fill("15000");
  await panel.locator("[data-meta-guardar]").click();
  await p.waitForFunction(() => /\$15,000/.test(document.querySelector("[data-barra-meta]")?.textContent ?? ""), null, { timeout: 15000 });
  es("quedó guardada en la base", sql(`select valor::int from tablero_metas where clave='venta_nueva' and mes='${mes}'`), "15000");
  es(`y el porcentaje se recalcula (${Math.round(total / 150)} %)`, (await panel.locator("[data-porcentaje]").innerText()).includes(`${Math.round(total / 150)} % de la meta`), true);
  await p.context().close();

  console.log("\n── 3. EN EL TABLERO, PRIMERO ──");
  p = await abrir("jefa", "Tablero Comercial");
  const primero = await p.evaluate(() => {
    const t = document.querySelector("[data-tablero-comercial]");
    const panel = t?.querySelector("[data-proyeccion]");
    const nav = t?.querySelector('nav[aria-label="Hojas del Tablero"]');
    return !!panel && !!nav && !!(panel.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  es("el panel va antes de las hojas", primero, true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/proyeccion-2-tablero.png`, fullPage: false });
  await p.context().close();

  console.log("\n── 4. UNA ASESORA SIN PERMISO DEL TABLERO ──");
  const veTablero = sql("select coalesce(bool_or(p.ver), false) from rol_permisos p join usuarios u on u.rol_id=p.rol_id where u.id='11111111-0000-0000-0000-000000000001' and p.modulo='tablero'");
  p = await abrir("ale", "Dashboard");
  const suyo = p.locator("[data-proyeccion]").first();
  es("ve el total del equipo", (await suyo.locator("[data-barra-avance]").innerText()).includes(fmt(total)), true);
  const filas = await suyo.locator("[data-asesora]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-asesora")));
  if (veTablero === "t") es("con permiso del Tablero ve a todas", conNombre(filas), ["Ale Prueba", "Huri Prueba"]);
  else es("sin permiso ve su nombre y «Resto del equipo»", filas, ["Ale Prueba", "Resto del equipo"]);
  es("no puede cambiar la meta", await suyo.locator("[data-cambiar-meta]").count(), 0);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/proyeccion-3-asesora.png`, fullPage: false });
  await p.context().close();

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
