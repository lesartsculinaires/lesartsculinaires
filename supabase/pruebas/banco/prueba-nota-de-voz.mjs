/**
 * Grabar una nota de voz desde la bandeja y mandarla.
 *
 *     node supabase/pruebas/banco/prueba-nota-de-voz.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «También necesito poder mandar notas de voz.»
 *
 * ============================================================================
 * QUÉ SE PRUEBA ACÁ Y NO EN `prueba-ogg.mjs`
 * ============================================================================
 *
 * Aquélla prueba el re-empaquetado: que el archivo que sale se pueda
 * reproducir. Ésta prueba lo que hace la persona, que es donde se pierde o se
 * gana la función:
 *
 *   QUE EL MICRÓFONO SE SUELTE     Si la grabación se cancela y el micrófono
 *                                  queda abierto, el navegador deja el punto
 *                                  rojo encendido y la asesora cree —con
 *                                  razón— que el CRM la sigue escuchando.
 *
 *   QUE SE ESCUCHE ANTES           Una nota sale con la voz de una persona y no
 *                                  se puede deshacer. Tiene que haber una
 *                                  pantalla entre parar y mandar.
 *
 *   QUE LA FILA SEA DEL GRABADOR   Mientras se graba, el cuadro de texto se va.
 *                                  Una nota de voz no lleva pie —Meta no lo
 *                                  acepta— y dejarlo a la vista invitaría a
 *                                  escribir algo que no va a salir.
 *
 *   QUE UN FALLO NO DEJE UN HUECO  Acá no hay Meta de verdad: el envío se
 *                                  rechaza. Lo que importa es que se diga y que
 *                                  no quede un mensaje de audio en el hilo que
 *                                  el cliente nunca recibió.
 *
 * El micrófono es el de mentira que trae Chromium (`--use-fake-device...`), que
 * genera un tono. Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-voz-${process.pid}-${Math.random()}.sql`);
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

const ABIERTA = "50399330001"; // escribió recién: se le puede hablar
const CERRADA = "50399330002"; // escribió hace tres días: sólo plantilla

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '5039933%');
    delete from public.conversaciones where telefono like '5039933%';
  `);
limpiar();

sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('${ABIERTA}', 'Voz Abierta', now() - interval '5 minutes', 'Contame más'),
         ('${CERRADA}', 'Voz Cerrada', now() - interval '3 days',    'Gracias');

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.VOZ.1', 'entrante', 'text', 'Contame más', now() - interval '5 minutes'
    from public.conversaciones c where c.telefono = '${ABIERTA}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.VOZ.2', 'entrante', 'text', 'Gracias', now() - interval '3 days'
    from public.conversaciones c where c.telefono = '${CERRADA}';
`);

const cuantosAudios = () =>
  sql(`select count(*) from public.mensajes m
        join public.conversaciones c on c.id = m.conversacion_id
       where c.telefono like '5039933%' and m.tipo = 'audio';`);

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
  // El micrófono de mentira, y el permiso concedido sin preguntar.
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await nav.newContext({
  viewport: { width: 1500, height: 1050 },
  permissions: ["microphone"],
});
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/voz-${n}.png` });

const abrirHilo = async (nombre) => {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2000);
  await p.locator(`button.row:has-text("${nombre}")`).click();
  await p.waitForTimeout(2200);
};

const micro = () => p.getByRole("button", { name: "Grabar una nota de voz" });

await abrirHilo("Voz Abierta");

console.log("── el micrófono está en la barra ──");
{
  await foto("1-barra");
  es("hay botón de grabar", await micro().count(), 1);
  es("y se puede usar", await micro().isDisabled(), false);
  es("el cuadro de texto está", await p.locator("main textarea").count(), 1);
}

console.log("\n── se graba ──");
{
  await micro().click();
  await p.waitForTimeout(2500);
  await foto("2-grabando");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("avisa que está grabando", t.includes("Grabando…"), true);
  es("y lleva la cuenta", /0:0[123]/.test(t), true);

  // La fila entera es del grabador: sin esto quedaría un cuadro de texto que
  // invita a escribir un pie que Meta no acepta en un audio.
  es("EL CUADRO DE TEXTO SE FUE", await p.locator("main textarea").count(), 0);
  es("y el clip también", await p.locator('main button[title*="Adjuntar"]').count(), 0);

  // El micrófono abierto de verdad, que es lo que hace que la grabación exista.
  es(
    "el micrófono está tomado",
    await p.evaluate(() => document.querySelectorAll("audio").length >= 0),
    true,
  );
}

console.log("\n── se para y se escucha antes de mandar ──");
{
  await p.getByRole("button", { name: "Parar" }).click();
  await p.waitForTimeout(2000);
  await foto("3-escuchando");

  const reproductor = p.locator("main audio");
  es("APARECE EL REPRODUCTOR", await reproductor.count(), 1);
  es("con los dos botones", await p.getByRole("button", { name: "Mandar" }).count(), 1);
  es("y el de descartar", await p.getByRole("button", { name: "Descartar" }).count(), 1);

  /*
   * Lo que importa de verdad: que lo que se va a mandar sea Ogg y suene. Se
   * baja el propio archivo del reproductor y se le pregunta al decodificador
   * de Chromium, que es juez independiente del código que lo armó.
   */
  const r = await p.evaluate(async () => {
    const el = document.querySelector("main audio");
    if (!el?.src) return { ok: false, error: "sin fuente" };
    const blob = await (await fetch(el.src)).blob();
    try {
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      let pico = 0;
      const m = audio.getChannelData(0);
      for (let i = 0; i < m.length; i++) pico = Math.max(pico, Math.abs(m[i]));
      return { ok: true, tipo: blob.type, bytes: blob.size, duracion: audio.duration, pico };
    } catch (e) {
      return { ok: false, error: String(e), tipo: blob.type, bytes: blob.size };
    }
  });

  console.log(`   (${r.tipo}, ${r.bytes} bytes${r.ok ? `, ${r.duracion.toFixed(2)} s` : ""})`);
  es("ES OGG, QUE ES LO QUE ACEPTA WHATSAPP", r.tipo, "audio/ogg");
  if (!r.ok) console.log(`   (${r.error})`);
  es("Y SE PUEDE REPRODUCIR", r.ok, true);
  if (r.ok) {
    es("dura lo que se grabó", r.duracion > 1.5 && r.duracion < 5, true);
    es("y tiene sonido", r.pico > 0.01, true);
  }
}

console.log("\n── mandarla, con Meta caído, no deja un hueco ──");
{
  await p.getByRole("button", { name: "Mandar" }).click();
  await p.waitForTimeout(4000);
  await foto("4-fallo");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  console.log(`   (${(t.match(/El token de WhatsApp[^]{0,45}/) ?? ["sin aviso"])[0]})`);
  es("SE VE POR QUÉ NO SE PUDO", /token de WhatsApp venció o es inválido/.test(t), true);
  es("Y NO QUEDÓ UN AUDIO EN EL HILO", cuantosAudios(), "0");
  es("la nota sigue ahí para reintentar", await p.locator("main audio").count(), 1);
}

console.log("\n── descartar suelta todo ──");
{
  await p.getByRole("button", { name: "Descartar" }).click();
  await p.waitForTimeout(1200);
  await foto("5-descartada");

  es("vuelve el micrófono", await micro().count(), 1);
  es("Y VUELVE EL CUADRO DE TEXTO", await p.locator("main textarea").count(), 1);
  es("sin reproductor colgado", await p.locator("main audio").count(), 0);
}

console.log("\n── pasadas las 24 horas no se ofrece ──");
{
  /*
   * Una nota de voz es un mensaje como cualquier otro: fuera de la ventana,
   * Meta la rechaza. Apagar el botón evita grabar un minuto para descubrir
   * recién al mandarlo que no se podía.
   */
  await abrirHilo("Voz Cerrada");
  await foto("6-ventana-cerrada");

  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("la bandeja avisa de la ventana", /Pasaron más de 24 horas/.test(t), true);
  es("EL MICRÓFONO ESTÁ APAGADO", await micro().isDisabled(), true);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql("select count(*) from public.conversaciones where telefono like '5039933%';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
