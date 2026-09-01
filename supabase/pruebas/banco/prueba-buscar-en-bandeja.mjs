/**
 * La barra de búsqueda del Inbox.
 *
 *     node supabase/pruebas/banco/prueba-buscar-en-bandeja.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En el módulo de Inbox quiero que haya una barra de búsqueda para buscar un
 * cliente en el inbox, en todos los canales.»
 *
 * ============================================================================
 * «EN TODOS LOS CANALES» ES LO QUE HAY QUE PROBAR
 * ============================================================================
 *
 * La bandeja tiene cuatro filtros encima —red, etiqueta, archivadas, sin
 * asignar—. Si la búsqueda los respetara, no encontrar a alguien no querría
 * decir que no está: querría decir que está detrás de un filtro que nadie
 * recuerda haber puesto. Eso es peor que no tener buscador, porque da una
 * respuesta falsa a una pregunta que se hace con el cliente al teléfono.
 *
 * Por eso se prueba con el filtro puesto y con hilos archivados y de otra red:
 * la búsqueda tiene que pasar por encima de todo, y al borrarla los filtros
 * tienen que volver a mandar.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-busq-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    if (/^psql:.*ERROR:/m.test(salida)) {
      console.error(`\nLa base rechazó una sentencia de la prueba:\n${salida}\n`);
      process.exit(1);
    }
    return salida;
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '5039955%');
    delete from public.conversaciones where telefono like '5039955%';
  `);
limpiar();

/*
 * Cuatro hilos que cubren lo que hay que probar:
 *
 *   ACTIVA      de WhatsApp, a la vista. El caso fácil.
 *   ARCHIVADA   no se ve sin tocar el filtro de archivadas.
 *   INSTAGRAM   no se ve si alguien dejó puesta la pestaña de WhatsApp.
 *   OTRA        para comprobar que la búsqueda de verdad descarta.
 */
sql(`
  insert into public.conversaciones
    (telefono, nombre_perfil, canal, archivada, ultimo_mensaje_en, ultimo_texto)
  values
    ('50399550001', 'Majo Buscable',   'whatsapp',  false, now() - interval '5 minutes', 'Quiero el horario del sábado'),
    ('50399550002', 'Perdida Archivo', 'whatsapp',  true,  now() - interval '9 days',    'Gracias'),
    ('50399550003', 'Insta Buscable',  'instagram', false, now() - interval '1 hour',    'Hola por IG'),
    ('50399550004', 'Nadie Importante','whatsapp',  false, now() - interval '2 hours',   'ok');
`);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/busq-${n}.png` });
const hilos = async () => (await p.locator("main button.row").allInnerTexts()).join(" | ");
const caja = () => p.getByRole("searchbox", { name: "Buscar una conversación" });

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

console.log("── la barra está ──");
{
  await foto("1-barra");
  es("hay una caja de búsqueda", await caja().count(), 1);
  es("con su ayuda escrita", await caja().getAttribute("placeholder"), "Buscar por nombre, teléfono o mensaje");
}

console.log("\n── busca por nombre ──");
{
  await caja().fill("Majo");
  await p.waitForTimeout(900);
  await foto("2-por-nombre");

  const t = await hilos();
  es("queda la que se buscó", /Majo Buscable/.test(t), true);
  es("Y SE VAN LAS DEMÁS", /Nadie Importante/.test(t), false);
}

console.log("\n── ENCUENTRA LO ARCHIVADO ──");
{
  /*
   * Sin esto, buscar a alguien que se archivó hace un mes no lo encontraría y
   * quien busca concluiría que no está en el CRM.
   */
  await caja().fill("Perdida");
  await p.waitForTimeout(900);
  await foto("3-archivada");

  es("aparece aunque esté archivada", /Perdida Archivo/.test(await hilos()), true);
}

console.log("\n── Y ENCUENTRA EN OTRA RED ──");
{
  // Se deja puesta la pestaña de WhatsApp, que es como se trabaja, y se busca
  // a alguien de Instagram.
  await caja().fill("");
  await p.waitForTimeout(600);
  await p.locator('main button[title*="WhatsApp"]').first().click();
  await p.waitForTimeout(900);
  es("con el filtro puesto, la de Instagram no está", /Insta Buscable/.test(await hilos()), false);

  await caja().fill("Insta");
  await p.waitForTimeout(900);
  await foto("4-otra-red");

  es("PERO BUSCÁNDOLA SÍ APARECE", /Insta Buscable/.test(await hilos()), true);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y se avisa que se buscó en todo", /buscando en todas las redes/.test(t), true);
}

console.log("\n── por teléfono, escrito de cualquier forma ──");
{
  await caja().fill("7100-0001");
  await p.waitForTimeout(900);
  es("no encuentra un número que no es", /Majo Buscable/.test(await hilos()), false);

  await caja().fill("9955 0001");
  await p.waitForTimeout(900);
  await foto("5-por-telefono");
  es("Y SÍ EL QUE ES, CON ESPACIOS", /Majo Buscable/.test(await hilos()), true);
}

console.log("\n── por lo último que se dijo ──");
{
  await caja().fill("horario del sábado");
  await p.waitForTimeout(900);
  es("encuentra por el mensaje", /Majo Buscable/.test(await hilos()), true);
}

console.log("\n── cuando no hay nada, lo dice ──");
{
  await caja().fill("zzzznoexiste");
  await p.waitForTimeout(900);
  await foto("6-sin-resultados");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("avisa que no hay", /No hay ninguna conversación con eso/.test(t), true);
  es("y la lista queda vacía", (await p.locator("main button.row").count()), 0);
}

console.log("\n── al borrarla, los filtros vuelven a mandar ──");
{
  /*
   * Es la otra mitad: la búsqueda pasa por encima de los filtros MIENTRAS hay
   * algo escrito. Si al borrarla no volvieran, la pestaña de WhatsApp habría
   * quedado encendida sin efecto y nadie entendería por qué.
   */
  await caja().fill("");
  await p.waitForTimeout(1200);
  await foto("7-vuelven-los-filtros");

  const t = await hilos();
  es("vuelve a verse la de WhatsApp", /Majo Buscable/.test(t), true);
  es("Y VUELVE A ESCONDERSE LA DE INSTAGRAM", /Insta Buscable/.test(t), false);
  es("y la archivada tampoco está", /Perdida Archivo/.test(t), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql("select count(*) from public.conversaciones where telefono like '5039955%';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
