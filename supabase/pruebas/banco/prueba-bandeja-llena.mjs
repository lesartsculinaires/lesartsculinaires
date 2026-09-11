/**
 * Con la bandeja de verdad —cientos de hilos—, ¿se ve el historial y el hilo?
 *
 *     node supabase/pruebas/banco/prueba-bandeja-llena.mjs
 *
 * ============================================================================
 * QUÉ REPORTÓ LA ESCUELA
 * ============================================================================
 *
 * «Los mensajes anteriores no aparecen, y varios clientes que se reactivaron
 *  con la plantilla no aparecen los chats.»
 *
 * En la captura se ve un hilo con DOS mensajes: la plantilla que mandó la
 * asesora a las 3 de la tarde y la respuesta del cliente a las 7 de la noche.
 * Todo lo anterior —la conversación que ya existía con esa persona— no está.
 *
 * ============================================================================
 * POR QUÉ PASA, Y POR QUÉ SON TRES COSAS DISTINTAS
 * ============================================================================
 *
 * 1. EL TOPE QUE NO SE VE
 *
 *    `fetchInbox` pide los mensajes con `.limit(4000)`. PostgREST corta en MIL
 *    y no lo dice —está explicado en `lib/supabase/paginar.ts`, que existe por
 *    esto mismo en otra pantalla—. O sea que la ventana real nunca fue de
 *    4.000: es de 1.000 para TODA la bandeja. Repartidos entre trescientos
 *    hilos son tres mensajes por hilo.
 *
 * 2. EL HISTORIAL SÓLO SE PEDÍA SI EL HILO ESTABA VACÍO
 *
 *    Al arreglar el orden de los mensajes se agregó `historialDeConversacion`,
 *    que trae el hilo entero cuando quedó fuera de la ventana. Pero se pedía
 *    sólo con CERO mensajes cargados. Un hilo con dos mensajes nuevos adentro
 *    de la ventana no cuenta como vacío, así que nunca se pedía y el historial
 *    viejo no aparecía nunca. Es exactamente la captura.
 *
 * 3. LA LISTA SE CORTABA EN 300 HILOS
 *
 *    `.limit(300)` alcanzaba con ciento veintitrés conversaciones. Con las
 *    campañas de reactivación lo pasaron, y desde entonces los hilos que sobran
 *    —siempre los más viejos— no aparecen en la bandeja.
 *
 * (El cuarto motivo, que el hilo reactivado seguía ARCHIVADO y por eso escondido,
 *  se prueba en `prueba-masivo-en-el-hilo.mjs`: ahí hay una campaña de verdad,
 *  que es la única forma honesta de comprobarlo.)
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 *   EL HISTORIAL ESTÁ            Con la bandeja llena, abrir un hilo tiene que
 *                                mostrar lo de antes, no sólo lo de hoy.
 *   Y LO NUEVO TAMBIÉN           El arreglo no puede costar los mensajes
 *                                recientes: son los que se están trabajando.
 *   NO FALTA NINGÚN HILO         Con más de trescientos, tienen que estar todos.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `llena-${process.pid}-${Math.random()}.sql`);
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
 * Una bandeja del tamaño de la de ellos.
 *
 * Trescientos hilos con unos cuantos mensajes cada uno pasan el tope real de
 * mil de sobra. Con menos, todo entra en la ventana y el error no se ve —que es
 * justo lo que pasó durante meses—.
 */
const HILOS = 300;
const POR_HILO = 6;

const VIEJO = "Esto se habló la semana pasada y tiene que seguir estando";
const PLANTILLA = "Hola, te escribo de Les Arts Culinaires para retomar";
const RESPUESTA = "Siii solo esto verificando asi como los horarios que tiene";

const TEL = "50399900001"; // el de la captura: historial + plantilla + respuesta

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono like '503999%');
    delete from public.conversaciones where telefono like '503999%';
    delete from public.clientes where nombre like '%LLENA PRUEBA%';
  `);
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values
    ('Nathaly LLENA PRUEBA', '${TEL}');

  -- El hilo de la captura: historial viejo, la plantilla de hoy, y la respuesta.
  insert into public.conversaciones
    (canal, identificador, telefono, nombre_perfil, cliente_id, ultimo_mensaje_en, ultimo_texto)
  select 'whatsapp', '${TEL}', '${TEL}', 'Nathaly LLENA PRUEBA', c.id, now(), '${RESPUESTA}'
    from public.clientes c where c.nombre = 'Nathaly LLENA PRUEBA';

  -- El relleno: ${HILOS} hilos con ${POR_HILO} mensajes cada uno.
  insert into public.conversaciones
    (canal, identificador, telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  select 'whatsapp', '5039990' || lpad(g::text, 4, '0'), '5039990' || lpad(g::text, 4, '0'),
         'Relleno ' || g, now() - (g || ' minutes')::interval, 'relleno'
    from generate_series(100, ${100 + HILOS - 1}) g;

  /*
   * El relleno va EN EL MEDIO, y ahí está la gracia.
   *
   * Entre una hora y treinta y pico de horas atrás: más viejo que los dos
   * mensajes de hoy del hilo de la captura, y más nuevo que su historial de
   * hace una semana.
   *
   * Así el hilo queda partido por el tope, que es lo que reportó la escuela: lo
   * de hoy entra en la ventana y lo de antes no. Si el relleno fuera más nuevo
   * que TODO, el hilo quedaría entero afuera —el caso vacío, que el arreglo
   * anterior ya cubría— y esta prueba pasaría en verde con el error puesto.
   */
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.LLENA.' || v.id || '.' || s,
         case when s % 2 = 0 then 'entrante' else 'saliente' end,
         'text', 'relleno ' || s,
         now() - ((60 + (v.id % ${HILOS}) * ${POR_HILO} + s) || ' minutes')::interval
    from public.conversaciones v, generate_series(1, ${POR_HILO}) s
   where v.nombre_perfil like 'Relleno %';

  -- El historial viejo del hilo de la captura: hace una semana, o sea AFUERA
  -- de la ventana una vez que el relleno la llenó.
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.LLENA.VIEJO.' || s, 'entrante', 'text', '${VIEJO}',
         now() - interval '7 days' + (s || ' seconds')::interval
    from public.conversaciones v, generate_series(1, 5) s
   where v.telefono = '${TEL}';

  -- Y lo de hoy: la plantilla y la respuesta, ADENTRO de la ventana.
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en)
  select v.id, 'wamid.LLENA.PLANTILLA', 'saliente', 'text', '${PLANTILLA}', 'leido',
         now() - interval '12 minutes'
    from public.conversaciones v where v.telefono = '${TEL}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.LLENA.RESPUESTA', 'entrante', 'text', '${RESPUESTA}',
         now() - interval '4 minutes'
    from public.conversaciones v where v.telefono = '${TEL}';
`);

/*
 * Se comprueba que el escenario quedó como hace falta ANTES de mirar la
 * pantalla. Si el relleno no partiera el hilo en dos, lo que siguiera no
 * probaría nada y pasaría en verde igual.
 */
{
  const dentro = Number(
    sql(`
      with ventana as (
        select conversacion_id from public.mensajes order by creado_en desc limit 1000
      )
      select count(*) from ventana v
       join public.conversaciones c on c.id = v.conversacion_id
       where c.telefono = '${TEL}';
    `),
  );
  const total = Number(
    sql(`select count(*) from public.mensajes m
          join public.conversaciones c on c.id = m.conversacion_id
          where c.telefono = '${TEL}';`),
  );
  es("el hilo de la captura queda PARTIDO por el tope real", dentro > 0 && dentro < total, true);
  console.log(`   (${dentro} de sus ${total} mensajes entran en los 1000 más nuevos)`);
}

const total = Number(sql(`select count(*) from public.mensajes;`));
es("la bandeja pasa el tope real de mil mensajes", total > 1000, true);
console.log(`   (${total} mensajes en ${sql(`select count(*) from public.conversaciones;`)} hilos)`);

const subDe = (a) =>
  JSON.parse(
    Buffer.from(
      fs.readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${a}`, "utf8").trim().split(".")[1],
      "base64url",
    ).toString(),
  ).sub;
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
      user: { id: subDe("jwt-jefa.txt"), email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/llena-${n}.png` });

/*
 * Lo que se lee DENTRO del hilo, no en la pantalla entera.
 *
 * La lista de la izquierda muestra un resumen del último mensaje, así que
 * buscar el texto en toda la página pasa en verde aunque la burbuja no esté.
 */
const enElHilo = async () => (await p.locator("[data-hilo]").innerText()).replace(/\s+/g, " ");

try {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(3500);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 1. EL HILO DE LA CAPTURA: ¿ESTÁ LO DE ANTES? ──");
  // ══════════════════════════════════════════════════════════════════════
  {
    await p.getByPlaceholder(/Buscar/).first().fill("Nathaly LLENA");
    await p.waitForTimeout(1800);
    await p.locator('button.row:has-text("Nathaly LLENA PRUEBA")').first().click();
    await p.waitForTimeout(4000);
    await foto("1-hilo");

    const t = await enElHilo();
    // Lo de hoy: es lo que SÍ se veía en la captura.
    es("se ve la plantilla de hoy", t.includes(PLANTILLA), true);
    es("y la respuesta del cliente", t.includes(RESPUESTA), true);
    // Y lo que faltaba.
    es("SE VE LO QUE SE HABLÓ ANTES", t.includes(VIEJO), true);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. ESTÁN TODOS LOS HILOS, NO LOS PRIMEROS 300 ──");
  // ══════════════════════════════════════════════════════════════════════
  //
  // El otro tope de la misma pantalla. La bandeja pedía `.limit(300)`, que
  // alcanzaba cuando la escuela tenía ciento veintitrés conversaciones; con las
  // campañas de reactivación lo pasaron, y a partir de ahí las que sobran no se
  // ven. No aparece ningún error: aparece una lista a la que le faltan hilos,
  // siempre los de más abajo —los más viejos—.
  {
    await p.getByPlaceholder(/Buscar/).first().fill("");
    await p.waitForTimeout(2500);

    const enLaBase = Number(sql(`select count(*) from public.conversaciones;`));
    const enLaLista = await p.locator("button.row").count();
    await foto("2-lista-entera");

    es("la prueba tiene más de 300 hilos, que es donde estaba el tope", enLaBase > 300, true);
    es("NO FALTA NINGÚN HILO EN LA LISTA", enLaLista, enLaBase);
    console.log(`   (${enLaLista} en la lista, ${enLaBase} en la base)`);

    /*
     * Y el más viejo de todos, que es el primero que se caía.
     *
     * Contar ya lo dice, pero nombrarlo deja claro cuál se perdía: los hilos
     * salen ordenados por fecha, así que el que se cae es siempre el último de
     * la lista, y es justo el que nadie mira hasta que lo necesita.
     */
    const elMasViejo = sql(`
      select nombre_perfil from public.conversaciones
       order by ultimo_mensaje_en asc, id asc limit 1;
    `);
    es(
      `y el más viejo («${elMasViejo}») está`,
      await p.locator(`button.row:has-text("${elMasViejo}")`).count(),
      1,
    );
  }

  es("sin errores en la página", errores, []);
} finally {
  await ctx.close();
  await nav.close();
  limpiar();
}

es(
  "no quedó basura",
  sql(`select count(*) from public.conversaciones where telefono like '503999%';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
