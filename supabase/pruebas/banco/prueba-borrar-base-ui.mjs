/**
 * El módulo de Bases: ¿se pueden marcar y borrar las repetidas, y sólo dirección?
 *
 *     node supabase/pruebas/banco/prueba-borrar-base-ui.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Que se puedan seleccionar las bases en el módulo de Bases y un botón de
 * eliminar las que estén duplicadas, porque aparece una base duplicada. Esta
 * acción sólo la puede hacer el rol de Administrador.»
 *
 * ------------------------------------------------------------------------
 * LO QUE SE PRUEBA ACÁ Y NO EN LA OTRA
 * ------------------------------------------------------------------------
 *
 * `prueba-borrar-base.mjs` prueba la función: qué se lleva y qué no. Ésta
 * prueba lo que ve la persona, que es donde se decide si la función se usa
 * bien o mal:
 *
 *   QUE LA COPIA ESTÉ MARCADA   nadie va a comparar dos filas idénticas a ojo.
 *                               Si el CRM no dice cuál sobra, se borra la que
 *                               toque, y una de las dos es la buena.
 *
 *   QUE VENTAS NO LO VEA        ni las casillas, ni el botón, ni el cartel.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-baseui-${process.pid}-${Math.random()}.sql`);
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

const ARCHIVO = "PRUEBA Asalariados repetida.xlsx";
const limpiar = () => {
  sql(`
    delete from public.oportunidades where codigo like 'BUI-%';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like 'Baseui %');
    delete from public.clientes where nombre like 'Baseui %';
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

// El doble clic tal cual pasó en la escuela: el mismo archivo, del mismo
// minuto, con las mismas filas.
sql(`
  insert into public.importaciones (archivo, filas, creado_en)
  values ('${ARCHIVO}', 2, now() - interval '90 seconds'),
         ('${ARCHIVO}', 2, now() - interval '60 seconds');

  insert into public.clientes (nombre, telefono) values
    ('Baseui Uno', '70330001'), ('Baseui Dos', '70330002'),
    ('Baseui Tres', '70330003'), ('Baseui Cuatro', '70330004');

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BUI-0001', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en limit 1)
    from public.clientes c where c.nombre = 'Baseui Uno';
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BUI-0002', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en limit 1)
    from public.clientes c where c.nombre = 'Baseui Dos';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BUI-0003', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Baseui Tres';
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BUI-0004', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Baseui Cuatro';
`);

const subDe = (a) =>
  JSON.parse(
    Buffer.from(
      fs.readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${a}`, "utf8")
        .trim().split(".")[1],
      "base64url",
    ).toString(),
  ).sub;

const galletaDe = (archivo, sub, correo) => {
  const jwt = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: sub, email: correo },
      }),
    ).toString("base64")
  );
};

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const entrarComo = async (archivo, correo) => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    {
      name: "sb-127-auth-token",
      value: galletaDe(archivo, subDe(archivo), correo),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Bases"]').click();
  await p.waitForTimeout(2200);
  return p;
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/baseui-${n}.png` });

console.log("── VENTAS: no ve nada de esto ──");
{
  const p = await entrarComo("jwt-ale.txt", "ale@lac.test");
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  await foto(p, "1-ventas");

  es("no hay casillas para marcar", await p.locator('main input[type="checkbox"]').count(), 0);
  es("ni el cartel de repetidas", texto.includes("bases repetidas"), false);
  es("ni el botón de borrar", await p.getByRole("button", { name: /Borrar la base|Borrar las bases/ }).count(), 0);
  await p.context().close();
}

console.log("\n── DIRECCIÓN: la copia viene marcada sola ──");
{
  const p = await entrarComo("jwt-jefa.txt", "jefa@lac.test");
  await foto(p, "2-direccion");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("avisa que hay una repetida", texto.includes("1 base repetida"), true);
  es("y la fila lleva la marca «copia»", texto.includes("copia"), true);
  es("hay casillas", (await p.locator('main input[type="checkbox"]').count()) > 0, true);

  console.log("\n── y se seleccionan de un botón ──");
  await p.getByRole("button", { name: "Seleccionar las copias" }).click();
  await p.waitForTimeout(600);
  const t2 = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("queda una marcada", t2.includes("1 base marcada"), true);

  console.log("\n── el cartel dice qué se lleva, con números ──");
  await p.getByRole("button", { name: /^Borrar la base$/ }).click();
  await p.waitForTimeout(2500);
  await foto(p, "3-confirmar");

  const t3 = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("dice cuántos leads", /Leads que se borran\s*2/.test(t3), true);
  es("y cuántos contactos", /Contactos que se borran\s*2/.test(t3), true);
  es("y aclara a quién no toca", t3.includes("Quien también tenga leads de otra base se queda"), true);

  console.log("\n── se confirma ──");
  await p.getByRole("button", { name: /^Borrar \d+ leads$/ }).click();
  await p.waitForTimeout(4000);
  await foto(p, "4-borrada");

  es(
    "LA COPIA YA NO ESTÁ",
    sql(`select count(*) from public.importaciones where archivo = '${ARCHIVO}';`),
    "1",
  );
  es(
    "sus dos leads se fueron",
    sql(`select count(*) from public.oportunidades where codigo in ('BUI-0003','BUI-0004');`),
    "0",
  );
  es(
    "y sus contactos, que no estaban en ningún otro lado, también",
    sql(`select count(*) from public.clientes where nombre in ('Baseui Tres','Baseui Cuatro');`),
    "0",
  );
  es(
    "PERO LA BUENA SIGUE ENTERA",
    sql(`select count(*) from public.oportunidades where codigo in ('BUI-0001','BUI-0002');`),
    "2",
  );
  es(
    "con sus contactos",
    sql(`select count(*) from public.clientes where nombre in ('Baseui Uno','Baseui Dos');`),
    "2",
  );

  await p.context().close();
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.importaciones where archivo like 'PRUEBA %';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
