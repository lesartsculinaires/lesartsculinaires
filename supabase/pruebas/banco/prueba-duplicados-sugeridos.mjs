/**
 * La cola de duplicados: ¿propone bien, recuerda el «no», y unifica sin perder?
 *
 *     node supabase/pruebas/banco/prueba-duplicados-sugeridos.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Para que el lead se unifique se tiene que analizar el nombre de la persona,
 * el número de celular o el correo; en determinado punto tiene que haber una
 * intervención de la persona encargada para analizar la información y unificarla
 * en un solo contacto.»
 *
 * ============================================================================
 * LAS TRES COSAS QUE PUEDEN FALLAR CALLADAS
 * ============================================================================
 *
 *   QUE PROPONGA DE MÁS      Si la cola dijera que dos personas distintas son la
 *   O DE MENOS               misma, alguien las fundiría. Si no propusiera el
 *                            caso cruzado —Instagram y WhatsApp—, la pantalla
 *                            existiría sin servir para lo que se pidió.
 *
 *   QUE NO RECUERDE EL «NO»  Un par de homónimos que reaparece en cada recarga
 *                            hace que la encargada deje de mirar la pantalla en
 *                            dos semanas. Y ahí se pierden también los buenos.
 *
 *   QUE LA FUSIÓN SE COMA    Unificar borra una ficha. Si se llevara por delante
 *   ALGO                     sus mensajes o su historial de canales, el daño no
 *                            se ve hasta que alguien busca una conversación que
 *                            ya no está.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `dup-${process.pid}-${Math.random()}.sql`);
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

const marca = String(Date.now()).slice(-7);
const TEL = `71${marca}`.slice(0, 8);

const limpiar = () =>
  sql(`
    delete from public.duplicados_descartados where menor in
      (select id from public.clientes where nombre like '%DUP${marca}%')
       or mayor in (select id from public.clientes where nombre like '%DUP${marca}%');
    delete from public.fusiones where conservado in
      (select id from public.clientes where nombre like '%DUP${marca}%');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where cliente_id in
        (select id from public.clientes where nombre like '%DUP${marca}%'));
    delete from public.conversaciones where cliente_id in
      (select id from public.clientes where nombre like '%DUP${marca}%');
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like '%DUP${marca}%');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like '%DUP${marca}%');
    delete from public.clientes where nombre like '%DUP${marca}%';
  `);
limpiar();

/*
 * Tres parejas, una por cada forma en que esto tiene que funcionar.
 *
 * La de teléfono viene escrita de dos maneras distintas a propósito —con guión y
 * con código de país— porque así está en la base de verdad: lo cargado a mano,
 * lo de las planillas y lo que pone el webhook no se parecen.
 */
sql(`
  insert into public.clientes (nombre, telefono, correo) values
    ('Sofía Cruz DUP${marca}',   '${TEL.slice(0,4)}-${TEL.slice(4)}', null),
    ('Sofia Cruz DUP${marca}',   '+503 ${TEL}', null),
    ('Marta Lopez DUP${marca}',  null, 'MARTA.DUP${marca}@ej.com '),
    ('M. Lopez DUP${marca}',     null, 'marta.dup${marca}@ej.com'),
    ('Pedro Ramos DUP${marca}',  '7333-0001', null),
    ('pedro ramos DUP${marca}',  '7999-0002', null);
`);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. LA VISTA PROPONE LAS TRES, CON SU PESO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const filas = sql(`
    select string_agg(motivos::text || ':' || peso, ' | ' order by peso desc, menor)
      from public.vw_duplicados_sugeridos v
     where exists (select 1 from public.clientes c
                    where c.id = v.menor and c.nombre like '%DUP${marca}%');
  `);
  /*
   * Nombre+teléfono pesa 3, correo pesa 3, nombre solo pesa 1.
   *
   * Los pesos son los mismos que usa `lib/duplicados.ts` para ordenar el aviso
   * del alta manual. Si se separaran, la cola propondría en un orden y el resto
   * del CRM en otro.
   */
  es("las tres parejas, con los motivos correctos", filas,
     "{nombre,telefono}:3 | {correo}:3 | {nombre}:1");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. y una ficha sola no se empareja consigo misma ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "ningún par tiene la misma ficha de los dos lados",
    sql(`select count(*) from public.vw_duplicados_sugeridos where menor >= mayor;`),
    "0",
  );
}

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/dups-${n}.png`, fullPage: true });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

const id = async (nombre) =>
  sql(`select id from public.clientes where nombre = '${nombre}';`);

const SOFIA_A = await id(`Sofía Cruz DUP${marca}`);
const SOFIA_B = await id(`Sofia Cruz DUP${marca}`);
const PEDRO_A = await id(`Pedro Ramos DUP${marca}`);
const PEDRO_B = await id(`pedro ramos DUP${marca}`);

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2200);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. LA PANTALLA SE ABRE DESDE CLIENTES ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es("el botón está en la barra", await p.locator("main button[data-ver-duplicados]").count(), 1);
  await p.locator("main button[data-ver-duplicados]").click();
  await p.waitForTimeout(2200);
  await foto("1-cola");

  const t = await texto();
  es("se ve el título", /Duplicados sugeridos/.test(t), true);
  es("DICE QUE NADA SE UNIFICA SOLO", /Nada se unifica sin que vos lo decidas/.test(t), true);
  es(
    "y explica por qué pasa con dos canales",
    /Instagram y Messenger no entregan teléfono ni correo/.test(t),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. las señales fuertes se distinguen de las débiles ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const t = await texto();
  es("hay pares por teléfono", /Mismo teléfono/.test(t), true);
  es("por correo", /Mismo correo/.test(t), true);
  es("y por nombre", /Mismo nombre/.test(t), true);

  const nuestro = p.locator(`main div[data-par="${PEDRO_A}-${PEDRO_B}"]`);
  es("el par de homónimos está en la lista", await nuestro.count(), 1);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. EL «NO ES LA MISMA PERSONA» SE RECUERDA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const nuestro = p.locator(`main div[data-par="${PEDRO_A}-${PEDRO_B}"]`);
  await nuestro.getByRole("button", { name: "No es la misma persona" }).click();
  await p.waitForTimeout(1800);
  await foto("2-descartado");

  es(
    "desaparece de la pantalla",
    await p.locator(`main div[data-par="${PEDRO_A}-${PEDRO_B}"]`).count(),
    0,
  );
  es(
    "quedó guardado en la base",
    sql(`select count(*) from public.duplicados_descartados
          where menor = ${Math.min(+PEDRO_A, +PEDRO_B)} and mayor = ${Math.max(+PEDRO_A, +PEDRO_B)};`),
    "1",
  );

  // Y lo que importa: recargando la pantalla tampoco vuelve.
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1800);
  await p.locator("main button[data-ver-duplicados]").click();
  await p.waitForTimeout(2200);

  es(
    "Y NO VUELVE AL RECARGAR",
    await p.locator(`main div[data-par="${PEDRO_A}-${PEDRO_B}"]`).count(),
    0,
  );
  es(
    "pero los otros pares siguen ahí",
    await p.locator(`main div[data-par="${SOFIA_A}-${SOFIA_B}"]`).count(),
    1,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. UNIFICAR: SE CONSERVA LA QUE SE SEÑALA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const nuestro = p.locator(`main div[data-par="${SOFIA_A}-${SOFIA_B}"]`);
  // Se conserva la primera, que es la que tiene el nombre con tilde.
  await nuestro.getByRole("button", { name: /^Conservar «Sofía Cruz/ }).click();
  await p.waitForTimeout(3000);
  await foto("3-unificado");

  es(
    "QUEDÓ UNA SOLA FICHA",
    sql(`select count(*) from public.clientes where id in (${SOFIA_A}, ${SOFIA_B});`),
    "1",
  );
  es(
    "y es la que se señaló",
    sql(`select count(*) from public.clientes where id = ${SOFIA_A};`),
    "1",
  );
  es(
    "el par ya no se propone",
    await p.locator(`main div[data-par="${SOFIA_A}-${SOFIA_B}"]`).count(),
    0,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 7. Y LA FUSIÓN DEJÓ RASTRO ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Sin esto, una fusión equivocada es indistinguible de un contacto que nunca
// existió: la ficha absorbida ya no está para preguntarle nada.
{
  es(
    "quedó anotada",
    sql(`select count(*) from public.fusiones where conservado = ${SOFIA_A};`),
    "1",
  );
  es(
    "CON EL NOMBRE DE LA QUE SE ABSORBIÓ, que ya no existe",
    sql(`select case when nombres[1] like '%Sofia Cruz DUP%' then 'sí' else nombres[1] end
           from public.fusiones where conservado = ${SOFIA_A};`),
    "sí",
  );
  es(
    "con la señal que lo propuso",
    sql(`select motivos from public.fusiones where conservado = ${SOFIA_A};`),
    "nombre, telefono",
  );
  es(
    "y con quién la hizo",
    sql(`select case when quien is null then 'sin firmar' else 'firmada' end
           from public.fusiones where conservado = ${SOFIA_A};`),
    "firmada",
  );
}

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.clientes where nombre like '%DUP${marca}%';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
