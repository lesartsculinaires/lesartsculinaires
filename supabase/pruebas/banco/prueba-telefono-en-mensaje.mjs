/**
 * Un número que el cliente ESCRIBE en el chat sale como tarjeta, para copiarlo
 * o guardarlo en su ficha.
 *
 *     node supabase/pruebas/banco/prueba-telefono-en-mensaje.mjs
 *
 * Pedido el 25/11/2026 para LAC y HC. Se meten mensajes entrantes con números
 * escritos de distintas formas y se comprueba la tarjeta, el guardado en la
 * ficha (al secundario cuando el principal está ocupado), que no se repita, que
 * avise si el chat no tiene ficha, y que no salga con el número propio ni en
 * los mensajes del equipo. Al final se deja todo como estaba.
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

const QUIEN = process.env.QUIEN ?? "ale";
const CONV = 3319; // Vence En Dos, WhatsApp, con ficha y teléfono principal
const CLIENTE = Number(sql(`select cliente_id from conversaciones where id=${CONV}`));
const secundarioAntes = sql(`select coalesce(telefono_secundario,'') from clientes where id=${CLIENTE}`);
const CONV_SIN_FICHA = Number(sql("select id from conversaciones where cliente_id is null and canal='messenger' order by id limit 1"));
const inserta = (conv, dir, texto) =>
  Number(sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) values (${conv}, '${dir}', 'text', '${texto}', now()) returning id`).split("\n")[0]);
const nuevos = [
  inserta(CONV, "entrante", "Hola, mi otro número es 7880 3928 y el de mi mamá 7123-4567"),
  inserta(CONV, "entrante", "Este es el mismo de siempre: 7000 0913"),
  inserta(CONV, "saliente", "Le escribo desde el 7999 8888"),
];
if (CONV_SIN_FICHA) nuevos.push(inserta(CONV_SIN_FICHA, "entrante", "mi número es +503 7880-3928"));
sql(`update conversaciones set ultimo_mensaje_en=now() where id in (${CONV}${CONV_SIN_FICHA ? `, ${CONV_SIN_FICHA}` : ""})`);

const limpiar = () => {
  sql(`delete from mensajes where id in (${nuevos.join(",")})`);
  sql(`update clientes set telefono_secundario=${secundarioAntes ? `'${secundarioAntes}'` : "null"} where id=${CLIENTE}`);
};

const jwt = fs.readFileSync(`${BANCO}/jwt-${QUIEN}.txt`, "utf8").trim();
const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: sub, email: `${QUIEN}@lac.test` },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
try {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=Inbox`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();

  console.log("── 1. LA TARJETA SALE CON LOS NÚMEROS ESCRITOS ──");
  await p.getByText("Vence En Dos", { exact: true }).first().click();
  const tarjetas = p.locator("[data-telefonos-del-mensaje]");
  await tarjetas.first().waitFor({ timeout: 15000 });
  es("una sola tarjeta (no la del número propio ni la del mensaje del equipo)", await tarjetas.count(), 1);
  const texto = await tarjetas.first().innerText();
  es("trae los dos números, con formato", /\+503 7880 3928/.test(texto) && /\+503 7123 4567/.test(texto), true);
  es("no ofrece el número desde el que escribe", /7000 0913/.test(await p.locator("[data-telefonos-del-mensaje]").allInnerTexts().then((x) => x.join(" "))), false);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/telefono-1-tarjeta.png` });

  console.log("\n── 2. GUARDAR EN LA FICHA ──");
  await p.locator('[data-guardar-telefono="50378803928"]').click();
  await p.locator("[data-telefono-dicho]").waitFor({ timeout: 15000 });
  const dicho = await p.locator("[data-telefono-dicho]").innerText();
  es("avisa dónde lo guardó", /secundario/.test(dicho) || /ya está/.test(dicho), true);
  es("quedó como teléfono secundario", sql(`select telefono_secundario from clientes where id=${CLIENTE}`), secundarioAntes || "50378803928");
  await p.locator('[data-guardar-telefono="50378803928"]').click();
  await p.waitForTimeout(1500);
  es("guardarlo de nuevo no duplica", /ya está en la ficha/.test(await p.locator("[data-telefono-dicho]").innerText()), true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/telefono-2-guardado.png` });

  if (CONV_SIN_FICHA) {
    console.log("\n── 3. UN CHAT SIN FICHA LO DICE ──");
    const nombre = sql(`select nombre_perfil from conversaciones where id=${CONV_SIN_FICHA}`);
    await p.getByText(nombre, { exact: true }).first().click();
    await p.locator('[data-guardar-telefono="50378803928"]').waitFor({ timeout: 15000 });
    await p.locator('[data-guardar-telefono="50378803928"]').click();
    await p.locator("[data-telefono-dicho]").waitFor({ timeout: 15000 });
    es("pide abrir el lead primero", /no tiene ficha/.test(await p.locator("[data-telefono-dicho]").innerText()), true);
  }

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
