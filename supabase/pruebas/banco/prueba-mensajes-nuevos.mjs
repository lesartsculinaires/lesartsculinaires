/**
 * Con la bandeja llena, ¿se sigue viendo lo último que se contestó?
 *
 *     node supabase/pruebas/banco/prueba-mensajes-nuevos.mjs
 *
 * ============================================================================
 * QUÉ REPORTÓ LA ESCUELA
 * ============================================================================
 *
 * «¿Por qué no se ve el mensaje de la asesora Katya con este cliente? El
 *  cliente escribió, se le contestó, y no aparece el mensaje contestado.»
 *
 * En la lista de la izquierda SÍ se leía la respuesta —el resumen del hilo la
 * mostraba— y al abrir la conversación estaba sólo el «Hola» del cliente, de la
 * madrugada. El mensaje existía; la bandeja no lo traía.
 *
 * ============================================================================
 * POR QUÉ PASABA
 * ============================================================================
 *
 * `fetchInbox` pedía los mensajes así:
 *
 *     .order("creado_en", { ascending: true }).limit(4000)
 *
 * O sea los 4.000 MÁS ANTIGUOS de toda la bandeja. Mientras hubo menos de
 * 4.000 en total no se notó: entraban todos. Al pasar ese techo —la escuela lo
 * cruzó con ciento veintitrés conversaciones y varios envíos— la consulta
 * seguía trayendo los primeros y dejaba afuera TODO lo nuevo.
 *
 * Es el peor síntoma posible: la asesora contesta, el mensaje sale, el cliente
 * lo recibe, y en el hilo no aparece. Parece que el CRM no hubiera guardado
 * nada, y lleva a contestar dos veces.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 * Se llena la bandeja por encima del techo y después se mira si lo último
 * sigue estando. Con el error, la respuesta desaparece; sin él, se ve.
 *
 *   LO ÚLTIMO SE VE            Es lo que reportó la escuela.
 *   Y LO DE ANTES TAMBIÉN      Dar vuelta el orden no puede costar el mensaje
 *                              del cliente que está justo arriba.
 *   UN HILO VIEJO NO QUEDA     La otra cara: con el orden dado vuelta, una
 *   VACÍO                      conversación que lleva meses callada cae fuera
 *                              de la ventana. Al abrirla se pide aparte.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `nuevos-${process.pid}-${Math.random()}.sql`);
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

/*
 * El techo que aplica la bandeja. Si cambia allá, cambia acá.
 *
 * La prueba mete MÁS que esto de relleno: si metiera menos, entrarían todos y
 * el error no se vería —que es exactamente lo que pasó durante meses—.
 */
const TECHO = 4000;
const RELLENO = TECHO + 200;

const TEL = "50370911001";
const TEL_VIEJO = "50370911002";
const RECIENTE = "Esta es la respuesta de Katya que no se veía";
const DEL_CLIENTE = "Hola, quiero información";
const MUY_VIEJO = "Lo que se habló hace meses";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono in ('${TEL}', '${TEL_VIEJO}'));
    delete from public.conversaciones where telefono in ('${TEL}', '${TEL_VIEJO}');
    delete from public.clientes where nombre like '%Tope PRUEBA%';
  `);
limpiar();

/*
 * Dos hilos, y cada uno prueba una cara del mismo tope.
 *
 * EL DE ARRIBA se llena de mensajes viejos —más que el techo— y termina con la
 * respuesta de hoy. Con el orden viejo, esa respuesta quedaba afuera.
 *
 * EL DE ABAJO es una conversación de hace meses, sin nada nuevo. Con el orden
 * dado vuelta cae fuera de la ventana, y ésa es la trampa del arreglo: si no se
 * pidiera aparte al abrirla, se vería vacía.
 */
sql(`
  insert into public.clientes (nombre, telefono) values
    ('Litzy Tope PRUEBA', '${TEL}'),
    ('Callado Tope PRUEBA', '${TEL_VIEJO}');

  insert into public.conversaciones
    (canal, identificador, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto)
  select 'whatsapp', '${TEL}', '${TEL}', 'Litzy Tope PRUEBA', c.id, now(), '${RECIENTE}'
    from public.clientes c where c.nombre = 'Litzy Tope PRUEBA';

  insert into public.conversaciones
    (canal, identificador, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto)
  select 'whatsapp', '${TEL_VIEJO}', '${TEL_VIEJO}', 'Callado Tope PRUEBA', c.id,
         now() - interval '200 days', '${MUY_VIEJO}'
    from public.clientes c where c.nombre = 'Callado Tope PRUEBA';

  -- El relleno: más viejo que todo lo demás, para que ocupe el cupo.
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.TOPE.' || g, 'entrante', 'text', 'relleno ' || g,
         now() - interval '300 days' + (g || ' seconds')::interval
    from public.conversaciones v, generate_series(1, ${RELLENO}) g
   where v.telefono = '${TEL}';

  -- Lo que escribió el cliente, y la respuesta de hoy.
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en)
  select v.id, 'wamid.TOPE.CLIENTE', 'entrante', 'text', '${DEL_CLIENTE}', null,
         now() - interval '2 hours'
    from public.conversaciones v where v.telefono = '${TEL}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en)
  select v.id, 'wamid.TOPE.KATYA', 'saliente', 'text', '${RECIENTE}', 'enviado',
         now() - interval '1 hour'
    from public.conversaciones v where v.telefono = '${TEL}';

  -- Y la conversación de hace meses, con un solo mensaje.
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.TOPE.VIEJO', 'entrante', 'text', '${MUY_VIEJO}',
         now() - interval '200 days'
    from public.conversaciones v where v.telefono = '${TEL_VIEJO}';
`);

es(
  "el relleno pasa del techo, que es lo que hace falta para que se vea el error",
  Number(
    sql(`
      select count(*) from public.mensajes m
       join public.conversaciones v on v.id = m.conversacion_id
       where v.telefono = '${TEL}';
    `),
  ) > TECHO,
  true,
);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nuevos-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

/*
 * Lo que se lee DENTRO del hilo, no en la pantalla entera.
 *
 * La lista de la izquierda muestra un resumen del último mensaje, así que
 * buscar el texto en toda la página pasa en verde aunque la burbuja no esté.
 * Es exactamente el error que reportó la escuela —el resumen se veía, el
 * mensaje no— y con una comprobación floja esta prueba no lo habría atrapado.
 */
const enElHilo = async () =>
  (await p.locator("[data-hilo]").innerText()).replace(/\s+/g, " ");

try {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(3000);

  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. LA RESPUESTA DE HOY SE VE EN EL HILO ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    await p.locator('button.row:has-text("Litzy Tope PRUEBA")').first().click();
    await p.waitForTimeout(3000);
    await foto("1-hilo");

    const t = await enElHilo();
    es("SE VE LO QUE CONTESTÓ LA ASESORA", t.includes(RECIENTE), true);
    es("y arriba, lo que escribió el cliente", t.includes(DEL_CLIENTE), true);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. Y UN HILO DE HACE MESES NO QUEDA VACÍO ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // La otra cara del arreglo. Al pedir los mensajes MÁS NUEVOS, una
  // conversación callada hace meses cae fuera de la ventana; si no se pidiera
  // aparte al abrirla, se vería vacía —que es el mismo problema con otra
  // víctima—.
  {
    await p.getByPlaceholder(/Buscar/).first().fill("Callado Tope");
    await p.waitForTimeout(1500);
    await p.locator('button.row:has-text("Callado Tope PRUEBA")').first().click();
    // Tarda un poco más: este hilo se pide aparte, no venía en la bandeja.
    await p.waitForTimeout(4000);
    await foto("2-hilo-viejo");

    es("SE VE LO QUE SE HABLÓ HACE MESES", (await enElHilo()).includes(MUY_VIEJO), true);
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();
  limpiar();
}

es(
  "no quedó basura",
  sql(`select count(*) from public.conversaciones where telefono in ('${TEL}', '${TEL_VIEJO}');`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
