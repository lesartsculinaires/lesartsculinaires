/**
 * Cerrar la ventana del masivo sin mandar no deja un «sin mandar» en Envíos.
 *
 *     node supabase/pruebas/banco/prueba-borrador-de-masivo.mjs
 *
 * 29/10/2026: Sussy abrió y cerró la ventana cinco veces y quedaron cinco
 * borradores «OPORTUNIDAD DE PASANTÍAS EN LAC» en la lista de Envíos.
 *
 *   1. Armar y cancelar: el borrador se tira.
 *   2. Uno abandonado (pestaña cerrada): se tira al armar el siguiente.
 *   3. Un envío que ya empezó no se toca.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const JEFA = "cccccccc-0000-0000-0000-000000000003";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const limpiar = () => {
  sql("delete from envios where nombre like 'Borrador prueba%'");
  sql("delete from oportunidades where codigo like 'BOR-%'");
  sql("delete from clientes where correo like 'borrador%@prueba.test'");
};
const cuantos = (estado) => Number(sql(`select count(*) from envios where nombre like 'Borrador prueba%' and estado = '${estado}'`));

limpiar();
const producto = sql("select id from productos order by id limit 1");
const etapa = sql("select id from etapas order by orden limit 1");
for (const n of [1, 2]) {
  const c = sql(`insert into clientes (nombre, telefono, correo) values ('Borrador Prueba ${n}', '5037222000${n}', 'borrador${n}@prueba.test') returning id`);
  sql(`insert into oportunidades (codigo, cliente_id, producto_id, etapa_id, fecha_registro) values ('BOR-${n}', ${c}, ${producto}, ${etapa}, current_date)`);
}
// Uno que ya empezó: no se toca nunca.
const empezado = sql(`insert into envios (nombre, estado, creado_por, empezado_en) values ('Borrador prueba empezado', 'enviando', '${JEFA}', now()) returning id`);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: JEFA, email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: "Clientes", domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

const armar = async (nombre) => {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.locator('main input[placeholder*="Buscar nombre"]').first().fill("Borrador Prueba");
  await p.waitForTimeout(1200);
  const casillas = p.locator('main tbody input[type="checkbox"]');
  for (let i = 0; i < (await casillas.count()); i++) await casillas.nth(i).check();
  await p.getByRole("button", { name: /Escribirles por WhatsApp/ }).first().click();
  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  await dlg.locator("input").first().fill(nombre);
  await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
  await dlg.getByText(/Le llega a 2 personas/).waitFor({ timeout: 20000 });
  return dlg;
};

try {
  console.log("── 1. armar y cancelar ──");
  const dlg = await armar("Borrador prueba uno");
  es("al ver a quiénes les llega, el borrador existe", cuantos("borrador"), 1);
  await dlg.getByRole("button", { name: "Cancelar" }).click();
  await p.waitForTimeout(1500);
  es("AL CANCELAR, SE TIRA", cuantos("borrador"), 0);

  console.log("\n── 2. uno abandonado se tira al armar el siguiente ──");
  await armar("Borrador prueba abandonado");
  // Se recarga sin cerrar la ventana: como una pestaña cerrada.
  await p.reload({ waitUntil: "networkidle" });
  es("el abandonado quedó", cuantos("borrador"), 1);
  const dlg2 = await armar("Borrador prueba dos");
  es("al armar otro, queda uno solo: el nuevo", sql("select string_agg(nombre, ',') from envios where nombre like 'Borrador prueba%' and estado = 'borrador'"), "Borrador prueba dos");
  await dlg2.getByRole("button", { name: "Cancelar" }).click();
  await p.waitForTimeout(1500);

  console.log("\n── 3. el que ya empezó no se toca ──");
  es("sigue ahí", sql(`select count(*) from envios where id = ${empezado}`), "1");

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
