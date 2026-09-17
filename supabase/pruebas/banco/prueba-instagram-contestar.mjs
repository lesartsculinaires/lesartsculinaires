/**
 * ¿Se puede CONTESTAR por Instagram desde la bandeja?
 *
 *     node supabase/pruebas/banco/prueba-instagram-contestar.mjs
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO NO EXISTÍA, Y POR QUÉ HACÍA FALTA
 * ============================================================================
 *
 * `prueba-instagram.mjs` prueba que el mensaje ENTRA: se le manda al webhook una
 * carga firmada y después se mira la base. Esa mitad estaba cubierta.
 *
 * La otra mitad —la que la escuela pregunta primero, «¿puedo contestarle?»— no
 * se podía probar. La respuesta sale contra `graph.facebook.com`, y no había
 * forma de interceptarla sin una cuenta real de Meta. WhatsApp sí tenía cómo
 * (`WHATSAPP_GRAPH_URL` manda el envío a un Meta de mentira local); Instagram no.
 *
 * Ahora existe `INSTAGRAM_GRAPH_URL`, con la misma regla: sólo acepta una
 * dirección de esta misma máquina, porque por ahí viaja el token de la escuela.
 *
 * ============================================================================
 * QUÉ SE MIRA, Y POR QUÉ ESO Y NO OTRA COSA
 * ============================================================================
 *
 *   A QUIÉN LE LLEGÓ          `recipient.id` tiene que ser el IGSID de esa
 *                             persona. Es el error que no se ve: si se mandara
 *                             el id de la conversación o el del cliente, Meta
 *                             contestaría 200 igual y el mensaje no llegaría a
 *                             nadie.
 *
 *   CON QUÉ ETIQUETA          `HUMAN_AGENT`. Es lo que abre los siete días en
 *                             vez de 24 horas. Sin ella, contestar el día tres
 *                             se rechaza, y ése es el caso normal de la escuela.
 *
 *   QUEDÓ EN EL HILO          Con el `message_id` que devolvió Meta. Sin eso no
 *                             hay con qué seguirle el estado después.
 *
 *   NO SE OFRECE REACCIONAR   Instagram avisa las reacciones que manda el
 *                             cliente, pero su API no deja mandar una desde
 *                             afuera. El botón no tiene que estar: ofrecerlo
 *                             sería prometer algo que siempre falla.
 *
 * Necesita el banco armado (`armar.sh`), el Meta de mentira en 3144 y la
 * aplicación en 3142 con `INSTAGRAM_GRAPH_URL=http://127.0.0.1:3144`,
 * `INSTAGRAM_TOKEN`, `INSTAGRAM_ACCOUNT_ID` y `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const SECRETO = "secreto-de-prueba";
const PUERTO_META = 3144;
const URL = "http://127.0.0.1:3142/api/instagram/webhook";

/** El mismo valor que `.env.local` le da a la aplicación. */
const CUENTA = "17841400000000000";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `igc-${process.pid}-${Math.random()}.sql`);
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

const marca = Date.now();
const IGSID = `17841400CONTESTAR${marca}`.slice(0, 24);
const MID = `aWdfZG1fCONTESTAR${marca}`;
const LO_QUE_ESCRIBIO = `Hola, quiero info del diplomado ${marca}`;
const LA_RESPUESTA = `Con gusto te cuento ${marca}`;

/*
 * Se limpia por IGSID y no por nombre.
 *
 * La ficha que abre el webhook se llama «Contacto de Instagram» —en el banco no
 * hay Meta a quien preguntarle el nombre de perfil— y hay una por cada persona
 * de Instagram sin nombre. Borrar por ese nombre se llevaría puestas las de
 * otras pruebas; el IGSID sí es de ésta sola.
 */
const limpiar = () => {
  sql(`
    create temporary table if not exists _igc as
      select cliente_id from public.contactos_canal where identificador = '${IGSID}';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IGSID}');
    delete from public.conversaciones where identificador = '${IGSID}'
       or cliente_id in (select cliente_id from _igc);
    delete from public.contactos_canal where identificador = '${IGSID}';
    delete from public.oportunidades where cliente_id in (select cliente_id from _igc);
    delete from public.clientes where id in (select cliente_id from _igc);
    drop table if exists _igc;
  `);
};
limpiar();

/** Le manda al webhook una carga firmada como la firma Meta. */
const comoMeta = async (carga) => {
  const cuerpo = JSON.stringify(carga);
  const firma =
    "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

const loQueLlegoAMeta = async () =>
  await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json();

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. entra el mensaje de la persona ──");
// ══════════════════════════════════════════════════════════════════════════

es(
  "el webhook lo acepta",
  await comoMeta({
    object: "instagram",
    entry: [
      {
        id: CUENTA,
        time: Date.now(),
        messaging: [
          {
            sender: { id: IGSID },
            recipient: { id: CUENTA },
            timestamp: Date.now(),
            message: { mid: MID, text: LO_QUE_ESCRIBIO },
          },
        ],
      },
    ],
  }),
  200,
);

es(
  "y abrió el hilo de Instagram",
  sql(
    `select canal from public.conversaciones where identificador = '${IGSID}';`,
  ),
  "instagram",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LA ASESORA CONTESTA DESDE LA BANDEJA ──");
// ══════════════════════════════════════════════════════════════════════════

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2500);

// Se busca por el texto del mensaje, que lleva la marca de tiempo y por lo
// tanto es de esta corrida y de ninguna otra.
await p.getByPlaceholder("Buscar por nombre, teléfono o mensaje").fill(String(marca));
await p.waitForTimeout(1800);

es("el hilo aparece en la bandeja", await p.locator("main button.row").count(), 1);

await p.locator("main button.row").first().click();
await p.waitForTimeout(2000);

const caja = p.getByPlaceholder(/Escribí tu respuesta/);
es("el cuadro de escribir está habilitado", await caja.isEnabled(), true);

const antes = (await loQueLlegoAMeta()).length;

await caja.fill(LA_RESPUESTA);
await caja.press("Enter");
await p.waitForTimeout(3000);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. QUÉ LE LLEGÓ A META ──");
// ══════════════════════════════════════════════════════════════════════════

const recibidos = await loQueLlegoAMeta();
es("salió exactamente un envío", recibidos.length - antes, 1);

const envio = recibidos[recibidos.length - 1] ?? {};

es("le pegó a la cuenta de Instagram, no a la de WhatsApp", envio.url, `/v21.0/${CUENTA}/messages`);
es("A QUIÉN: el IGSID de esa persona", envio.cuerpo?.recipient?.id, IGSID);
es("QUÉ: lo que escribió la asesora", envio.cuerpo?.message?.text, LA_RESPUESTA);
es("CON LA ETIQUETA QUE ABRE LOS SIETE DÍAS", envio.cuerpo?.tag, "HUMAN_AGENT");
es("y el tipo que la acompaña", envio.cuerpo?.messaging_type, "MESSAGE_TAG");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y QUEDÓ EN EL HILO ──");
// ══════════════════════════════════════════════════════════════════════════

es(
  "la respuesta quedó guardada como saliente",
  sql(`
    select direccion from public.mensajes
     where conversacion_id = (select id from public.conversaciones
                               where identificador = '${IGSID}')
       and texto = '${LA_RESPUESTA}';
  `),
  "saliente",
);

es(
  "CON EL IDENTIFICADOR QUE DEVOLVIÓ META",
  sql(`
    select case when wa_id like 'mid.FALSO%' then 'si' else coalesce(wa_id, 'sin id') end
      from public.mensajes
     where conversacion_id = (select id from public.conversaciones
                               where identificador = '${IGSID}')
       and texto = '${LA_RESPUESTA}';
  `),
  "si",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. lo que Instagram NO deja hacer, no se ofrece ──");
// ══════════════════════════════════════════════════════════════════════════

/*
 * Meta avisa por el webhook cuando alguien reacciona a un mensaje nuestro, y
 * esas reacciones se ven en el hilo. Lo que su API no tiene es cómo MANDAR una
 * desde afuera de la aplicación.
 *
 * Así que el botón no puede estar. Si estuviera, el asesor tocaría un emoji, no
 * pasaría nada, y el que quedaría mal es el CRM.
 */
es(
  "no hay botón de reaccionar en un hilo de Instagram",
  await p.locator('main button[title*="eaccion"]').count(),
  0,
);

es("y la pantalla no tiró ningún error", errores, []);

await nav.close();
limpiar();

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
