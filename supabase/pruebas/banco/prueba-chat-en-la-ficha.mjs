/**
 * El chat del cliente a la izquierda de su ficha, en el Pipeline.
 *
 *     node supabase/pruebas/banco/prueba-chat-en-la-ficha.mjs
 *
 * Pedido por ventas el 16/10/2026: al abrir un lead en el Pipeline, ver la
 * conversación al lado para ir llenando los datos. Se arma un cliente con dos
 * chats (WhatsApp y Messenger), se abre su lead y se comprueba que:
 *   - el chat aparece a la IZQUIERDA de la ficha, con los mensajes del cliente;
 *   - se puede contestar desde ahí y el mensaje sale;
 *   - hay una pestaña por red y cambia de hilo;
 *   - no están «No era lead» ni «Archivar» (borrarían al cliente de su propia ficha);
 *   - un lead sin chat sigue con la ficha sola, sin panel;
 *   - el Inbox de siempre no se mezcla (no le pisa el borrador).
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" })
    .split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

// Un lead con chat de WhatsApp y de Messenger, y otro sin ningún chat.
const [conChat, sinChat] = sql("select string_agg(id::text, ',' order by id) from (select id from oportunidades order by id limit 2) t").split(",");
const cliente = sql(`select cliente_id from oportunidades where id=${conChat}`);
const nombre = sql(`select nombre from clientes where id=${cliente}`);
const clienteSin = sql(`select cliente_id from oportunidades where id=${sinChat}`);
sql(`delete from conversaciones where cliente_id in (${cliente}, ${clienteSin})`);
const wa = sql(`insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en) values ('50379995001', '50379995001', 'whatsapp', ${cliente}, 901, now()) returning id`).split("\n")[0];
const ms = sql(`insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en) values ('psid-chat-ficha', null, 'messenger', ${cliente}, 901, now() - interval '1 hour') returning id`).split("\n")[0];
sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) values (${wa}, 'entrante', 'text', 'Hola, quiero el diplomado de cocina', now() - interval '5 minutes')`);
sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) values (${ms}, 'entrante', 'text', 'Mensaje por Messenger de prueba', now() - interval '1 hour')`);

const limpiar = () => {
  sql(`delete from mensajes where conversacion_id in (${wa}, ${ms})`);
  sql(`delete from conversaciones where id in (${wa}, ${ms})`);
};

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Pipeline", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, HOY);
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

const abrir = async (n) => {
  await p.locator(`text=${n}`).first().click();
  await p.locator("aside", { hasText: "Etapa del proceso" }).waitFor({ timeout: 15000 });
};

try {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);

  console.log("── 1. LEAD CON CHAT: ficha a la derecha, chat a la izquierda ──");
  await abrir(nombre);
  await p.locator("[data-chat-de-la-ficha]").waitFor({ timeout: 20000 });
  const caja = await p.locator("[data-chat-de-la-ficha]").boundingBox();
  const ficha = await p.locator("aside", { hasText: "Etapa del proceso" }).boundingBox();
  es("el chat está a la izquierda de la ficha", caja.x + caja.width <= ficha.x + 2, true);
  es("a la misma altura", Math.abs(caja.y - ficha.y) < 30, true);
  await p.getByText("Hola, quiero el diplomado de cocina").first().waitFor({ timeout: 15000 });
  es("se lee lo que escribió el cliente", true, true);
  es("sin lista de conversaciones", await p.locator("[data-chat-de-la-ficha] button.row").count(), 0);
  es("sin «No era lead» ni «Archivar»",
    [await p.locator("[data-chat-de-la-ficha]").getByText("No era lead").count(), await p.locator("[data-chat-de-la-ficha]").getByText("Archivar").count()], [0, 0]);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/chat-en-la-ficha.png` });

  console.log("\n── 2. SE CONTESTA DESDE AHÍ ──");
  const TEXTO = "Con gusto, te comparto la información " + Date.now();
  await p.locator("[data-chat-de-la-ficha] textarea").first().fill(TEXTO);
  await p.locator("[data-chat-de-la-ficha] textarea").first().press("Enter");
  await p.waitForTimeout(3500);
  es("el mensaje salió y quedó en la conversación", Number(sql(`select count(*) from mensajes where conversacion_id=${wa} and direccion='saliente' and texto='${TEXTO}'`)), 1);
  es("y se ve en el chat", await p.locator("[data-chat-de-la-ficha]").getByText(TEXTO).count() > 0, true);

  console.log("\n── 3. DOS REDES, DOS PESTAÑAS ──");
  es("hay una pestaña por red", await p.locator("[data-chat-pestana]").count(), 2);
  await p.locator(`[data-chat-pestana="${ms}"]`).click();
  await p.getByText("Mensaje por Messenger de prueba").first().waitFor({ timeout: 10000 });
  es("cambia al hilo de Messenger", true, true);

  console.log("\n── 4. EL BORRADOR DEL INBOX NO SE PISA ──");
  const guardado = await p.evaluate(() => sessionStorage.getItem("lac.inbox.borrador"));
  es("el chat de la ficha no guarda borrador", guardado, null);

  console.log("\n── 5. LEAD SIN CHAT: sólo la ficha ──");
  await p.keyboard.press("Escape");
  await p.locator("aside", { hasText: "Etapa del proceso" }).getByRole("button", { name: "Cerrar" }).click().catch(() => {});
  await p.waitForTimeout(800);
  const nombreSin = sql(`select nombre from clientes where id=${clienteSin}`);
  await abrir(nombreSin);
  await p.waitForTimeout(1500);
  es("el panel dice que no hay conversación", await p.locator("[data-chat-vacio]").count(), 1);

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-chat-ficha.png" }).catch(() => {});
} finally {
  await nav.close();
  limpiar();
}

console.log(f ? `\n${f} cosa(s) mal.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
