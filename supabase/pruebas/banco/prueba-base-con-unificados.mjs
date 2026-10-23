/**
 * Una base trae gente que ya estaba en el CRM: se unifica y IGUAL figura en
 * la base.
 *
 *     node supabase/pruebas/banco/prueba-base-con-unificados.mjs
 *
 * Pedido el 22/10/2026: «Base de egresados-no graduados.xlsx» traía 285
 * personas y Bases mostraba 23 —las nuevas—. Las otras 262 ya estaban en el
 * CRM; se unificaron con su ficha, que está bien, pero quedaban fuera de la
 * base, y en Clientes no se las podía elegir con el filtro «Base» para
 * mandarles un masivo.
 *
 * Se arman tres personas que ya están (con su lead) y se sube un archivo con
 * esas tres y dos nuevas. Tiene que quedar:
 *   - cinco personas en la base, sin ninguna ficha ni lead repetido;
 *   - las tres de antes siguen siendo de su base de origen (borrar la nueva no
 *     se las lleva);
 *   - en Bases la fila dice 5, y en Clientes el filtro «Base» trae a las 5.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-unif-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

const ARCHIVO = "PRUEBA Egresados.csv";
const ORIGEN = "PRUEBA Origen egresados";
const limpiar = () =>
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select o.id from public.oportunidades o join public.clientes c on c.id = o.cliente_id
        where c.correo like '%@egresado.test');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where correo like '%@egresado.test');
    delete from public.clientes where correo like '%@egresado.test';
    delete from public.importaciones where archivo in ('${ARCHIVO}', '${ORIGEN}');
  `);
limpiar();

// Tres egresados que ya están en el CRM, con su lead, de una base anterior.
sql(`
  with b as (insert into public.importaciones (archivo, filas) values ('${ORIGEN}', 3) returning id),
  c as (
    insert into public.clientes (nombre, correo) values
      ('Egresada  +503-7000-0001', 'uno@egresado.test'),
      ('Egresado Dos', 'dos@egresado.test'),
      ('Egresada Tres', 'tres@egresado.test')
    returning id
  )
  insert into public.oportunidades (codigo, cliente_id, importacion_id, fecha_registro)
  select 'EGR-' || row_number() over (order by c.id), c.id, b.id, current_date from c, b;
`);

// Como el 24/08/2026: el código del grupo guardado como teléfono.
sql("update public.clientes set telefono = 'DSBA-1-2026' where correo = 'dos@egresado.test';");

const csv = [
  "nombre,telefono,correo",
  "Egresada Uno,,uno@egresado.test",
  "Egresado Dos,7088-0002,dos@egresado.test",
  "Egresada Tres,,tres@egresado.test",
  "Egresado Cuatro Núñez,DSCI-1-2026,cuatro@egresado.test",
  "Egresada Cinco,,cinco@egresado.test",
  // La misma persona otra vez (otro programa, mismo correo): se unifica, pero
  // la fila tiene que verse en la base.
  "Egresada Cinco Ruiz,,cinco@egresado.test",
  // Sin nombre: no se importa, pero queda en la base con el motivo.
  ",,seis@egresado.test",
].join("\n");
const RUTA = path.join(os.tmpdir(), ARCHIVO);
// Como lo guarda Excel en Windows: Windows-1252, no UTF-8.
fs.writeFileSync(RUTA, Buffer.from(csv, "latin1"));

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => (process.env.FOTOS ? p.screenshot({ path: `${process.env.FOTOS}/unif-${n}.png` }) : null);

const enLaBase = (archivo) =>
  sql(`select count(*) from public.base_leads b join public.importaciones i on i.id = b.importacion_id
        where i.archivo = '${archivo}';`);

try {
  console.log("── 0. lo de antes quedó anotado en su base ──");
  es("los tres de la base anterior están en ella", enLaBase(ORIGEN), "3");

  console.log("\n── 1. SE SUBE EL ARCHIVO ──");
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
  await foto("1-subida");

  console.log("\n── 2. LO QUE QUEDÓ ──");
  es("sigue habiendo una ficha por persona", sql("select count(*) from public.clientes where correo like '%@egresado.test';"), "5");
  es("y un lead por persona", sql(`select count(*) from public.oportunidades o join public.clientes c on c.id = o.cliente_id where c.correo like '%@egresado.test';`), "5");
  es("LAS CINCO ESTÁN EN LA BASE NUEVA", enLaBase(ARCHIVO), "5");
  es("las tres de antes siguen también en la anterior", enLaBase(ORIGEN), "3");
  es("el nombre que dejó WhatsApp se completó con el del archivo",
    sql("select nombre from public.clientes where correo = 'uno@egresado.test';"), "Egresada Uno");
  es("el código de grupo que estaba como teléfono se reemplazó por el número del archivo",
    sql("select telefono from public.clientes where correo = 'dos@egresado.test';"), "7088-0002");
  es("y un código que llega como teléfono no se guarda",
    sql("select coalesce(telefono, '(vacío)') from public.clientes where correo = 'cuatro@egresado.test';"), "(vacío)");
  es("y las tildes del CSV de Excel entran bien",
    sql("select nombre from public.clientes where correo = 'cuatro@egresado.test';"), "Egresado Cuatro Núñez");
  es("la base nueva sólo CREÓ las dos nuevas (borrarla no se lleva a las de antes)",
    sql(`select count(*) from public.oportunidades o join public.importaciones i on i.id = o.importacion_id where i.archivo = '${ARCHIVO}';`), "2");

  console.log("\n── 3. EN LA PANTALLA DE BASES ──");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.locator('aside button[data-mod="Bases"]').click().catch(() => {});
  await p.waitForTimeout(2000);
  const fila = (await p.locator("main tr", { hasText: ARCHIVO }).first().innerText()).replace(/\s+/g, " ");
  es("la fila de la base dice 5 registros, sin «de N»", /\b5\b/.test(fila) && !/ de \d/.test(fila), true);
  await foto("2-bases");

  console.log("\n── 3b. AL DESPLEGARLA SE VEN TODAS LAS FILAS DEL ARCHIVO ──");
  es("la base guardó las 7 filas del archivo",
    sql(`select count(*) from public.base_filas f join public.importaciones i on i.id = f.importacion_id where i.archivo = '${ARCHIVO}';`), "7");
  await p.locator("main tr", { hasText: ARCHIVO }).first().click();
  await p.locator("[data-filas-de-la-base]").waitFor({ timeout: 15000 });
  es("se ven las 7 filas", await p.locator("[data-fila-base]").count(), 7);
  const resumen = (await p.locator("[data-filas-de-la-base] > p").first().innerText()).replace(/\s+/g, " ");
  es("el resumen dice 7 filas y 5 personas", /7 filas en el archivo · 5 personas en el CRM/.test(resumen), true);
  const repetida = (await p.locator('[data-fila-base="7"]').innerText()).replace(/\s+/g, " ");
  es("la fila repetida se ve con su nombre y dice con quién se unificó", /Egresada Cinco Ruiz/.test(repetida) && /misma persona que la fila 6/.test(repetida), true);
  const sinNombre = (await p.locator('[data-fila-base="8"]').innerText()).replace(/\s+/g, " ");
  es("la fila sin nombre dice por qué no entró", /No se importó: Sin nombre de cliente/.test(sinNombre), true);
  await foto("2b-filas");

  console.log("\n── 4. EL FILTRO «BASE» DE CLIENTES ──");
  // La misma función que usa la pantalla de Clientes, sobre los datos que
  // carga la app: se comprueba con lo que llega al navegador.
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.locator('[data-filtro="f:base"]:visible').first().waitFor({ timeout: 15000 });
  await p.locator('[data-filtro="f:base"]:visible').first().click();
  await p.locator('[data-menu="f:base"]:visible button', { hasText: ARCHIVO }).first().click();
  await p.waitForTimeout(800);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(800);
  const lista = (await p.locator("main tbody").first().innerText()).replace(/\s+/g, " ");
  const quienes = ["Egresada Uno", "Egresado Dos", "Egresada Tres", "Egresado Cuatro", "Egresada Cinco"].filter((n) => lista.includes(n));
  es("la lista es de Clientes, filtrada (5 filas)", await p.locator("main tbody tr").count(), 5);
  es("filtrando por la base aparecen las cinco", quienes.length, 5);
  await foto("3-clientes");

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await p.screenshot({ path: "/tmp/claude-0/fallo-unificados.png" }).catch(() => {});
} finally {
  await nav.close();
  limpiar();
  fs.rmSync(RUTA, { force: true });
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
