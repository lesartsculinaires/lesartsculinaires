/**
 * Sacar a alguien de ventas desde «Usuarios y Roles» pregunta qué pasa con
 * sus leads: pasarlos a una o varias personas elegidas, o repartirlos al azar.
 *
 *     node supabase/pruebas/banco/prueba-reasignar-al-salir.mjs
 *
 * Pedido el 23/11/2026 para las dos marcas, y ese mismo día: «poder elegir
 * múltiples nombres». Cada paso abre la página de cero, porque la pantalla
 * guarda los datos en el navegador y una recarga podía mostrar el rol de
 * antes de los cambios que la prueba hace directo en la base. Al final se
 * deja todo como estaba.
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

const ALE = 901;
const HURI = 902;
const ALEXANDRA = 1;
const ALE_USUARIO = "11111111-0000-0000-0000-000000000001";
const HURI_USUARIO = "44444444-0000-0000-0000-000000000004";
const jwt = (q) => fs.readFileSync(`${BANCO}/jwt-${q}.txt`, "utf8").trim();

const respaldoLeads = sql("select string_agg(id||':'||coalesce(vendedor_id::text,''), ',') from oportunidades");
const respaldoChats = sql("select string_agg(id||':'||coalesce(vendedor_id::text,''), ',') from conversaciones");
const rolAle = sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`);
const rolHuri = sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`);
const rolSinLeads = sql("select id from roles where not recibe_leads and not es_admin order by id limit 1");
const nombreRol = sql(`select nombre from roles where id=${rolSinLeads}`);
const leadsAbiertosDe = (v) => Number(sql(`select count(*) from oportunidades where vendedor_id=${v} and fecha_cierre is null`));
const abiertosAle = leadsAbiertosDe(ALE);
const cerradosAle = Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is not null`));
const idsAbiertosAle = sql(`select string_agg(id::text, ',') from oportunidades where vendedor_id=${ALE} and fecha_cierre is null`);

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
  sql(`update usuarios set rol_id=${rolHuri} where id='${HURI_USUARIO}'`);
  sql(`update vendedores set activo=true where id in (${ALE}, ${HURI})`);
};

const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt("jefa"), token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];

/** Una página nueva en «Usuarios y Roles», sin nada guardado de antes. */
async function abrir() {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=${encodeURIComponent("Usuarios y Roles")}`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();
  return p;
}
const rolDe = (p, correo) => p.locator("tr", { hasText: correo }).locator("select").first();

try {
  es("Ale empieza con leads abiertos", abiertosAle > 1, true);

  console.log("── 0. «ASIGNAR ALEATORIAMENTE» REPARTE ENTRE LAS QUE RECIBEN LEADS ──");
  // Va primero: los pasos de abajo dan de baja la ficha de Ale desde la app, y
  // reactivarla por SQL no renueva lo que la app guarda de las fichas.
  let p = await abrir();
  await rolDe(p, "huri@lac.test").selectOption(rolSinLeads);
  let ventana = p.getByRole("dialog", { name: /Reasignar la cartera de Huri Prueba/ });
  await ventana.waitFor({ timeout: 15000 });
  await ventana.locator("[data-cartera]").waitFor({ timeout: 15000 });
  es("explica entre quiénes reparte", /recibe leads|reciben leads/.test(await ventana.locator("[data-al-azar-caja]").innerText()), true);
  await ventana.locator("[data-al-azar]").click();
  await ventana.locator("[data-traspaso-listo]").waitFor({ timeout: 15000 });
  // En el banco sólo Ale recibe leads además de Huri, así que se lo lleva todo.
  const textoAzar = await ventana.locator("[data-traspaso-listo]").innerText();
  es("le llegó todo a quien recibe leads", /Ale Prueba recibió/.test(textoAzar), true);
  es("Huri ya no tiene leads abiertos", leadsAbiertosDe(HURI), 0);
  es("el rol de Huri no cambió sin confirmar", sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`), rolHuri);
  await p.context().close();
  limpiar();


  console.log("\n── 1. CAMBIARLE EL ROL A UNO QUE NO RECIBE LEADS ABRE LA VENTANA ──");
  p = await abrir();
  await rolDe(p, "ale@lac.test").selectOption(rolSinLeads);
  ventana = p.getByRole("dialog", { name: /Reasignar la cartera de Ale Prueba/ });
  await ventana.waitFor({ timeout: 15000 });
  es("todavía no cambió el rol", sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`), rolAle);
  await ventana.locator("[data-cartera]").waitFor({ timeout: 15000 });
  es("muestra sus leads abiertos", new RegExp(`${abiertosAle} leads abiertos`).test(await ventana.locator("[data-cartera]").innerText()), true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/reasignar-1-ventana.png` });

  console.log("\n── 2. ELEGIR VARIAS PERSONAS A MANO ──");
  es("no se ofrece a la misma Ale", await ventana.locator(`[data-elegir="${ALE}"]`).count(), 0);
  es("sin nadie elegido, el botón no deja", await ventana.locator("[data-traspasar]").isDisabled(), true);
  await ventana.locator(`[data-elegir="${HURI}"]`).check();
  es("con una, le pasa todo", await ventana.locator("[data-traspasar]").innerText(), "Pasarle todo a Huri Prueba");
  await ventana.locator(`[data-elegir="${ALEXANDRA}"]`).check();
  es("con dos, reparte entre las dos", await ventana.locator("[data-traspasar]").innerText(), "Repartir entre las 2");
  es("dice cuánto le toca a cada una", /le tocan/.test(await ventana.locator("[data-por-cabeza]").innerText()), true);
  es("el botón al azar sigue ahí", await ventana.locator("[data-al-azar]").count(), 1);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/reasignar-2-varias.png` });
  await ventana.locator("[data-traspasar]").click();
  await ventana.locator("[data-traspaso-listo]").waitFor({ timeout: 15000 });
  es("avisa que se repartió entre 2 personas",
    /Se repartieron \d+ leads abiertos.*entre 2 personas/.test(await ventana.locator("[data-traspaso-listo]").innerText()), true);
  const destinos = sql(`select string_agg(vendedor_id::text, ',') from oportunidades where id in (${idsAbiertosAle})`).split(",");
  const cuantos = (v) => destinos.filter((x) => x === String(v)).length;
  es("sus leads quedaron solo con las dos elegidas", destinos.every((x) => x === String(ALEXANDRA) || x === String(HURI)), true);
  es("parejo: una diferencia de 1 como mucho", Math.abs(cuantos(ALEXANDRA) - cuantos(HURI)) <= 1, true);
  es("Ale ya no tiene leads abiertos", leadsAbiertosDe(ALE), 0);
  es("los cerrados siguen con ella", Number(sql(`select count(*) from oportunidades where vendedor_id=${ALE} and fecha_cierre is not null`)), cerradosAle);
  es("ni chats", Number(sql(`select count(*) from conversaciones where vendedor_id=${ALE}`)), 0);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/reasignar-3-listo.png` });

  console.log("\n── 3. RECIÉN AHORA CAMBIA EL ROL Y DA DE BAJA LA FICHA ──");
  es("la casilla de baja viene marcada", await ventana.locator("[data-dar-de-baja]").isChecked(), true);
  await ventana.getByRole("button", { name: `Cambiar el rol a ${nombreRol}` }).click();
  await ventana.waitFor({ state: "detached", timeout: 15000 });
  es("el rol cambió", sql(`select rol_id from usuarios where id='${ALE_USUARIO}'`), rolSinLeads);
  es("su ficha quedó de baja", sql(`select activo from vendedores where id=${ALE}`), "f");
  await p.context().close();
  limpiar();

  console.log("\n── 5. CANCELAR NO CAMBIA NADA ──");
  p = await abrir();
  const abiertosHuri = leadsAbiertosDe(HURI);
  await rolDe(p, "huri@lac.test").selectOption(rolSinLeads);
  ventana = p.getByRole("dialog", { name: /Reasignar la cartera de Huri Prueba/ });
  await ventana.waitFor({ timeout: 15000 });
  await ventana.getByRole("button", { name: "Cancelar" }).click();
  await ventana.waitFor({ state: "detached", timeout: 15000 });
  es("el rol quedó igual", sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`), rolHuri);
  es("y sus leads también", leadsAbiertosDe(HURI), abiertosHuri);
  es("la pantalla vuelve a mostrar su rol", await rolDe(p, "huri@lac.test").inputValue(), rolHuri);

  console.log("\n── 6. CAMBIAR A OTRO ROL QUE TAMBIÉN RECIBE LEADS NO PREGUNTA ──");
  const otroQueRecibe = sql(`select id from roles where recibe_leads and id<>${rolHuri} order by id limit 1`);
  if (otroQueRecibe) {
    await rolDe(p, "huri@lac.test").selectOption(otroQueRecibe);
    await p.waitForTimeout(2500);
    es("no abre la ventana", await ventana.count(), 0);
    es("y cambia el rol directo", sql(`select rol_id from usuarios where id='${HURI_USUARIO}'`), otroQueRecibe);
  }
  await p.context().close();

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}

console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
