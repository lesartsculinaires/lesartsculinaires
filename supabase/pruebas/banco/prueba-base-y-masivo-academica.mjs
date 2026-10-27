/**
 * Lo pedido el 27/10/2026 para bases y masivos (y el área académica):
 *
 *     node supabase/pruebas/banco/prueba-base-y-masivo-academica.mjs
 *
 *   1. AL SUBIR UNA BASE   se ve quién ya está en el CRM, con su vendedor, el
 *                          canal por el que entró y su último mensaje.
 *   2. EN EL INBOX         los filtros «Base» y «Envío masivo», y plegar los
 *                          filtros para ver más chats (se recuerda al volver).
 *   3. EN UN MASIVO        «Las respuestas las atiendo yo»: lo que no tiene
 *                          dueña queda a nombre de quien manda; lo que tiene
 *                          asesora sigue con ella.
 *
 * Necesita el banco armado (`armar.sh`), el Meta de mentira en 3144 y la
 * aplicación en 3142. Deja la base como estaba.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const JEFA = "cccccccc-0000-0000-0000-000000000003";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const limpiar = () => {
  sql("delete from envio_destinatarios where cliente_id in (select id from clientes where correo like 'yaesta%@prueba.test')");
  sql("delete from envios where nombre like 'Yaesta%'");
  sql("delete from mensajes where conversacion_id in (select id from conversaciones where cliente_id in (select id from clientes where correo like 'yaesta%@prueba.test'))");
  sql("delete from conversaciones where cliente_id in (select id from clientes where correo like 'yaesta%@prueba.test')");
  sql("delete from base_leads where importacion_id in (select id from importaciones where archivo = 'Base Yaesta')");
  sql("delete from importaciones where archivo = 'Base Yaesta'");
  sql("delete from oportunidades where codigo like 'YAE-%'");
  sql("delete from clientes where correo like 'yaesta%@prueba.test'");
  sql("delete from vendedores where nombre = 'Sussy Prueba'");
};

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: JEFA, email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: "Clientes", domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

try {
  limpiar();
  const producto = sql("select id from productos order by id limit 1");
  const etapa = sql("select id from etapas order by orden limit 1");
  const c1 = sql("insert into clientes (nombre, telefono, correo) values ('Yaesta Uno', '50370001111', 'yaesta1@prueba.test') returning id");
  const c2 = sql("insert into clientes (nombre, telefono, correo) values ('Yaesta Dos', '50370002222', 'yaesta2@prueba.test') returning id");
  const c3 = sql("insert into clientes (nombre, telefono, correo) values ('Yaesta Tres', '50370003333', 'yaesta3@prueba.test') returning id");
  const op1 = sql(`insert into oportunidades (codigo, cliente_id, vendedor_id, producto_id, etapa_id, canal_id, fecha_registro) values ('YAE-1', ${c1}, 902, ${producto}, ${etapa}, 2, current_date) returning id`);
  const op2 = sql(`insert into oportunidades (codigo, cliente_id, vendedor_id, producto_id, etapa_id, canal_id, fecha_registro) values ('YAE-2', ${c2}, null, ${producto}, ${etapa}, 1, current_date) returning id`);
  const op3 = sql(`insert into oportunidades (codigo, cliente_id, vendedor_id, producto_id, etapa_id, canal_id, fecha_registro) values ('YAE-3', ${c3}, null, ${producto}, ${etapa}, 3, current_date) returning id`);
  sql(`insert into conversaciones (identificador, telefono, nombre_perfil, canal, cliente_id, vendedor_id, ultimo_mensaje_en, ultimo_texto) values ('yae-1', '50370001111', 'Yaesta Uno', 'whatsapp', ${c1}, 902, now() - interval '2 hours', 'Quiero saber del diplomado de cocina')`);
  sql(`insert into conversaciones (identificador, telefono, nombre_perfil, canal, cliente_id, vendedor_id, ultimo_mensaje_en, ultimo_texto) values ('yae-3', '50370003333', 'Yaesta Tres', 'whatsapp', ${c3}, null, now() - interval '1 hour', 'Me llegó su mensaje')`);

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. AL SUBIR UNA BASE ──");
  // ══════════════════════════════════════════════════════════════════════
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Subir base de datos/ }).click();
  const subir = p.getByRole("dialog", { name: "Subir base de datos" });
  await subir.locator('input[type="file"]').setInputFiles({
    name: "yaesta.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nombre,telefono,correo\nYaesta Uno,50370001111,\nYAESTA DOS MARTINEZ,,yaesta2@prueba.test\nPersona Nueva Yaesta,50370009999,\n"),
  });
  const yaEstan = subir.locator("[data-ya-estan]");
  await yaEstan.locator("[data-ya-esta]").first().waitFor({ timeout: 20000 });
  const t1 = await texto(yaEstan);
  console.log(`   (${t1.slice(0, 160)}…)`);
  es("dice cuántos ya están", /2 personas de la base ya están/.test(t1), true);
  es("cuántos con vendedor y cuántos sin", /1 con vendedor asignado · 1 sin vendedor/.test(t1), true);
  es("el vendedor de Uno", t1.includes("Vendedor: Huri Prueba"), true);
  es("por qué canal entró Uno", t1.includes("Entró por: Facebook"), true);
  es("su último mensaje y por dónde", /Último mensaje .* por WhatsApp: «Quiero saber del diplomado de cocina»/.test(t1), true);
  es("Dos, sin vendedor", t1.includes("Sin vendedor"), true);
  es("con el nombre del archivo cuando difiere", /en el archivo: «Yaesta dos Martinez»/i.test(t1), true);
  es("la persona nueva no aparece", t1.includes("Persona Nueva"), false);
  await subir.getByRole("button", { name: "Cancelar" }).click();

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EN EL INBOX ──");
  // ══════════════════════════════════════════════════════════════════════
  const base = sql("insert into importaciones (archivo, filas) values ('Base Yaesta', 2) returning id");
  sql(`insert into base_leads (importacion_id, oportunidad_id) values (${base}, ${op1})`);
  const envio = sql("insert into envios (nombre, estado) values ('Yaesta campaña vieja', 'terminado') returning id");
  sql(`insert into envio_destinatarios (envio_id, cliente_id, oportunidad_id, telefono, nombre, estado) values (${envio}, ${c3}, ${op3}, '50370003333', 'Yaesta Tres', 'enviado')`);

  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator('aside button[data-mod="Inbox"]').click();
  const filas = () => p.locator("main button.row").allInnerTexts().then((ts) => ts.filter((x) => /Yaesta/.test(x)).map((x) => x.match(/Yaesta \w+/)[0]).sort());
  await p.locator('select[aria-label="Filtrar por base"]').waitFor({ timeout: 20000 });

  await p.locator('select[aria-label="Filtrar por base"]').selectOption(String(base));
  await p.waitForTimeout(600);
  es("filtro Base: sólo la gente de la base", await filas(), ["Yaesta Uno"]);
  es("y lo dice", /1 chat de gente de esa base/.test(await texto(p.locator("[data-resumen-filtro-base]"))), true);
  await p.locator('select[aria-label="Filtrar por base"]').selectOption("");

  await p.locator('select[aria-label="Filtrar por envío masivo"]').selectOption(String(envio));
  await p.getByText(/de quienes recibieron ese envío/).waitFor({ timeout: 10000 });
  es("filtro Envío: sólo quienes lo recibieron", await filas(), ["Yaesta Tres"]);

  // Plegar los filtros: se ve más lista, y lo puesto se sigue diciendo.
  await p.locator("[data-plegar-filtros]").click();
  es("plegados, no están las redes ni el día", await p.locator("[data-contestadas]").count(), 0);
  es("pero dice qué está filtrando", /Filtrando: envío «Yaesta campaña vieja»/.test(await texto(p.locator("[data-filtros-puestos]"))), true);
  es("y la lista sigue filtrada", await filas(), ["Yaesta Tres"]);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("[data-plegar-filtros]").waitFor({ timeout: 20000 });
  es("al volver, siguen plegados", await p.locator("[data-contestadas]").count(), 0);
  await p.locator("[data-plegar-filtros]").click();
  es("y se despliegan con el mismo botón", await p.locator("[data-contestadas]").count(), 1);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. EN UN MASIVO: «LAS ATIENDO YO» ──");
  // ══════════════════════════════════════════════════════════════════════
  const sussy = sql(`insert into vendedores (nombre, activo, usuario_id) values ('Sussy Prueba', true, '${JEFA}') returning id`);
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.locator('main input[placeholder*="Buscar nombre"]').first().fill("Yaesta");
  await p.waitForTimeout(1200);
  const casillas = p.locator('main tbody input[type="checkbox"]');
  es("las tres fichas en la lista", await casillas.count(), 3);
  for (let i = 0; i < 3; i++) await casillas.nth(i).check();
  await p.getByRole("button", { name: /Escribirles por WhatsApp/ }).first().click();
  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  await dlg.locator("input").first().fill("Yaesta egresados");
  await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
  await dlg.locator("[data-quien-atiende]").waitFor({ timeout: 20000 });
  es("ofrece elegir quién atiende", await dlg.getByText("Las atiendo yo").count(), 1);
  es("y por omisión, la asesora de cada lead", await dlg.getByRole("radio", { name: /La asesora de cada lead/ }).isChecked(), true);
  await dlg.locator("select").first().selectOption({ label: "recordatorio_pago (es)" });
  await dlg.getByRole("radio", { name: /Las atiendo yo/ }).check();
  await p.getByRole("button", { name: /^Mandar a 3$/ }).click();
  await dlg.getByText(/^Listo\.$/).waitFor({ timeout: 60000 });
  const fin = await texto(dlg);
  console.log(`   (${(fin.match(/Respuestas:[^]{0,120}/) ?? ["sin resumen"])[0]})`);
  es("dice cuántos quedaron a su nombre", /2 personas quedaron a tu nombre; 1 sigue con su asesora/.test(fin), true);

  const vend = (q) => sql(q) || "null";
  es("el lead sin dueña de Dos, a su nombre", vend(`select vendedor_id from oportunidades where id = ${op2}`), sussy);
  es("el de Tres también", vend(`select vendedor_id from oportunidades where id = ${op3}`), sussy);
  es("el chat de Tres, que no tenía dueña, también", vend(`select vendedor_id from conversaciones where identificador = 'yae-3'`), sussy);
  es("el chat nuevo de Dos nace a su nombre", vend(`select vendedor_id from conversaciones where cliente_id = ${c2} order by id limit 1`), sussy);
  es("Uno sigue con su asesora: el lead", vend(`select vendedor_id from oportunidades where id = ${op1}`), "902");
  es("y el chat", vend(`select vendedor_id from conversaciones where identificador = 'yae-1'`), "902");

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-academica.png" }).catch(() => {});
} finally {
  await nav.close();
  limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
