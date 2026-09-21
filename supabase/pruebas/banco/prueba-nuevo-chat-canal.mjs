/**
 * «Nuevo chat»: elegir el canal, y encontrar a alguien por su @usuario.
 *
 *     node supabase/pruebas/banco/prueba-nuevo-chat-canal.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Quiero que coloques en esta ventana otra casilla que diga tipo de canal y lo
 * busque por usuario de Messenger o de Instagram o por el número y nombre de la
 * persona en WhatsApp.»
 *
 * ============================================================================
 * POR QUÉ LOS DOS LADOS NO HACEN LO MISMO, Y POR QUÉ ESO SE PRUEBA
 * ============================================================================
 *
 * Meta no deja lo mismo en los dos, así que la ventana tampoco puede.
 *
 *   WHATSAPP    Se le puede escribir primero a alguien que nunca escribió, con
 *               una plantilla aprobada. Se busca en todo el CRM.
 *
 *   INSTAGRAM   La conversación la empieza siempre la persona, y no hay forma
 *               de preguntarle a Meta quién es «@sofi.mtz»: su identificador
 *               aparece recién con su primer mensaje. Entonces acá sólo se
 *               puede ABRIR UN HILO QUE YA EXISTE.
 *
 * Lo que se prueba es justamente que la pantalla no prometa de más: que en
 * Instagram no aparezca el botón de abrir un chat nuevo, que lo diga con
 * palabras, y que el buscador encuentre por la arroba —que es lo único que se
 * sabe de un lead de Instagram—.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142 con
 * `INSTAGRAM_TOKEN` e `INSTAGRAM_ACCOUNT_ID` puestos, que es lo que enciende la
 * pestaña de Instagram.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `nch-${process.pid}-${Math.random()}.sql`);
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

const IGSID = "17841400088330007";
const USUARIO = "sofi.pruebanc";
const PERFIL = "Sofia Prueba NC";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IGSID}');
    delete from public.conversaciones where identificador = '${IGSID}';
  `);
limpiar();

/*
 * Un hilo de Instagram con su arroba, de hace dos días.
 *
 * Dos días importa: en Instagram la ventana es de siete, así que el hilo está
 * vivo. Con uno vencido la prueba podría pasar por el motivo equivocado.
 */
sql(`
  insert into public.conversaciones
    (telefono, identificador, usuario, nombre_perfil, canal, ultimo_mensaje_en, ultimo_texto)
  values
    (null, '${IGSID}', '${USUARIO}', '${PERFIL}', 'instagram',
     now() - interval '2 days', 'Hola, me interesa un curso');

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.NC.' || c.id, 'entrante', 'text', 'Hola, me interesa un curso',
         now() - interval '2 days'
    from public.conversaciones c where c.identificador = '${IGSID}';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nuevochat-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

await p.getByRole("button", { name: "+ Nuevo chat" }).click();
await p.waitForTimeout(900);
const dlg = p.getByRole("dialog", { name: "Nuevo chat" });

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. LA CASILLA DE CANAL ESTÁ, CON LAS CUATRO REDES ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await foto("1-abierta");
  es("hay cuatro canales para elegir", await dlg.locator("button[data-canal-nuevo]").count(), 4);
  es(
    "arranca en WhatsApp",
    await dlg.locator('button[data-canal-nuevo="whatsapp"]').getAttribute("aria-pressed"),
    "true",
  );
  /*
   * Los que no están conectados se ven pero no se tocan.
   *
   * Esconderlos perdería el dato de que existen y están previstos; dejarlos
   * tocables llevaría a una lista vacía sin explicación.
   */
  /*
   * Messenger ya se puede elegir.
   *
   * Cuando se escribió esta prueba, Messenger todavía no estaba conectado y acá
   * se comprobaba que estuviera apagado. Al conectarlo hubo que venir a
   * cambiarlo, que es lo que se quería: una red nueva no puede encenderse sin
   * que alguien mire si la pantalla sigue diciendo la verdad.
   */
  es(
    "MESSENGER YA SE PUEDE ELEGIR",
    await dlg.locator('button[data-canal-nuevo="messenger"]').isDisabled(),
    false,
  );
  es(
    "y TikTok sigue apagado, que no depende de nosotros",
    await dlg.locator('button[data-canal-nuevo="tiktok"]').isDisabled(),
    true,
  );
  es(
    "INSTAGRAM SÍ SE PUEDE ELEGIR",
    await dlg.locator('button[data-canal-nuevo="instagram"]').isDisabled(),
    false,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. en WhatsApp busca como siempre ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "el buscador pide nombre, código o teléfono",
    await dlg.getByPlaceholder(/Nombre, código o teléfono/).count(),
    1,
  );
  es(
    "y avisa que después se puede mandar una plantilla",
    /vas a poder mandarle una plantilla/.test(await texto()),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EN INSTAGRAM SE BUSCA POR LA ARROBA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await dlg.locator('button[data-canal-nuevo="instagram"]').click();
  await p.waitForTimeout(700);
  await foto("2-instagram");

  es("el buscador cambia a @usuario o nombre", await dlg.getByPlaceholder(/@usuario o nombre/).count(), 1);

  const t = await texto();
  es("DICE QUE NO SE PUEDE ESCRIBIR PRIMERO", /no deja escribir primero/.test(t), true);
  es("y que no hay plantillas", /no hay plantillas/.test(t), true);

  /*
   * El botón de abrir un chat nuevo NO puede estar.
   *
   * Es la mitad que importa de todo esto: en Instagram no hay nada que abrir
   * que no exista ya, y un botón ahí sería una promesa que Meta no cumple.
   */
  es(
    "no ofrece abrir un chat que no existe",
    await dlg.getByRole("button", { name: /Abrir chat sin enviar|Dar de alta/ }).count(),
    0,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y ENCUENTRA EL HILO POR SU @USUARIO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await dlg.getByPlaceholder(/@usuario o nombre/).fill(USUARIO);
  await p.waitForTimeout(900);
  await foto("3-encontrado");

  const filas = dlg.locator("button.row");
  es("aparece una conversación", await filas.count(), 1);
  es("con el nombre del perfil", (await filas.first().innerText()).includes(PERFIL), true);
  es("y su arroba", (await filas.first().innerText()).includes(`@${USUARIO}`), true);

  // Escribiendo la arroba también, que es como se copia de un perfil.
  await dlg.getByPlaceholder(/@usuario o nombre/).fill(`@${USUARIO}`);
  await p.waitForTimeout(800);
  es("CON LA ARROBA ADELANTE TAMBIÉN", await dlg.locator("button.row").count(), 1);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. y al tocarlo se abre ese hilo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await dlg.locator("button.row").first().click();
  await p.waitForTimeout(2600);
  await foto("4-abierto");

  const t = await texto();
  es("la ventana se cerró", await p.getByRole("dialog", { name: "Nuevo chat" }).count(), 0);
  es("Y QUEDÓ ABIERTO EL HILO DE ESA PERSONA", new RegExp(`@?${USUARIO}`).test(t), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. la casilla de plantilla sigue estando en WhatsApp ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Ya existía antes de este cambio, pero aparece recién al elegir a la persona
// —por eso la escuela no la veía—. Que siga apareciendo es lo que se comprueba.
{
  await p.getByRole("button", { name: "+ Nuevo chat" }).click();
  await p.waitForTimeout(800);
  const d2 = p.getByRole("dialog", { name: "Nuevo chat" });

  await d2.getByPlaceholder(/Nombre, código o teléfono/).fill("a");
  await p.waitForTimeout(900);

  const hay = await d2.locator("button.row").count();
  if (hay === 0) {
    console.log("   (sin contactos que empiecen con «a» en el banco; se salta)");
  } else {
    await d2.locator("button.row").first().click();
    await p.waitForTimeout(900);
    await foto("5-plantilla");
    const t = await texto();
    es("aparece «Con qué le escribimos»", /Con qué le escribimos/.test(t), true);
    es("con su selector de plantilla", await d2.locator("select").count() >= 1, true);
  }
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql(`select count(*) from public.conversaciones where identificador = '${IGSID}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
