/**
 * Subir la misma base dos veces, ¿duplica las fichas?
 *
 *     node supabase/pruebas/banco/prueba-no-duplicar-al-importar.mjs
 *
 * ============================================================================
 * LO QUE AVISÓ LA ESCUELA
 * ============================================================================
 *
 * «Al momento de subir una base de datos siempre se repiten los leads y no se
 * unifican […] o si un vendedor agregó recientemente ese cliente.»
 *
 * Las dos mitades de esa frase son el mismo agujero. La pantalla compara
 * contra las oportunidades que el navegador tiene cargadas, y eso deja afuera
 * tres cosas: lo que no le toca ver a esa persona, lo que se cargó DESPUÉS de
 * abrir la pantalla, y las fichas que no tienen ningún lead.
 *
 * Esta prueba cubre el segundo caso, que es el más fácil de reproducir y el
 * más difícil de ver a ojo: el contacto se crea mientras la pantalla ya está
 * abierta, así que el navegador no puede saberlo. Sólo lo atrapa la
 * comprobación del servidor, que lee la tabla de clientes en el momento de
 * importar.
 *
 * ============================================================================
 * QUÉ TIENE QUE PASAR
 * ============================================================================
 *
 *   LA FICHA NO SE DUPLICA     Una sola por persona, aunque el archivo entre
 *                              dos veces.
 *
 *   EL LEAD SÍ SE SUMA         Cada fila de una planilla es una consulta. Dos
 *                              cargas del mismo archivo dejan dos leads sobre
 *                              LA MISMA ficha —eso se limpia borrando la base
 *                              repetida— y no dos personas distintas, que es
 *                              lo que no se puede deshacer.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-dup-${process.pid}-${Math.random()}.sql`);
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

const ARCHIVO = "PRUEBA Repetida.csv";
const limpiar = () =>
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select o.id from public.oportunidades o join public.clientes c on c.id = o.cliente_id
        where c.nombre like 'Repetido %' or c.correo like '%@repetido.test');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre like 'Repetido %' or correo like '%@repetido.test');
    delete from public.clientes where nombre like 'Repetido %' or correo like '%@repetido.test';
    delete from public.importaciones where archivo like 'PRUEBA Repetida%';
  `);
limpiar();

/*
 * Cinco personas. La primera con correo, la segunda con teléfono y la tercera
 * con los dos: son las tres formas en que se puede reconocer a alguien, y las
 * tres tienen que funcionar.
 */
const csv = [
  "nombre,telefono,correo",
  "Repetido Uno,,uno@repetido.test",
  "Repetido Dos,7088-0002,",
  "Repetido Tres,7088-0003,tres@repetido.test",
  "Repetido Cuatro,7088-0004,cuatro@repetido.test",
  "Repetido Cinco,7088-0005,cinco@repetido.test",
].join("\n");

const RUTA = path.join(os.tmpdir(), ARCHIVO);
fs.writeFileSync(RUTA, csv, "utf8");

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nodup-${n}.png` });

/** Sube el archivo y espera a que termine. */
const importar = async () => {
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Bases"]').click();
  await p.waitForTimeout(1800);
  await p.getByRole("button", { name: /Subir base/ }).click();
  await p.waitForTimeout(1200);
  await p.locator('input[type="file"]').setInputFiles(RUTA);
  await p.waitForTimeout(2500);
  await p.getByRole("button", { name: /Revisar e importar/ }).click();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /^Importar \d+/ }).click();
  await p.waitForTimeout(6000);
};

const fichas = () =>
  sql("select count(*) from public.clientes where correo like '%@repetido.test' or nombre like 'Repetido %';");
const leads = () =>
  sql(`select count(*) from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.correo like '%@repetido.test' or c.nombre like 'Repetido %';`);

console.log("── primera carga ──");
{
  await importar();
  await foto("1-primera");
  es("entran las cinco fichas", fichas(), "5");
  es("con un lead cada una", leads(), "5");
}

console.log("\n── segunda carga del MISMO archivo ──");
{
  /*
   * Es lo que pasó de verdad en la escuela: el mismo archivo subido dos veces
   * el mismo día. Antes esto dejaba diez fichas.
   */
  await importar();
  await foto("2-segunda");

  es("SIGUEN SIENDO CINCO FICHAS", fichas(), "5");

  /*
   * ------------------------------------------------------------------------
   * ACÁ ESTA PRUEBA ESPERABA DIEZ, Y ESTABA ESPERANDO EL PROBLEMA
   * ------------------------------------------------------------------------
   *
   * La ficha no se duplicaba —eso era lo que se estaba arreglando entonces—
   * pero cada carga le colgaba un lead más. Con dos cargas del mismo archivo
   * quedaban cinco personas con dos leads cada una, y la pantalla de Clientes,
   * que lista leads y no fichas, seguía mostrando a cada una dos veces.
   *
   * Para quien mira el CRM eso ES el duplicado, y es lo que la escuela siguió
   * viendo: «todavía se siguen duplicando leads a pesar de que di la opción de
   * unificar». Que la ficha fuera una sola no se notaba desde ninguna pantalla.
   *
   * Ahora la segunda carga cae sobre el lead que ya existe y lo completa. Cinco
   * personas, cinco leads: subir el mismo archivo dos veces no deja rastro, que
   * es lo que uno espera de volver a subir lo mismo.
   */
  es("Y SIGUEN SIENDO CINCO LEADS", leads(), "5");
}

console.log("\n── y el caso del vendedor que la agregó recién ──");
{
  /*
   * El contacto se crea DESPUÉS de que la pantalla ya cargó sus datos, así que
   * el navegador no puede saber que existe. Sólo lo atrapa el servidor, que
   * lee la tabla de clientes en el momento de importar.
   *
   * Se le pone el teléfono escrito de otra forma —con código de país— para
   * comprobar de paso que se reconoce igual.
   */
  sql(`
    insert into public.clientes (nombre, telefono, correo)
    values ('Repetido Seis', '+503 7088 0006', null);
  `);

  const antes = fichas();
  fs.writeFileSync(
    RUTA,
    "nombre,telefono,correo\nRepetido Seis,7088-0006,\nRepetido Siete,7088-0007,\n",
    "utf8",
  );

  await importar();
  await foto("3-recien-agregado");

  // Seis existía y siete es nueva: una sola ficha más.
  es("SÓLO ENTRA LA QUE ERA NUEVA", Number(fichas()) - Number(antes), 1);
  es(
    "y «Seis» sigue siendo una sola",
    sql("select count(*) from public.clientes where nombre like 'Repetido Seis%';"),
    "1",
  );
  es(
    "con su lead colgado de la ficha que ya estaba",
    sql(`select count(*) from public.oportunidades o
          join public.clientes c on c.id = o.cliente_id
         where c.nombre = 'Repetido Seis';`),
    "1",
  );
}

console.log("\n── dos personas con el mismo nombre NO se juntan ──");
{
  /*
   * La otra mitad del cuidado. Acá no hay nadie mirando, y dos alumnas se
   * pueden llamar igual: unir sus fichas sin preguntar mezcla dos historias
   * que después no se separan.
   */
  const antes = fichas();
  fs.writeFileSync(
    RUTA,
    "nombre,telefono,correo\nRepetido Siete,7088-9999,distinta@repetido.test\n",
    "utf8",
  );

  await importar();
  await foto("4-mismo-nombre");
  es("ENTRA COMO FICHA APARTE", Number(fichas()) - Number(antes), 1);
}

await nav.close();
limpiar();
fs.rmSync(RUTA, { force: true });
es(
  "no quedó basura de la prueba",
  sql("select count(*) from public.importaciones where archivo like 'PRUEBA Repetida%';"),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
