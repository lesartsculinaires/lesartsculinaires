/**
 * Subir una base, ¿deja las columnas sueltas en las notas y completa la ficha?
 *
 *     node supabase/pruebas/banco/prueba-notas-de-la-base.mjs
 *
 * ------------------------------------------------------------------------
 * LAS DOS COSAS QUE PIDIÓ LA ESCUELA, EN UN SOLO CAMINO
 * ------------------------------------------------------------------------
 *
 *   LAS COLUMNAS VAN A LAS NOTAS   «cuando se suba una base de datos hay
 *                                  ciertas columnas que tienen información,
 *                                  esa información pasa a las notas».
 *
 *   Y UNIFICAR COMPLETA LA FICHA   «si un cliente tiene número de teléfono y
 *                                  nombre, y en otra base de datos agregan ese
 *                                  mismo cliente y aparece otra información,
 *                                  como el correo, se agrega».
 *
 * Van juntas porque en la vida real pasan juntas: la segunda base trae a gente
 * que ya está, con datos nuevos y con columnas que el CRM no tiene dónde
 * guardar. Se prueban en la misma subida.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO NO SE PUEDE PROBAR SÓLO CON UNIDADES
 * ------------------------------------------------------------------------
 *
 * Porque el camino cruza cuatro piezas —la lectura del archivo, el plan de la
 * pantalla, la acción del servidor y las políticas de la base— y el dato se
 * puede perder en cualquiera. Las pruebas de `importar.ts` y `fusion.ts` dicen
 * que cada pieza hace lo suyo; esta dice que la nota llegó de verdad a la
 * bitácora, con su lead y su recordatorio.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-notasbase-${process.pid}-${Math.random()}.sql`);
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

if (
  sql(`select count(*) from pg_constraint
        where conname = 'seguimientos_tipo_check'
          and pg_get_constraintdef(oid) like '%recuperacion%';`) !== "1"
) {
  console.error("Falta el tipo. Corré 20261006120000_seguimiento_recuperacion.sql.");
  process.exit(1);
}

const ARCHIVO = "PRUEBA columnas a notas.csv";
const VIEJA = "Notabase Yaestaba";   // ya en el CRM: nombre y teléfono, nada más
const NUEVA = "Notabase Reciennueva"; // no está: entra con todo

const limpiar = () => {
  sql(`
    delete from public.seguimientos where oportunidad_id in
      (select o.id from public.oportunidades o join public.clientes c on c.id = o.cliente_id
        where c.nombre like 'Notabase %');
    delete from public.oportunidad_notas where oportunidad_id in
      (select o.id from public.oportunidades o join public.clientes c on c.id = o.cliente_id
        where c.nombre like 'Notabase %');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like 'Notabase %');
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like 'Notabase %');
    delete from public.clientes where nombre like 'Notabase %';
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

// La ficha que ya estaba: con nombre y teléfono, SIN correo y SIN cumpleaños.
// Es el ejemplo textual de la escuela.
sql(`
  insert into public.clientes (nombre, telefono) values ('${VIEJA}', '70880001');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'NTB-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date
    from public.clientes c where c.nombre = '${VIEJA}';
`);

/*
 * El archivo.
 *
 * «Horario de interés» y «Observaciones» son las columnas que el CRM no tiene
 * dónde guardar. «Observaciones» se reconoce sola por el nombre; la otra hay
 * que marcarla a mano, y eso también se prueba: es lo que va a hacer la
 * escuela con cada planilla distinta que suba.
 */
const RUTA_CSV = path.join(os.tmpdir(), ARCHIVO);
fs.writeFileSync(
  RUTA_CSV,
  [
    "Nombre,Teléfono,Correo,Cumpleaños,Horario de interés,Observaciones",
    `${VIEJA},70880001,yaestaba@correo.com,14/03/1998,Sábados por la mañana,Vino de la feria de Antiguo Cuscatlán`,
    `${NUEVA},70880002,nueva@correo.com,02/11/2001,Noches entre semana,RECUPERACION: no contestó dos veces`,
  ].join("\n"),
  "utf8",
);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");
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
      user: { id: JEFA, email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/notasbase-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Bases"]').click();
await p.waitForTimeout(1800);

console.log("── se sube el archivo ──");
await p.getByRole("button", { name: /Subir base/ }).click();
await p.waitForTimeout(1200);
await p.locator('input[type="file"]').setInputFiles(RUTA_CSV);
await p.waitForTimeout(2500);
await foto("1-mapeo");

console.log("\n── lo que el CRM reconoció solo ──");
{
  const destinos = await p.evaluate(() =>
    [...document.querySelectorAll('div[role="dialog"] select')].map((s) => s.value),
  );
  es("el nombre", destinos[0], "nombre");
  es("el teléfono", destinos[1], "telefono");
  es("el correo", destinos[2], "correo");
  es("EL CUMPLEAÑOS", destinos[3], "fecha_nacimiento");
  es("«Horario de interés» no lo pudo saber, y no adivinó", destinos[4], "");
  es("«OBSERVACIONES» SÍ, VA A LAS NOTAS", destinos[5], "nota");
}

console.log("\n── y se marca a mano la que faltaba ──");
{
  await p.locator('div[role="dialog"] select').nth(4).selectOption("nota");
  await p.waitForTimeout(800);

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es(
    "la pantalla avisa cuáles van a quedar como nota",
    texto.includes("Horario de interés") && texto.includes("como nota en la ficha"),
    true,
  );
  await foto("2-marcada");
}

console.log("\n── se importa ──");
{
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("y reconoce que una de las dos ya existe", texto.includes("Se unifican"), true);

  await p.getByRole("button", { name: /Revisar e importar/ }).click();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /^Importar \d+/ }).click();
  await p.waitForTimeout(6000);
  await foto("3-importada");
}

console.log("\n── LA FICHA QUE YA ESTABA SE COMPLETÓ ──");
{
  es(
    "sigue habiendo una sola, no se duplicó",
    sql(`select count(*) from public.clientes where nombre = '${VIEJA}';`),
    "1",
  );
  es(
    "EL CORREO QUE NO TENÍA, AHORA SÍ",
    sql(`select coalesce(correo, '(vacío)') from public.clientes where nombre = '${VIEJA}';`),
    "yaestaba@correo.com",
  );
  es(
    "Y EL CUMPLEAÑOS TAMBIÉN",
    sql(`select coalesce(fecha_nacimiento::text, '(vacío)') from public.clientes where nombre = '${VIEJA}';`),
    "1998-03-14",
  );
  es(
    "el teléfono que ya tenía no se tocó",
    sql(`select telefono from public.clientes where nombre = '${VIEJA}';`),
    "70880001",
  );
  /*
   * ------------------------------------------------------------------------
   * ACÁ SE ESPERABAN DOS LEADS, Y ESOS DOS ERAN EL DUPLICADO
   * ------------------------------------------------------------------------
   *
   * Esta persona ya tenía un lead sin programa, y este archivo —una planilla
   * de contactos, sin columna de programa— le traía otro igual. Antes se le
   * colgaba un segundo lead, y en la pantalla de Clientes, que lista leads,
   * aparecía dos veces. Es lo que la escuela reportó: «todavía se siguen
   * duplicando leads a pesar de que di la opción de unificar».
   *
   * Ahora la fila cae sobre el lead que ya tenía y lo completa. Sigue siendo
   * uno, y todo lo de arriba —el correo, el cumpleaños— entró igual: esa es la
   * parte que había que conservar y que sigue probada tal cual.
   *
   * Si el archivo trajera un PROGRAMA distinto al del lead viejo sí se abriría
   * un segundo, porque serían dos ventas. Ese caso lo cubre
   * `prueba-unificar-un-solo-lead.mjs`.
   */
  es(
    "Y SIGUE SIENDO UN SOLO LEAD, COMPLETADO",
    sql(`
      select count(*) from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${VIEJA}';
    `),
    "1",
  );
}

console.log("\n── LAS COLUMNAS SUELTAS QUEDARON EN LA BITÁCORA ──");
{
  es(
    "la ficha que ya estaba tiene su nota",
    sql(`
      select count(*) from public.oportunidad_notas n
        join public.oportunidades o on o.id = n.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${VIEJA}' and n.origen = 'importacion';
    `),
    "1",
  );
  es(
    "CON LAS DOS COLUMNAS Y SU ENCABEZADO ADELANTE",
    sql(`
      select n.nota from public.oportunidad_notas n
        join public.oportunidades o on o.id = n.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${VIEJA}' and n.origen = 'importacion';
    `).replace(/\n/g, " | "),
    "Horario de interés: Sábados por la mañana | Observaciones: Vino de la feria de Antiguo Cuscatlán",
  );
  es(
    "y la ficha nueva, la suya",
    sql(`
      select count(*) from public.oportunidad_notas n
        join public.oportunidades o on o.id = n.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${NUEVA}' and n.nota like '%no contestó dos veces%';
    `),
    "1",
  );
}

console.log("\n── y «RECUPERACION» en una columna agenda la llamada ──");
{
  /*
   * Éste es el punto de subir la columna: la base vieja de recuperaciones
   * entra al CRM ya con la agenda armada, sin que nadie relea trescientas
   * filas para anotar las llamadas a mano.
   */
  es(
    "quedó el recordatorio",
    sql(`
      select s.tipo from public.seguimientos s
        join public.oportunidades o on o.id = s.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${NUEVA}';
    `),
    "recuperacion",
  );
  es(
    "para dentro de una semana",
    sql(`
      select (s.proxima - current_date)::text from public.seguimientos s
        join public.oportunidades o on o.id = s.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${NUEVA}';
    `),
    "7",
  );
  es(
    "y la otra fila, que no decía nada, no agendó nada",
    sql(`
      select count(*) from public.seguimientos s
        join public.oportunidades o on o.id = s.oportunidad_id
        join public.clientes c on c.id = o.cliente_id
       where c.nombre = '${VIEJA}';
    `),
    "0",
  );
}

console.log("\n── una sola base, como corresponde ──");
es(
  "no se duplicó el encabezado",
  sql(`select count(*) from public.importaciones where archivo = '${ARCHIVO}';`),
  "1",
);

await nav.close();
limpiar();
fs.rmSync(RUTA_CSV, { force: true });
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre like 'Notabase %';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
