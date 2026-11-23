/**
 * Sacar a alguien de ventas desde «Usuarios y Roles» pregunta qué pasa con
 * sus leads: pasarlos a una persona o repartirlos al azar.
 *
 *     node supabase/pruebas/banco/prueba-reasignar-al-salir.mjs
 *
 * Pedido el 23/11/2026 para las dos marcas. Se le cambia el rol a Ale (que
 * recibe leads) por uno que no recibe, se reparte al azar, se cambia el rol,
 * y se comprueba en la base que sus leads abiertos quedaron con otra persona,
 * los cerrados con ella, el rol cambiado y su ficha dada de baja. Al final se
 * deja todo como estaba.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
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

const ALE = 901;
const HURI = 902;
const ALE_USUARIO = "11111111-0000-0000-0000-000000000001";
const jwt = (q) => fs.readFileSync(`${BANCO}/jwt-${q}.txt`, "utf8").trim();

const respaldoLeads = sql("select string_agg(id||':'||coalesce(vendedor_id::text,''), ',') from oportunidades");
const respaldoChats = sql("select string_agg(id||':'||coalesce(vendedor_id::text,''), ',') from conversaciones");
const rolAle = sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`);
const rolSinLeads = sql("select id from roles where not recibe_leads and not es_admin order by id limit 1");
const nombreRol = sql(`select nombre from roles where id=${rolSinLeads}`);
const abiertosAntes = Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is null`));
const cerradosAntes = Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is not null`));

const limpiar = () => {
  for (const par of respaldoLeads.split(",")) {
    const [id, v] = par.split(":");
    sql(`update oportunidades set vendedor_id=${v || "null"} where id=${id}`);
  }
  for (const par of respaldoChats.split(",")) {
    const [id, v] = par.split(":");
    sql(`update conversaciones set vendedor_id=${v || "null"} where id=${id}`);
  }
  sql(`update usuarios set rol_id=${rolAle} where id='${ALE_USUARIO}'`);
  sql(`update vendedores set activo=true where id=${ALE}`);
};

const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt("jefa"), token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];

try {
  es("Ale empieza con leads abiertos", abiertosAntes > 0, true);

  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Usuarios y Roles", domain: "127.0.0.1", path: "/" },
  ]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=${encodeURIComponent("Usuarios y Roles")}`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();

  console.log("── 1. CAMBIARLE EL ROL A UNO QUE NO RECIBE LEADS ABRE LA VENTANA ──");
  const fila = p.locator("tr", { hasText: "ale@lac.test" });
  await fila.locator("select").first().selectOption(rolSinLeads);
  const ventana = p.getByRole("dialog", { name: /Reasignar la cartera de Ale Prueba/ });
  await ventana.waitFor({ timeout: 15000 });
  es("todavía no cambió el rol", sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`), rolAle);
  await ventana.locator("[data-cartera]").waitFor({ timeout: 15000 });
  es("muestra sus leads abiertos", new RegExp(`${abiertosAntes} leads? abiertos?`).test(await ventana.locator("[data-cartera]").innerText()), true);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/reasignar-1-ventana.png` });

  console.log("\n── 2. AL AZAR ──");
  await ventana.locator('[data-modo="azar"]').click();
  es("ofrece repartir entre quienes reciben leads (Huri)", await ventana.locator(`[data-entre="${HURI}"]`).count(), 1);
  es("y no ofrece a la misma Ale", await ventana.locator(`[data-entre="${ALE}"]`).count(), 0);
  es("dice cuánto le toca a cada una", /le tocan/.test(await ventana.locator("[data-por-cabeza]").innerText()), true);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/reasignar-2-azar.png` });
  await ventana.getByRole("button", { name: "Asignar aleatoriamente" }).click();
  await ventana.locator("[data-traspaso-listo]").waitFor({ timeout: 15000 });
  es("avisa lo que se repartió", /Se repartieron \d+ leads? abiertos?/.test(await ventana.locator("[data-traspaso-listo]").innerText()), true);
  es("Ale ya no tiene leads abiertos", Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is null`)), 0);
  es("los cerrados siguen con ella", Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is not null`)), cerradosAntes);
  es("ni chats", Number(sql(`select count(*) from conversaciones where vendedor_id=${ALE}`)), 0);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/reasignar-3-listo.png` });

  console.log("\n── 3. RECIÉN AHORA CAMBIA EL ROL Y DA DE BAJA LA FICHA ──");
  es("la casilla de baja viene marcada", await ventana.locator("[data-dar-de-baja]").isChecked(), true);
  await ventana.getByRole("button", { name: `Cambiar el rol a ${nombreRol}` }).click();
  await ventana.waitFor({ state: "detached", timeout: 15000 });
  es("el rol cambió", sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`), rolSinLeads);
  es("su ficha quedó de baja", sql(`select activo from vendedores where id=${ALE}`), "f");

  console.log("\n── 4. CANCELAR NO CAMBIA NADA (con Huri) ──");
  const HURI_USUARIO = "44444444-0000-0000-0000-000000000004";
  const rolHuri = sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`);
  const abiertosHuri = sql(`select count(*) from oportunidades where vendedor_id=${HURI} and fecha_cierre is null`);
  const filaHuri = () => p.locator("tr", { hasText: "huri@lac.test" }).locator("select").first();
  await filaHuri().selectOption(rolSinLeads);
  const ventanaHuri = p.getByRole("dialog", { name: /Reasignar la cartera de Huri Prueba/ });
  await ventanaHuri.waitFor({ timeout: 15000 });
  await ventanaHuri.getByRole("button", { name: "Cancelar" }).click();
  await ventanaHuri.waitFor({ state: "detached", timeout: 15000 });
  es("el rol quedó igual", sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`), rolHuri);
  es("y sus leads también", sql(`select count(*) from oportunidades where vendedor_id=${HURI} and fecha_cierre is null`), abiertosHuri);
  es("la pantalla vuelve a mostrar su rol", await filaHuri().inputValue(), rolHuri);

  console.log("\n── 5. CAMBIAR A OTRO ROL QUE TAMBIÉN RECIBE LEADS NO PREGUNTA ──");
  const otroQueRecibe = sql(`select id from roles where recibe_leads and id<>${rolHuri} order by id limit 1`);
  if (otroQueRecibe) {
    await filaHuri().selectOption(otroQueRecibe);
    await p.waitForTimeout(2500);
    es("no abre la ventana", await ventanaHuri.count(), 0);
    es("y cambia el rol directo", sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`), otroQueRecibe);
    sql(`update usuarios set rol_id=${rolHuri} where id='${HURI_USUARIO}'`);
  }

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}

console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
