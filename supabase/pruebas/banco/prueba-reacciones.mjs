/**
 * Las reacciones: las que pone el cliente y las que ponemos nosotros.
 *
 *     node supabase/pruebas/banco/prueba-reacciones.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Le hacen falta más acciones que WhatsApp Business tiene, como las
 * reacciones a cada mensaje.»
 *
 * ------------------------------------------------------------------------
 * LAS TRES COSAS QUE SÓLO SE VEN CORRIENDO ESTO
 * ------------------------------------------------------------------------
 *
 *   QUE LA DEL CLIENTE NO SEA UN MENSAJE   Entra por el webhook real, firmada,
 *                                          como la manda Meta. Si se colara al
 *                                          hilo, la conversación se llenaría de
 *                                          burbujas vacías —una por corazón—.
 *
 *   QUE UN ENVÍO FALLIDO NO MIENTA         Acá no hay Meta de verdad, así que
 *                                          reaccionar falla. Lo que se prueba
 *                                          es que ese fallo se vea y que NO
 *                                          quede una reacción guardada: una
 *                                          pastilla en pantalla que el cliente
 *                                          nunca vio es peor que un error.
 *
 *   QUE NADIE PUEDA FABRICAR UNA DEL       La política sólo deja escribir las
 *   CLIENTE                                nuestras. Sin eso, cualquiera con la
 *                                          sesión abierta podría poner desde el
 *                                          inspector un ❤️ del cliente sobre la
 *                                          cotización, y quedaría en el hilo
 *                                          como si fuera suyo.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-reac-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50399220001";
const WA_NUESTRO = "wamid.PRUEBA.NUESTRO";

const limpiar = () =>
  sql(`
    delete from public.reacciones where mensaje_id in
      (select id from public.mensajes where wa_id like 'wamid.PRUEBA.%');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
  `);
limpiar();

// Un hilo con un mensaje nuestro —al que el cliente va a reaccionar— y uno
// suyo reciente, que es lo que mantiene abierta la ventana de 24 horas.
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('${TEL}', 'Reaccion Prueba', now() - interval '2 minutes', 'Perfecto, gracias');

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en)
  select c.id, '${WA_NUESTRO}', 'saliente', 'text',
         'Te paso la información del diplomado', 'entregado', now() - interval '10 minutes'
    from public.conversaciones c where c.telefono = '${TEL}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.PRUEBA.SUYO', 'entrante', 'text', 'Perfecto, gracias',
         now() - interval '2 minutes'
    from public.conversaciones c where c.telefono = '${TEL}';

  insert into public.mensajes (conversacion_id, direccion, tipo, texto, privado, creado_en)
  select c.id, 'saliente', 'text', 'Ojo: pidió descuento', true, now() - interval '1 minute'
    from public.conversaciones c where c.telefono = '${TEL}';
`);

/** Le manda al webhook una carga firmada, como hace Meta. */
async function comoMeta(mensaje) {
  const carga = {
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: "111" },
      contacts: [{ profile: { name: "Reaccion Prueba" }, wa_id: TEL }],
      messages: [mensaje],
    } }] }],
  };
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex");
  const r = await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  await new Promise((s) => setTimeout(s, 700));
  return r.status;
}

const cuantasReacciones = (direccion) =>
  sql(`select count(*) from public.reacciones r
        join public.mensajes m on m.id = r.mensaje_id
       where m.wa_id = '${WA_NUESTRO}' and r.direccion = '${direccion}';`);

const emojiDe = (direccion) =>
  sql(`select coalesce(max(r.emoji), '—') from public.reacciones r
        join public.mensajes m on m.id = r.mensaje_id
       where m.wa_id = '${WA_NUESTRO}' and r.direccion = '${direccion}';`);

const cuantosMensajes = () =>
  sql(`select count(*) from public.mensajes m
        join public.conversaciones c on c.id = m.conversacion_id
       where c.telefono = '${TEL}';`);

console.log("── el cliente reacciona a nuestro mensaje ──");
{
  const antes = cuantosMensajes();
  es(
    "el webhook lo acepta",
    await comoMeta({
      from: TEL, id: "wamid.PRUEBA.R1", timestamp: String(Math.floor(Date.now() / 1000)),
      type: "reaction", reaction: { message_id: WA_NUESTRO, emoji: "🙏" },
    }),
    200,
  );

  es("SE GUARDÓ LA REACCIÓN", cuantasReacciones("entrante"), "1");
  es("con su emoji", emojiDe("entrante"), "🙏");
  es("Y NO ENTRÓ NINGÚN MENSAJE NUEVO", cuantosMensajes(), antes);
}

console.log("\n── cambia de opinión: reemplaza, no acumula ──");
{
  await comoMeta({
    from: TEL, id: "wamid.PRUEBA.R2", timestamp: String(Math.floor(Date.now() / 1000)),
    type: "reaction", reaction: { message_id: WA_NUESTRO, emoji: "❤️" },
  });
  es("sigue habiendo una sola", cuantasReacciones("entrante"), "1");
  es("y ahora es la nueva", emojiDe("entrante"), "❤️");
}

console.log("\n── reacciona a algo que el CRM no tiene ──");
{
  // Un mensaje anterior al CRM. No hay dónde ponerla y no es un error.
  es(
    "el webhook contesta bien igual",
    await comoMeta({
      from: TEL, id: "wamid.PRUEBA.R3", timestamp: String(Math.floor(Date.now() / 1000)),
      type: "reaction", reaction: { message_id: "wamid.QUE.NO.EXISTE", emoji: "👍" },
    }),
    200,
  );
  es("y no inventa nada", sql("select count(*) from public.reacciones where emoji = '👍';"), "0");
}

// ------------------------------------------------------------------ pantalla

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/reacciones-${n}.png` });

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2000);
await p.locator('button.row:has-text("Reaccion Prueba")').click();
await p.waitForTimeout(2500);
await foto("1-hilo");

console.log("\n── se ve en el hilo ──");
{
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("LA REACCIÓN DEL CLIENTE ESTÁ A LA VISTA", t.includes("❤️"), true);
  es("y el mensaje sigue siendo el mensaje", t.includes("Te paso la información del diplomado"), true);
  // Lo que NO tiene que haber: una burbuja de más por la reacción.
  es("sin burbujas vacías", (t.match(/Mensaje(?![s\wáéíóú])/g) ?? []).length, 0);
}

console.log("\n── el botón de reaccionar, donde corresponde ──");
{
  const botones = await p.getByRole("button", { name: "Reaccionar a este mensaje" }).count();
  console.log(`   (${botones} mensajes se pueden reaccionar)`);

  /*
   * Dos, y no tres.
   *
   * En el hilo hay tres mensajes: el nuestro, el del cliente y una nota
   * interna. Los dos primeros se pueden reaccionar. La nota no: no existe en
   * WhatsApp, así que no hay a quién mandarle la reacción ni sobre qué
   * ponerla, y ofrecerlo terminaría en un error que nadie puede resolver.
   */
  es("SÓLO EN LOS QUE EXISTEN EN WHATSAPP", botones, 2);
}

console.log("\n── elegir el emoji ──");
{
  await p.getByRole("button", { name: "Reaccionar a este mensaje" }).first().click();
  await p.waitForTimeout(600);
  await foto("2-eligiendo");

  const barra = p.getByRole("menu", { name: "Reaccionar" });
  es("se abren los seis de siempre", await barra.locator("button").count(), 7); // seis y el «＋»
  es("con el pulgar primero", await barra.locator("button").first().innerText(), "👍");

  console.log("\n   ── y el teclado entero a un clic ──");
  await barra.getByRole("menuitem", { name: "Todos los emojis" }).click();
  await p.waitForTimeout(600);
  es("aparece el buscador", await p.getByRole("dialog", { name: "Elegir un emoji" }).count(), 1);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
}

console.log("\n── un envío que falla no deja una pastilla mentirosa ──");
{
  /*
   * Acá no hay Meta: el token es de mentira y el envío se rechaza. Lo que se
   * comprueba es lo que pasa después de ese rechazo, que es lo que importa —una
   * reacción guardada que el cliente nunca vio haría creer a la asesora que
   * del otro lado se enteraron—.
   */
  await p.getByRole("button", { name: "Reaccionar a este mensaje" }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("menuitem", { name: "Reaccionar con 👍" }).click();
  await p.waitForTimeout(3000);
  await foto("3-fallo");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  console.log(`   (${(t.match(/El token de WhatsApp[^]{0,50}/) ?? ["sin aviso"])[0]})`);
  es("SE VE POR QUÉ NO SE PUDO", /token de WhatsApp venció o es inválido/.test(t), true);
  es("Y NO QUEDÓ GUARDADA", cuantasReacciones("saliente"), "0");
}

console.log("\n── nadie puede fabricar una del cliente ──");
{
  /*
   * Desde el navegador, con la sesión de dirección, contra PostgREST. Es
   * exactamente lo que podría hacer alguien desde el inspector.
   */
  const r = await p.evaluate(async ({ jwt, anon }) => {
    const idMensaje = 1; // cualquiera: la política se aplica antes de mirarlo
    const res = await fetch("http://127.0.0.1:3141/rest/v1/reacciones", {
      method: "POST",
      headers: {
        apikey: anon,
        authorization: "Bearer " + jwt,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ mensaje_id: idMensaje, direccion: "entrante", emoji: "❤️" }),
    });
    return { estado: res.status, cuerpo: (await res.text()).slice(0, 200) };
  }, {
    jwt,
    anon: fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/anon.txt", "utf8").trim(),
  });

  console.log(`   (HTTP ${r.estado})`);
  es("LA BASE LO RECHAZA", r.estado >= 400, true);
  es("y sigue habiendo una sola del cliente", cuantasReacciones("entrante"), "1");
}

console.log("\n── el cliente saca la reacción ──");
{
  await comoMeta({
    from: TEL, id: "wamid.PRUEBA.R4", timestamp: String(Math.floor(Date.now() / 1000)),
    type: "reaction", reaction: { message_id: WA_NUESTRO },
  });
  es("SE FUE DE LA BASE", cuantasReacciones("entrante"), "0");

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2000);
  await p.locator('button.row:has-text("Reaccion Prueba")').click();
  await p.waitForTimeout(2500);
  await foto("4-sin-reaccion");
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y de la pantalla", t.includes("❤️"), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura de la prueba", sql(`select count(*) from public.conversaciones where telefono = '${TEL}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
