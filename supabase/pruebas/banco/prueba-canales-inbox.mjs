/**
 * La bandeja con varias redes: ¿está el lugar de Instagram, Messenger y TikTok?
 *
 *     node supabase/pruebas/banco/prueba-canales-inbox.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Quiero colocar a futuro la API de Instagram, Facebook y TikTok en el CRM.
 * ¿Podrías dejar los espacios en el Inbox para poder intercambiar, y las
 * mismas opciones que hicimos con WhatsApp?»
 *
 * ============================================================================
 * LO QUE SE PRUEBA
 * ============================================================================
 *
 *   QUE EL LUGAR ESTÉ            Las cuatro redes en la fila de arriba, con las
 *                                que no andan marcadas como tales.
 *
 *   QUE DIGA QUÉ FALTA           Una pestaña apagada sin explicación es peor
 *                                que no tenerla. Al tocarla tiene que decir qué
 *                                hay que hacer y quién.
 *
 *   QUE LA PANTALLA CAMBIE       Es lo que de verdad prueba que la bandeja dejó
 *   SEGÚN LA RED                 de estar escrita sólo para WhatsApp: un hilo
 *                                de Instagram no ofrece plantillas —no existen
 *                                ahí— y su ventana dura siete días, no 24
 *                                horas.
 *
 *   QUE WHATSAPP NO CAMBIE       Todo lo de antes sigue igual: es lo que se
 *                                usa todos los días.
 *
 * La conversación de Instagram se inserta a mano, y desde que el canal está
 * implementado se inserta como sería de verdad: SIN teléfono, con su IGSID en
 * `identificador` y su @usuario. Nada de esto habla con Meta.
 *
 * ============================================================================
 * QUÉ CAMBIÓ AL CONECTAR INSTAGRAM
 * ============================================================================
 *
 * Este archivo se escribió cuando las cuatro redes eran un lugar reservado y
 * ninguna andaba salvo WhatsApp. Instagram ya está implementado —webhook, envío
 * y la identidad del hilo en la base— así que su pestaña dejó de explicar qué
 * falta y pasó a filtrar, como la de WhatsApp.
 *
 * Las comprobaciones de «qué falta» se mudaron a Messenger, que sigue siendo lo
 * que Instagram era: algo que se enciende en el mismo panel de Meta. Lo que NO
 * se movió es lo que distingue a Instagram de WhatsApp —sin plantillas, siete
 * días de ventana—, que ahora se comprueba donde importa: adentro del hilo.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-canal-${process.pid}-${Math.random()}.sql`);
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

const IGSID = "17841400099440002";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones
        where telefono like '5039944%' or identificador = '${IGSID}');
    delete from public.conversaciones
     where telefono like '5039944%' or identificador = '${IGSID}';
  `);
limpiar();

/*
 * Dos hilos: uno de WhatsApp y uno de Instagram, los dos con un mensaje de
 * hace tres días.
 *
 * Tres días es el número que separa a las dos redes: en WhatsApp ya se pasó la
 * ventana de 24 horas, en Instagram todavía quedan cuatro días de los siete.
 * Con la bandeja escrita sólo para WhatsApp, la de Instagram diría que se pasó
 * y no dejaría contestar.
 */
sql(`
  insert into public.conversaciones
    (telefono, identificador, usuario, nombre_perfil, canal, ultimo_mensaje_en, ultimo_texto)
  values
    ('50399440001', '50399440001', null, 'Canal Whatsapp', 'whatsapp',
      now() - interval '3 days', 'Hola'),
    -- El de Instagram, como es de verdad: sin teléfono. Su identidad es el
    -- IGSID y lo que se muestra es el @usuario.
    (null, '${IGSID}', 'canal.instagram', 'Canal Instagram', 'instagram',
      now() - interval '3 days', 'Hola por IG');

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.CANAL.' || c.id, 'entrante', 'text', 'Hola', now() - interval '3 days'
    from public.conversaciones c
   where c.telefono like '5039944%' or c.identificador = '${IGSID}';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/canales-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

console.log("── las cuatro redes están en la fila ──");
{
  await foto("1-fila");
  const t = await texto();
  for (const red of ["WhatsApp", "Instagram", "Messenger", "TikTok"]) {
    es(`está ${red}`, t.includes(red), true);
  }
  // Las que no andan se marcan como tales, en vez de quedar apagadas sin
  // explicación. Ahora son dos —Messenger y TikTok—: Instagram ya anda.
  es("las que faltan dicen «pronto»", (t.match(/pronto/g) ?? []).length >= 2, true);
  es(
    "Y INSTAGRAM YA NO ESTÁ ENTRE ELLAS",
    await p.locator('main button[title*="Instagram"][title*="pronto"]').count(),
    0,
  );
}

console.log("\n── al tocar una que no anda, dice qué falta ──");
{
  await p.locator('main button[title*="TikTok"]').first().click();
  await p.waitForTimeout(600);
  await foto("2-tiktok");

  const t = await texto();
  es("avisa que no está conectado", /todavía no conectado/.test(t), true);
  // TikTok es el único que no depende de la escuela: hay que ser socio
  // aprobado por ellos, no es una configuración.
  es("Y EXPLICA QUE NO ES UNA CONFIGURACIÓN", /Messaging Partner/.test(t), true);
  es("dice qué se puede y qué no", /Notas de voz/.test(t) && /Reacciones/.test(t), true);
  es(
    "y que editar no lo permite ninguna API",
    /Editar un mensaje enviado.*no lo permite la api/i.test(t),
    true,
  );
}

console.log("\n── y una que sí se puede conectar dice otra cosa ──");
{
  // Messenger es ahora lo que Instagram era: algo que se enciende en el mismo
  // panel de Meta, sin trámite con nadie.
  await p.locator('main button[title*="Messenger"]').first().click();
  await p.waitForTimeout(600);
  await foto("3-messenger");

  const t = await texto();
  es("apunta al panel de Meta", /panel de Meta/.test(t), true);
  es("y avisa que tampoco tiene plantillas", /tampoco tiene plantillas/.test(t), true);
  es("con su ventana de siete días", /[Ss]iete días/.test(t), true);
}

console.log("\n── el hilo de WhatsApp, como siempre ──");
{
  // Se sale del panel de Messenger volviendo a la pestaña de WhatsApp, que
  // ahora es un filtro de verdad y no una explicación.
  await p.locator('main button[title*="WhatsApp"]').first().click();
  await p.waitForTimeout(900);
  await p.locator('button.row:has-text("Canal Whatsapp")').click();
  await p.waitForTimeout(2200);
  await foto("4-whatsapp");

  const t = await texto();
  // Tres días: en WhatsApp la ventana de 24 horas ya se pasó.
  es("dice que se pasó la ventana", /Se pasó la ventana para contestarle por WhatsApp/.test(t), true);
  es("Y OFRECE LA PLANTILLA, que es lo único que queda", await p.locator('main select').count() >= 2, true);
  es("con el micrófono disponible", await p.getByRole("button", { name: "Grabar una nota de voz" }).count(), 1);
}

console.log("\n── el de Instagram cambia lo que hace falta ──");
{
  await p.locator('main button[title*="Instagram"]').first().click();
  await p.waitForTimeout(900);
  await p.locator('button.row:has-text("Canal Instagram")').click();
  await p.waitForTimeout(2200);
  await foto("5-hilo-instagram");

  const t = await texto();
  /*
   * El encabezado lleva el @usuario, no un número.
   *
   * Es lo que en WhatsApp resuelve el teléfono: con qué dato quien atiende
   * ubica a la persona antes de contestarle. Un IGSID no sirve para eso —son
   * diecisiete dígitos que no le dicen nada a nadie— así que no se muestra.
   */
  es("el encabezado dice por dónde se contesta", /Instagram · @canal\.instagram/.test(t), true);
  es("Y NO INVENTA UN TELÉFONO", new RegExp(`\\+?${IGSID}`).test(t), false);

  /*
   * Lo que más cambia respecto de WhatsApp, comprobado donde se trabaja.
   *
   * Se busca el selector por su rótulo y no contando `<select>`: en el
   * encabezado del hilo ya hay dos —la asesora y el estado— así que contarlos
   * daría «sí hay plantillas» en un hilo donde no las hay.
   */
  es(
    "NO OFRECE PLANTILLAS: en Instagram no existen",
    await p.getByRole("option", { name: "Mandar una plantilla…" }).count(),
    0,
  );

  /*
   * Lo que de verdad prueba que la bandeja dejó de estar escrita para
   * WhatsApp: con tres días, Instagram TODAVÍA deja contestar —de sus siete
   * días quedan cuatro— y la pantalla no muestra ningún aviso de ventana
   * cerrada.
   */
  es(
    "A LOS TRES DÍAS TODAVÍA SE PUEDE CONTESTAR",
    /Se pasó la ventana para contestarle por Instagram/.test(t),
    false,
  );
  es("y el cuadro de texto está", await p.locator("main textarea").count(), 1);
}

console.log("\n── con dos redes, cada hilo lleva su marca ──");
{
  // Con una sola red el ícono sería el mismo en las cuarenta filas y no
  // distinguiría nada. Con dos, aparece solo.
  const marcas = await p.locator('main button.row span[title="Instagram"]').count();
  console.log(`   (${marcas} filas marcadas como Instagram)`);
  es("la de Instagram está marcada", marcas >= 1, true);
}

console.log("\n── y se puede filtrar por red ──");
{
  await p.locator('main button[title*="WhatsApp"]').first().click();
  await p.waitForTimeout(900);
  await foto("6-filtrado");

  const nombres = (await p.locator("main button.row").allInnerTexts()).join(" ");
  es("queda la de WhatsApp", /Canal Whatsapp/.test(nombres), true);
  es("Y SE VA LA DE INSTAGRAM", /Canal Instagram/.test(nombres), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql("select count(*) from public.conversaciones where telefono like '5039944%';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
