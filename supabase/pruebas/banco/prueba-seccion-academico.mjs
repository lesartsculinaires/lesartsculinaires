/**
 * La sección «Académico» del Inbox (pedido del 28/10/2026).
 *
 *     node supabase/pruebas/banco/prueba-seccion-academico.mjs
 *
 * Junto a los canales aparece «🎓 Académico» cuando hay alguna ficha marcada
 * como académica (Sussy). Al tocarla, la lista muestra sólo los chats
 * asignados a esa ficha; al tocarla otra vez, vuelve a «Todos».
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142, arrancada
 * después de `PREPARAR=1 node …` (ver abajo). Deja la ficha 902 marcada como
 * académica.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const limpiar = () => {
  sql("delete from conversaciones where identificador like 'acad-%'");
};

limpiar();
sql("update vendedores set academico = true where id = 902");
sql("insert into conversaciones (identificador, telefono, nombre_perfil, canal, vendedor_id, ultimo_mensaje_en, sin_leer) values ('acad-1', '50371110001', 'Acad Sussy Uno', 'whatsapp', 902, now(), 1)");
sql("insert into conversaciones (identificador, telefono, nombre_perfil, canal, vendedor_id, ultimo_mensaje_en) values ('acad-2', '50371110002', 'Acad Ventas Dos', 'whatsapp', 901, now())");
// El catálogo se guarda unos minutos en la aplicación: para que la marca se
// vea enseguida, la aplicación tiene que arrancar DESPUÉS de esto. Si ya
// estaba arrancada, PREPARAR=1 deja todo listo y sale.
if (process.env.PREPARAR) process.exit(0);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const nuestras = () => p.locator("main button.row").allInnerTexts().then((ts) => ts.filter((x) => /Acad /.test(x)).map((x) => x.match(/Acad \w+ \w+/)[0]).sort());

try {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  const seccion = p.locator('[data-canal-seccion="academico"]');
  await seccion.waitFor({ timeout: 20000 });
  es("aparece la sección Académico", await seccion.count(), 1);
  es("con su chat sin leer contado", /1/.test(await seccion.innerText()), true);
  es("en Todos están las dos", await nuestras(), ["Acad Sussy Uno", "Acad Ventas Dos"]);

  await seccion.click();
  await p.waitForTimeout(500);
  es("Académico: sólo el chat de Sussy", await nuestras(), ["Acad Sussy Uno"]);

  await seccion.click();
  await p.waitForTimeout(500);
  es("al tocarla otra vez, vuelve a Todos", await nuestras(), ["Acad Sussy Uno", "Acad Ventas Dos"]);

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
