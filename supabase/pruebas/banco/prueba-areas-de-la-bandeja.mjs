/**
 * Las áreas de la bandeja: ventas y académico (pedido del 29/10/2026).
 *
 *     PREPARAR=1 node supabase/pruebas/banco/prueba-areas-de-la-bandeja.mjs
 *     (arrancar la aplicación en 3142)
 *     node supabase/pruebas/banco/prueba-areas-de-la-bandeja.mjs
 *
 * Huri (902) hace de Sussy: ficha académica y un rol que ve todo. Ale (901)
 * es de ventas, con un rol que también ve todo. La jefa es administradora.
 *
 *   1. Huri: sólo el chat académico; sin canales ni «Sin asignar»; el número
 *      rojo cuenta sólo lo suyo; buscar encuentra a todos.
 *   2. Ale: el académico no está, ni en la lista ni en el número rojo; el sin
 *      asignar sí; buscar lo encuentra.
 *   3. La jefa ve todo, con la sección «Académico» como antes.
 *   4. El masivo de Huri abre con «Las atiendo yo»; el de Ale, como siempre.
 *
 * Con CAPTURAS=carpeta deja las pantallas para mostrarle a la escuela.
 * Necesita el banco armado (`armar.sh`). Al terminar deja los roles como
 * estaban.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
const CAPTURAS = process.env.CAPTURAS ?? null;

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const USUARIOS = {
  huri: "44444444-0000-0000-0000-000000000004",
  ale: "11111111-0000-0000-0000-000000000001",
  jefa: "cccccccc-0000-0000-0000-000000000003",
};

const limpiar = () => {
  sql("delete from mensajes where conversacion_id in (select id from conversaciones where identificador like 'area-%')");
  sql("delete from conversaciones where identificador like 'area-%'");
  sql("delete from envios where nombre like 'Area prueba%'");
  sql("delete from oportunidades where codigo like 'AREA-%'");
  sql("delete from clientes where correo like 'area%@prueba.test'");
};

const chat = (id, nombre, tel, vendedor, sinLeer, textos) => {
  const c = sql(`insert into conversaciones (identificador, telefono, nombre_perfil, canal, vendedor_id, ultimo_mensaje_en, sin_leer) values ('${id}', '${tel}', '${nombre}', 'whatsapp', ${vendedor ?? "null"}, now(), ${sinLeer}) returning id`);
  textos.forEach(([dir, texto], i) =>
    sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, estado, creado_en) values (${c}, '${dir}', 'text', '${texto}', '${dir === "entrante" ? "recibido" : "leido"}', now() - interval '${(textos.length - i) * 3} minutes')`),
  );
};

if (process.env.PREPARAR) {
  limpiar();
  sql("update vendedores set academico = true where id = 902");
  sql("update vendedores set academico = false where id <> 902");
  // Un rol que ve todo, como el «Académica» de Sussy y el de ventas de Priscila.
  sql(`update usuarios set rol_id = 6 where id in ('${USUARIOS.huri}', '${USUARIOS.ale}')`);
  chat("area-1", "Andrea Martínez", "50371110001", 902, 2, [
    ["saliente", "Hola Andrea, te escribimos de Les Arts Culinaires por la oportunidad de pasantías."],
    ["entrante", "Hola! Sí me interesa, ¿cuáles son los requisitos?"],
    ["entrante", "Estoy en tercer año de gastronomía"],
  ]);
  chat("area-2", "Carlos Hernández", "50371110002", 901, 1, [
    ["entrante", "Buenas, quisiera información del diplomado de cocina"],
  ]);
  chat("area-3", "Gabriela Rivas", "50371110003", null, 1, [
    ["entrante", "Hola, ¿tienen cursos de repostería en noviembre?"],
  ]);
  const producto = sql("select id from productos order by id limit 1");
  const etapa = sql("select id from etapas order by orden limit 1");
  for (const n of [1, 2]) {
    const c = sql(`insert into clientes (nombre, telefono, correo) values ('Area Masivo ${n}', '5037333000${n}', 'area${n}@prueba.test') returning id`);
    sql(`insert into oportunidades (codigo, cliente_id, producto_id, etapa_id, fecha_registro) values ('AREA-${n}', ${c}, ${producto}, ${etapa}, current_date)`);
  }
  console.log("Listo. Arrancá la aplicación y corré la prueba sin PREPARAR.");
  process.exit(0);
}

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
const errores = [];

const entrar = async (quien, modulo, viewport = { width: 1440, height: 900 }) => {
  const jwt = fs.readFileSync(`${BANCO}/jwt-${quien}.txt`, "utf8").trim();
  const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: USUARIOS[quien], email: `${quien}@lac.test` } })).toString("base64");
  const ctx = await nav.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 2 : 1, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: modulo, domain: "127.0.0.1", path: "/" }]);
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); localStorage.setItem("lac.inbox.filtrosPlegados", "no"); } catch {} }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  return p;
};
const nuestras = (p) => p.locator("main button.row").allInnerTexts().then((ts) =>
  ["Andrea Martínez", "Carlos Hernández", "Gabriela Rivas"].filter((n) => ts.some((x) => x.includes(n))));
const rojoDelInbox = (p) => p.locator('aside button[data-mod="Inbox"]').first().getAttribute("aria-label").then((a) => Number(a?.match(/(\d+)/)?.[1] ?? 0));
const buscar = async (p, texto) => {
  await p.locator('main input[placeholder*="Buscar por nombre"]').first().fill(texto);
  await p.waitForTimeout(600);
  const r = await nuestras(p);
  await p.locator('main input[placeholder*="Buscar por nombre"]').first().fill("");
  await p.waitForTimeout(400);
  return r;
};
const foto = async (p, nombre) => { if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/${nombre}.png` }); };
const abrirChat = async (p, nombre) => { await p.locator(`main button.row:has-text("${nombre}")`).first().click(); await p.waitForTimeout(800); };

try {
  console.log("── 1. Huri, del área académica ──");
  let p = await entrar("huri", "Inbox");
  await p.locator("main button.row").first().waitFor({ timeout: 20000 });
  es("dice que es el área académica", await p.locator('[data-area-de-la-bandeja="academico"]').count(), 1);
  es("no ve la lista de canales", await p.locator("[data-canal-seccion]").count(), 0);
  es("no tiene «Sin asignar»", await p.getByRole("button", { name: /^Sin asignar/ }).count(), 0);
  es("ve sólo el chat académico", await nuestras(p), ["Andrea Martínez"]);
  es("su número rojo cuenta sólo lo suyo", await rojoDelInbox(p), 2);
  es("buscando, encuentra a uno de ventas", await buscar(p, "Carlos"), ["Carlos Hernández"]);
  await abrirChat(p, "Andrea Martínez");
  await foto(p, "1-sussy-escritorio");
  await p.context().close();

  p = await entrar("huri", "Inbox", { width: 390, height: 780 });
  await p.locator("main button.row").first().waitFor({ timeout: 20000 });
  await foto(p, "2-sussy-telefono-lista");
  await abrirChat(p, "Andrea Martínez");
  await foto(p, "3-sussy-telefono-chat");
  await p.context().close();

  console.log("\n── 2. Ale, de ventas ──");
  p = await entrar("ale", "Inbox");
  await p.locator("main button.row").first().waitFor({ timeout: 20000 });
  es("no ve el chat académico", await nuestras(p), ["Carlos Hernández", "Gabriela Rivas"]);
  es("no tiene la sección «Académico»", await p.locator('[data-canal-seccion="academico"]').count(), 0);
  es("sí tiene «Sin asignar»", await p.getByRole("button", { name: /^Sin asignar/ }).count(), 1);
  es("su número rojo no cuenta lo académico", await rojoDelInbox(p), 2);
  es("buscando, encuentra al académico", await buscar(p, "Andrea"), ["Andrea Martínez"]);
  await abrirChat(p, "Carlos Hernández");
  await foto(p, "4-ventas-escritorio");
  await p.context().close();

  console.log("\n── 3. La jefa, administradora ──");
  // Huri y Ale abrieron un chat cada una, y abrir lo marca leído.
  sql("update conversaciones set sin_leer = 1 where identificador like 'area-%'");
  p = await entrar("jefa", "Inbox");
  await p.locator("main button.row").first().waitFor({ timeout: 20000 });
  es("ve los tres", await nuestras(p), ["Andrea Martínez", "Carlos Hernández", "Gabriela Rivas"]);
  es("con la sección «Académico»", await p.locator('[data-canal-seccion="academico"]').count(), 1);
  es("su número rojo cuenta todo", await rojoDelInbox(p), 3);
  await p.locator('[data-canal-seccion="academico"]').click();
  await p.waitForTimeout(500);
  es("y la sección muestra el académico", await nuestras(p), ["Andrea Martínez"]);
  await foto(p, "5-jefa-escritorio");
  await p.context().close();

  console.log("\n── 4. El masivo ──");
  for (const [quien, esperado] of [["huri", "yo"], ["ale", "asesora"]]) {
    p = await entrar(quien, "Clientes");
    // Fuera del Inbox el número lo cuenta el servidor, por ficha.
    es(`${quien}: fuera del Inbox, el número rojo es el de su área`, await rojoDelInbox(p), quien === "huri" ? 1 : 2);
    await p.locator('main input[placeholder*="Buscar nombre"]').first().fill("Area Masivo");
    await p.waitForTimeout(1200);
    const casillas = p.locator('main tbody input[type="checkbox"]');
    for (let i = 0; i < (await casillas.count()); i++) await casillas.nth(i).check();
    await p.getByRole("button", { name: /Escribirles por WhatsApp/ }).first().click();
    const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
    await dlg.locator("input").first().fill(`Area prueba ${quien}`);
    await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
    await dlg.locator("[data-quien-atiende]").waitFor({ timeout: 20000 });
    const marcada = await dlg.locator('[data-quien-atiende] input[type="radio"]').evaluateAll((rs) => rs.findIndex((r) => r.checked));
    es(`${quien}: abre con «${esperado === "yo" ? "Las atiendo yo" : "La asesora de cada lead"}»`, marcada, esperado === "yo" ? 1 : 0);
    if (quien === "huri") await foto(p, "6-sussy-masivo");
    await dlg.getByRole("button", { name: "Cancelar" }).click();
    await p.waitForTimeout(1000);
    await p.context().close();
  }

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
  sql(`update usuarios set rol_id = 2 where id in ('${USUARIOS.huri}', '${USUARIOS.ale}')`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
