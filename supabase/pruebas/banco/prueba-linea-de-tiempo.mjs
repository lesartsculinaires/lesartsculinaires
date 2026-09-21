/**
 * La conversación completa de una persona, cruzando canales.
 *
 *     node supabase/pruebas/banco/prueba-linea-de-tiempo.mjs
 *
 * ============================================================================
 * QUÉ RESUELVE, Y POR QUÉ SE PRUEBA EN LA BASE Y NO MIRANDO
 * ============================================================================
 *
 * La bandeja muestra un hilo a la vez y un hilo es de un canal. Alguien que
 * preguntó el precio por Instagram el martes y volvió por WhatsApp el jueves
 * tiene dos hilos: quien lo atiende ve uno, y contesta como si fuera la primera
 * vez o le repite lo que ya se le dijo.
 *
 * Lo que puede fallar callado es el ORDEN. Si los mensajes de un canal quedaran
 * agrupados en vez de intercalados por fecha, la ficha contaría una historia que
 * no pasó: parecería que primero habló todo por Instagram y después todo por
 * WhatsApp, cuando en realidad fue ida y vuelta. Eso no se ve mirando la
 * pantalla, porque la lista igual «se ve bien».
 *
 * Y el primer contacto: con el tope de ochenta mensajes, el más viejo de los que
 * se trajeron NO es el primero de la persona. Decir que sí sería mostrar una
 * fecha equivocada justo en el lugar donde más se mira.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `lin-${process.pid}-${Math.random()}.sql`);
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

const marca = String(Date.now()).slice(-8);
const NOMBRE = `Rosa Tres Canales LT${marca}`;

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where cliente_id in
        (select id from public.clientes where nombre = '${NOMBRE}'));
    delete from public.conversaciones where cliente_id in
      (select id from public.clientes where nombre = '${NOMBRE}');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre = '${NOMBRE}');
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${NOMBRE}');
    delete from public.clientes where nombre = '${NOMBRE}';
  `);
limpiar();

/*
 * Una persona, tres hilos, y los mensajes INTERCALADOS en el tiempo.
 *
 * El intercalado es el punto: si la línea agrupara por canal en vez de ordenar
 * por fecha, esta prueba se pone roja. Con los mensajes de cada canal en bloques
 * separados no lo notaría.
 *
 * El más viejo —el de hace 200 días— existe para comprobar que «primer contacto»
 * sale de la base y no del pedazo que se trajo.
 */
sql(`
  insert into public.clientes (nombre, telefono) values ('${NOMBRE}', '7555${marca.slice(0,4)}');

  insert into public.oportunidades (cliente_id, codigo, fecha_registro)
  select id, 'LT${marca}', current_date from public.clientes where nombre = '${NOMBRE}';

  insert into public.conversaciones
    (telefono, identificador, canal, cliente_id, ultimo_mensaje_en, ultimo_texto)
  select '7555${marca.slice(0,4)}', '7555${marca.slice(0,4)}', 'whatsapp', c.id, now(), 'x'
    from public.clientes c where c.nombre = '${NOMBRE}';

  insert into public.conversaciones
    (telefono, identificador, canal, cliente_id, ultimo_mensaje_en, ultimo_texto, nombre_perfil)
  select null, 'IG${marca}', 'instagram', c.id, now(), 'x', 'Rosa en IG'
    from public.clientes c where c.nombre = '${NOMBRE}';

  insert into public.conversaciones
    (telefono, identificador, canal, cliente_id, ultimo_mensaje_en, ultimo_texto, nombre_perfil)
  select null, 'PSID${marca}', 'messenger', c.id, now(), 'x', 'Rosa en Messenger'
    from public.clientes c where c.nombre = '${NOMBRE}';
`);

const hilo = (canal) =>
  sql(`select v.id from public.conversaciones v
        join public.clientes c on c.id = v.cliente_id
       where c.nombre = '${NOMBRE}' and v.canal = '${canal}';`);

const WA = hilo("whatsapp");
const IG = hilo("instagram");
const MS = hilo("messenger");

/*
 * Cinco mensajes, en este orden real:
 *   hace 200 días   Instagram   «Hola, vi su anuncio»      (el PRIMER contacto)
 *   hace  10 días   Instagram   «¿Cuánto cuesta?»
 *   hace   9 días   WhatsApp    «Te paso la info»          (saliente)
 *   hace   8 días   Messenger   «También les escribí acá»
 *   hace   7 días   WhatsApp    «Perfecto, gracias»
 */
sql(`
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en) values
    (${IG}, 'lt${marca}a', 'entrante', 'text', 'Hola, vi su anuncio',   now() - interval '200 days'),
    (${IG}, 'lt${marca}b', 'entrante', 'text', 'Cuanto cuesta',          now() - interval '10 days'),
    (${WA}, 'lt${marca}c', 'saliente', 'text', 'Te paso la info',        now() - interval '9 days'),
    (${MS}, 'lt${marca}d', 'entrante', 'text', 'Tambien les escribi aca',now() - interval '8 days'),
    (${WA}, 'lt${marca}e', 'entrante', 'text', 'Perfecto gracias',       now() - interval '7 days');
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
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/linea-${n}.png`, fullPage: true });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2000);
await p.getByPlaceholder(/Buscar/).first().fill(`LT${marca}`);
await p.waitForTimeout(1500);
await p.locator("main tbody tr").first().click();
await p.waitForTimeout(2500);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL RESUMEN SE VE SIN ABRIR NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await foto("1-ficha");
  const boton = p.locator("button[data-linea-tiempo]");
  es("la línea de tiempo está en la ficha", await boton.count(), 1);

  const t = await boton.innerText();
  es("dice cuántos mensajes hay", /5 mensajes/.test(t), true);

  /*
   * «desde» tiene que ser la fecha del mensaje de hace 200 días.
   *
   * Es el que comprueba que el primer contacto sale de la base y no del pedazo
   * que se trajo. Con el tope puesto, ese cálculo es fácil de equivocar.
   */
  const haceDoscientos = new Date(Date.now() - 200 * 86400000);
  const mes = haceDoscientos.toLocaleDateString("es-SV", { month: "short" });
  es("Y DESDE CUÁNDO, QUE ES EL MENSAJE MÁS VIEJO DE TODOS", t.includes(mes), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LOS TRES CANALES, INTERCALADOS POR FECHA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.locator("button[data-linea-tiempo]").click();
  await p.waitForTimeout(1200);
  await foto("2-abierta");

  const cuerpo = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  es("está el mensaje de Instagram", /Cuanto cuesta/.test(cuerpo), true);
  es("el de WhatsApp", /Te paso la info/.test(cuerpo), true);
  es("y el de Messenger", /Tambien les escribi aca/.test(cuerpo), true);

  /*
   * El orden, que es lo que no se ve mirando.
   *
   * Se compara la posición de cada texto dentro de la página: tienen que salir
   * en el orden real —Instagram, WhatsApp, Messenger, WhatsApp— y no agrupados
   * por canal. Si alguien agrupara, «Tambien les escribi aca» caería al final.
   */
  const pos = (s) => cuerpo.indexOf(s);
  const enOrden =
    pos("Cuanto cuesta") < pos("Te paso la info") &&
    pos("Te paso la info") < pos("Tambien les escribi aca") &&
    pos("Tambien les escribi aca") < pos("Perfecto gracias");

  es("EN ORDEN CRONOLÓGICO, NO AGRUPADOS POR CANAL", enOrden, true);

  // Las etiquetas de canal aparecen donde el canal cambia.
  es("se ve la etiqueta de Instagram", /Instagram/.test(cuerpo), true);
  es("la de WhatsApp", /WhatsApp/.test(cuerpo), true);
  es("y la de Messenger", /Messenger/.test(cuerpo), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. y se distingue quién habló ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const cuerpo = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  // La flecha → marca lo que mandó el equipo; ← lo que escribió la persona.
  es("lo que mandó el equipo lleva su marca", /→\s*Te paso la info/.test(cuerpo), true);
  es("y lo que escribió la persona la suya", /←\s*Perfecto gracias/.test(cuerpo), true);
}

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es("no quedó basura", sql(`select count(*) from public.clientes where nombre = '${NOMBRE}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
