/**
 * Una persona con dos programas: ¿se ve que NO es un duplicado?
 *
 *     node supabase/pruebas/banco/prueba-varios-programas.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Necesito poner en la ficha del lead una manera de que, si una misma persona
 * pregunta en distintas fechas distintos productos, se vea: ésa es otra razón
 * por la que se pueden duplicar los leads cuando ingresamos nueva base.»
 *
 * ============================================================================
 * POR QUÉ LA RESPUESTA NO ES JUNTARLOS
 * ============================================================================
 *
 * Porque no están mal. En la base de verdad esos casos son así:
 *
 *   Silvestre Cerón   Pastelería, PERDIDO en julio → Suprême Diplôme, GANADO
 *                     en agosto.
 *
 * Juntarlos borraría la venta ganada y el motivo de pérdida. El problema no es
 * el dato: es que la pantalla de Clientes lista LEADS, así que esa persona
 * ocupa dos filas y se lee como un repetido. Lo que faltaba era decirlo.
 *
 * ============================================================================
 * LAS TRES COSAS QUE SE PRUEBAN
 * ============================================================================
 *
 *   EN LA FICHA           Al abrir un lead se ven los otros de esa persona, con
 *                         su programa y su estado, y se puede saltar a ellos.
 *
 *   EN LA LISTA           Las filas de esa persona dicen «1 de 2» y «2 de 2»,
 *                         para que se lean como una persona con dos consultas
 *                         y no como un duplicado.
 *
 *   QUE NO MOLESTE        Quien tiene un solo lead —que son casi todos— no ve
 *                         ninguna marca ni ningún bloque de más.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-varios-${process.pid}-${Math.random()}.sql`);
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

const DOBLE = "Silvestre Prueba Cerón";  // dos programas
const SOLA  = "Unica Prueba Sola";       // un solo lead

const limpiar = () => sql(`delete from public.clientes where nombre in ('${DOBLE}','${SOLA}');`);
limpiar();

/*
 * El caso real: se le cayó Pastelería en julio y compró Suprême en agosto.
 * Son dos ventas, no un duplicado.
 */
sql(`
  insert into public.clientes (nombre, correo) values
    ('${DOBLE}', 'silvestre.prueba@lac.test'),
    ('${SOLA}',  'unica.prueba@lac.test');

  insert into public.oportunidades
    (codigo, cliente_id, producto_id, estado_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'CRM-8801', c.id,
         (select id from public.productos order by id limit 1),
         (select id from public.estados where nombre = 'Perdido'),
         -- La PRIMERA etapa, no la última: la última es «Ganado» y un
         -- disparador de la base sincroniza el estado con ella, así que
         -- poniéndola acá el lead terminaría en Ganado y la prueba estaría
         -- comprobando otra cosa.
         (select id from public.etapas order by orden limit 1),
         '2026-07-20', 300
    from public.clientes c where c.nombre = '${DOBLE}';

  insert into public.oportunidades
    (codigo, cliente_id, producto_id, estado_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'CRM-8802', c.id,
         (select id from public.productos order by id desc limit 1),
         (select id from public.estados where nombre = 'Ganado'),
         (select id from public.etapas order by orden desc limit 1),
         '2026-08-20', 1200
    from public.clientes c where c.nombre = '${DOBLE}';

  insert into public.oportunidades (codigo, cliente_id, fecha_registro)
  select 'CRM-8803', c.id, '2026-08-01'
    from public.clientes c where c.nombre = '${SOLA}';
`);

const PROG_1 = sql("select nombre from public.productos order by id limit 1;");
const PROG_2 = sql("select nombre from public.productos order by id desc limit 1;");

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/varios-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2200);

console.log("── EN LA LISTA: «1 de 2» ──");
{
  await p.getByPlaceholder(/Buscar/).fill("Silvestre Prueba");
  await p.waitForTimeout(1500);
  await foto("1-lista");

  const t = await texto();
  es("aparece dos veces, como corresponde", (t.match(/CRM-880[12]/g) ?? []).length, 2);
  es("LA PRIMERA DICE «1 de 2»", /1 de 2/.test(t), true);
  es("y la segunda «2 de 2»", /2 de 2/.test(t), true);

  // El orden lo da la fecha: el de julio es el 1.
  const filas = await p.locator("main tbody tr").allInnerTexts();
  const deJulio = filas.find((x) => x.includes("CRM-8801")) ?? "";
  es("el de julio es el primero", /1 de 2/.test(deJulio), true);
}

console.log("\n── QUIEN TIENE UNO SOLO NO SE MARCA ──");
{
  /*
   * Son 1532 de 1566 personas. Marcarlas todas con «1 de 1» sería ruido en
   * todas las filas para ganar claridad en treinta y ocho.
   */
  await p.getByPlaceholder(/Buscar/).fill("Unica Prueba");
  await p.waitForTimeout(1500);
  await foto("2-sola");

  const fila = (await p.locator('main tbody tr:has-text("CRM-8803")').allInnerTexts()).join(" ");
  es("está la fila", /CRM-8803/.test(fila), true);
  es("SIN NINGUNA MARCA", /\d de \d/.test(fila), false);
}

console.log("\n── EN LA FICHA: se ve el otro lead ──");
{
  await p.getByPlaceholder(/Buscar/).fill("Silvestre Prueba");
  await p.waitForTimeout(1500);
  await p.locator('main tbody tr:has-text("CRM-8801")').click();
  await p.waitForTimeout(2000);
  await foto("3-ficha");

  const t = await texto();
  es("avisa que hay otro", /Esta persona tiene otro lead/.test(t), true);
  es("NOMBRA EL OTRO CÓDIGO", /CRM-8802/.test(t), true);
  es("con su programa", t.includes(PROG_2), true);
  es("y dice que está Ganado", /Ganado/.test(t), true);

  /*
   * La frase que evita que alguien los «unifique». Sin ella, ver dos leads de
   * la misma persona invita a juntarlos, y juntar éstos borraría la venta.
   */
  es("Y EXPLICA QUE NO ES UN DUPLICADO", /No es un duplicado/.test(t), true);
}

console.log("\n── y se puede saltar al otro ──");
{
  await p.locator('button[title="Abrir CRM-8802"]').click();
  await p.waitForTimeout(2000);
  await foto("4-saltado");

  const t = await texto();
  es("ahora se está mirando el otro", /CRM-8802/.test(t), true);
  es("y desde acá se ve el primero", /CRM-8801/.test(t), true);
  es("con su programa", t.includes(PROG_1), true);
  // Éste está Perdido: sigue siendo historia útil de la persona.
  es("y su estado", /Perdido/.test(t), true);
}

console.log("\n── en una ficha de alguien con un solo lead no hay bloque ──");
{
  await p.getByRole("button", { name: "Cerrar", exact: true }).first().click();
  await p.waitForTimeout(1200);
  await p.getByPlaceholder(/Buscar/).fill("Unica Prueba");
  await p.waitForTimeout(1500);
  await p.locator('main tbody tr:has-text("CRM-8803")').click();
  await p.waitForTimeout(2000);
  await foto("5-ficha-sola");

  const t = await texto();
  es("NO APARECE EL BLOQUE", /Esta persona tiene otro/.test(t), false);
  es("ni la frase del duplicado", /No es un duplicado/.test(t), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql(`select count(*) from public.clientes where nombre in ('${DOBLE}','${SOLA}');`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
