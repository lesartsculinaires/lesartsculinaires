/**
 * ¿Se puede CONTESTAR por Messenger desde la bandeja?
 *
 *     node supabase/pruebas/banco/prueba-messenger-contestar.mjs
 *
 * ============================================================================
 * QUÉ SE PRUEBA, Y POR QUÉ ESTO NO ES UNA COPIA DE LA DE INSTAGRAM
 * ============================================================================
 *
 * Porque lo que puede fallar es nuevo. Contestar dejó de decidirse con un sí/no
 * de Instagram y pasó a decidirse por el CANAL del hilo, y ese reparto es código
 * que antes no existía:
 *
 *   A QUÉ PÁGINA          El envío de Messenger va contra el id de la PÁGINA de
 *                         Facebook, no contra el de la cuenta de Instagram. Si
 *                         se cruzaran, Meta contestaría un error que habla de
 *                         permisos y no de esto.
 *
 *   POR QUÉ CANAL         Con el booleano viejo, un hilo de Messenger daba
 *                         «false» y el mensaje se iba por WhatsApp, a un número
 *                         que no existe. Acá se comprueba que sale por Messenger.
 *
 *   CON QUÉ ETIQUETA      `HUMAN_AGENT`, que es la que abre los siete días en
 *                         vez de 24 horas. Sin ella, contestar el día tres se
 *                         rechaza, y ése es el caso normal de la escuela.
 *
 * Necesita el banco armado, el Meta de mentira en 3144 y la aplicación en 3142
 * con `MESSENGER_GRAPH_URL=http://127.0.0.1:3144`, `MESSENGER_TOKEN` y
 * `MESSENGER_PAGE_ID=107321267900000`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const PUERTO_META = 3144;
const PAGINA = "107321267900000";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `msnc-${process.pid}-${Math.random()}.sql`);
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
const PSID = `2461${String(marca).slice(-11)}`;
const PERFIL = `Carlos Messenger ${marca}`;
const LA_RESPUESTA = `Con gusto te cuento ${marca}`;

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${PSID}');
    delete from public.conversaciones where identificador = '${PSID}';
  `);
limpiar();

/*
 * Un hilo de Messenger de hace dos días.
 *
 * Dos días importa: la ventana es de siete, así que el hilo está vivo. Con uno
 * vencido la prueba podría pasar por el motivo equivocado.
 */
sql(`
  insert into public.conversaciones
    (telefono, identificador, usuario, nombre_perfil, canal, ultimo_mensaje_en, ultimo_texto)
  values
    (null, '${PSID}', null, '${PERFIL}', 'messenger',
     now() - interval '2 days', 'Hola, vi la página');

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'm_SEED.' || c.id, 'entrante', 'text', 'Hola, vi la página',
         now() - interval '2 days'
    from public.conversaciones c where c.identificador = '${PSID}';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/msncontestar-${n}.png` });

const loQueLlegoAMeta = async () =>
  await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json();

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2500);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. el hilo de Messenger se ve y se puede escribir ──");
// ══════════════════════════════════════════════════════════════════════════

await p.getByPlaceholder("Buscar por nombre, teléfono o mensaje").fill(String(marca));
await p.waitForTimeout(1800);

es("el hilo aparece en la bandeja", await p.locator("main button.row").count(), 1);

await p.locator("main button.row").first().click();
await p.waitForTimeout(2000);
await foto("1-hilo");

const caja = p.getByPlaceholder(/Escribí tu respuesta/);
es("el cuadro de escribir está habilitado", await caja.isEnabled(), true);

const antes = (await loQueLlegoAMeta()).length;

await caja.fill(LA_RESPUESTA);
await caja.press("Enter");
await p.waitForTimeout(3000);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. QUÉ LE LLEGÓ A META ──");
// ══════════════════════════════════════════════════════════════════════════

const recibidos = await loQueLlegoAMeta();
es("salió exactamente un envío", recibidos.length - antes, 1);

const envio = recibidos[recibidos.length - 1] ?? {};

es("LE PEGÓ A LA PÁGINA, no a la cuenta de Instagram", envio.url, `/v21.0/${PAGINA}/messages`);
es("A QUIÉN: el PSID de esa persona", envio.cuerpo?.recipient?.id, PSID);
es("QUÉ: lo que escribió la asesora", envio.cuerpo?.message?.text, LA_RESPUESTA);
es("CON LA ETIQUETA QUE ABRE LOS SIETE DÍAS", envio.cuerpo?.tag, "HUMAN_AGENT");
es("y el tipo que la acompaña", envio.cuerpo?.messaging_type, "MESSAGE_TAG");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. Y QUEDÓ EN EL HILO ──");
// ══════════════════════════════════════════════════════════════════════════

es(
  "la respuesta quedó guardada como saliente",
  sql(`
    select direccion from public.mensajes
     where conversacion_id = (select id from public.conversaciones
                               where identificador = '${PSID}')
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
                               where identificador = '${PSID}')
       and texto = '${LA_RESPUESTA}';
  `),
  "si",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. lo que Messenger NO deja hacer, no se ofrece ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Meta avisa por el webhook cuando alguien reacciona, y esas reacciones se ven
// en el hilo. Lo que su API no tiene es cómo MANDAR una desde afuera. Un botón
// que siempre falla es peor que no tenerlo.
es(
  "no hay botón de reaccionar en un hilo de Messenger",
  await p.locator('main button[title*="eaccion"]').count(),
  0,
);

es("y la pantalla no tiró ningún error", errores, []);

await nav.close();
limpiar();

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
