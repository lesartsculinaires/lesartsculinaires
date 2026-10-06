/**
 * Programas, mes a mes.
 *
 *     node supabase/pruebas/banco/prueba-programas-por-mes.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Que en el módulo de programas los leads y datos que aparecen se vayan
 * actualizando cada mes, y que en la parte de arriba aparezca por mes cuántos
 * leads hay.»
 *
 * Antes cada tarjeta contaba todo lo cargado desde que existe el CRM: decía lo
 * mismo el 1 de octubre que el 31, y los que entraron en octubre no se veían.
 *
 * ============================================================================
 * LO QUE SE VIGILA
 * ============================================================================
 *
 *   QUE EL MES FILTRE DE VERDAD   Cambiar de mes tiene que cambiar los números
 *                                 de las tarjetas, no sólo el botón resaltado.
 *
 *   QUE EL CATÁLOGO NO SE ACHIQUE  Un programa sin leads este mes NO desaparece:
 *                                 esta pantalla también sirve para administrar
 *                                 programas, y para eso están todos.
 *
 *   QUE EL CLIC ABRA LO MISMO     La tarjeta dice «2 leads» de octubre; el clic
 *                                 tiene que abrir esos dos y no los de siempre.
 *                                 Dos números distintos para lo que parece la
 *                                 misma pregunta es peor que no tener el filtro.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ── dos meses con cantidades distintas, en un mismo programa ───────────────
const N = String(Date.now()).slice(-7);
const hoy = new Date();
const dd = (n) => String(n).padStart(2, "0");

const claveDe = (d) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}`;
const MES_HOY = claveDe(hoy);
const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15);
const MES_PREVIO = claveDe(anterior);

const limpiar = () => {
  sql(`delete from public.oportunidades where codigo like 'PRG-${N}-%'`);
  sql(`delete from public.clientes where nombre like 'PRG ${N} %'`);
};
limpiar();

const prog = sql(`select id from public.productos where activo order by id limit 1`);
const nombreProg = sql(`select nombre from public.productos where id=${prog}`);
const canal = sql(`select id from public.canales order by id limit 1`);

/** Cuántos programas hay en el catálogo: el número que NO tiene que moverse. */
const enCatalogo = Number(sql(`select count(*) from public.productos`));

const sembrar = (mesClave, dia, i) => {
  sql(`insert into public.clientes (nombre) values ('PRG ${N} ${mesClave}-${i}')`);
  const cliente = sql(`select id from public.clientes where nombre='PRG ${N} ${mesClave}-${i}'`);
  sql(
    `insert into public.oportunidades (codigo, cliente_id, canal_id, producto_id, fecha_registro)
     values ('PRG-${N}-${mesClave}-${i}', ${cliente}, ${canal}, ${prog}, '${mesClave}-${dd(dia)}')`,
  );
};

// Tres este mes, uno el mes pasado: si el filtro no funcionara, los dos meses
// mostrarían el mismo número y la prueba no distinguiría nada.
sembrar(MES_HOY, 4, 1);
sembrar(MES_HOY, 11, 2);
sembrar(MES_HOY, 18, 3);
sembrar(MES_PREVIO, 9, 4);

/** Cuántos leads tiene ese programa en ese mes, según la base. */
const enBase = (mesClave) =>
  Number(
    sql(
      `select count(*) from public.oportunidades
       where producto_id=${prog} and to_char(fecha_registro,'YYYY-MM')='${mesClave}'`,
    ),
  );

// ── la pantalla ────────────────────────────────────────────────────────────

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
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
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1100 } });
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

await p.goto("http://127.0.0.1:3142/?mod=Programas", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);

/** La tarjeta de nuestro programa. */
const tarjeta = p.locator("section.card").filter({ hasText: nombreProg }).first();
/** El texto del botón de leads de esa tarjeta. */
const leadsDeLaTarjeta = async () => (await tarjeta.innerText()).replace(/\s+/g, " ");

console.log("── 1. ARRIBA, CADA MES CON SU CUENTA ──");
{
  es("la pantalla no tiró ningún error", errores, []);

  const botonHoy = p.locator(`[data-periodo="${MES_HOY}"]`);
  es("el mes en curso tiene su botón", await botonHoy.count(), 1);
  es("y viene puesto de entrada", await botonHoy.getAttribute("data-puesto"), "si");

  /*
   * La cuenta del botón es la del mes ENTERO —todos los programas—, que es lo
   * que se pidió ver arriba. Se compara contra la base.
   */
  const delMes = Number(
    sql(`select count(*) from public.oportunidades where to_char(fecha_registro,'YYYY-MM')='${MES_HOY}'`),
  );
  es("el botón lleva la cuenta del mes", await botonHoy.getAttribute("data-leads"), String(delMes));

  const botonPrevio = p.locator(`[data-periodo="${MES_PREVIO}"]`);
  const delPrevio = Number(
    sql(`select count(*) from public.oportunidades where to_char(fecha_registro,'YYYY-MM')='${MES_PREVIO}'`),
  );
  es("y el mes anterior la suya", await botonPrevio.getAttribute("data-leads"), String(delPrevio));
  es("QUE SON DISTINTAS", delMes !== delPrevio, true);
}

console.log("\n── 2. LA TARJETA MUESTRA LOS DEL MES ELEGIDO ──");
{
  const texto = await leadsDeLaTarjeta();
  es(
    `${nombreProg} dice los ${enBase(MES_HOY)} de este mes`,
    texto.includes(`${enBase(MES_HOY)} leads`),
    true,
  );
  es("y son los tres sembrados", enBase(MES_HOY) >= 3, true);
}

console.log("\n── 3. CAMBIAR DE MES CAMBIA LOS NÚMEROS ──");
{
  await p.locator(`[data-periodo="${MES_PREVIO}"]`).click();
  await p.waitForTimeout(600);

  es(
    "el mes anterior queda puesto",
    await p.locator(`[data-periodo="${MES_PREVIO}"]`).getAttribute("data-puesto"),
    "si",
  );

  const texto = await leadsDeLaTarjeta();
  const esperados = enBase(MES_PREVIO);
  es(
    `ahora la tarjeta dice ${esperados}`,
    texto.includes(esperados === 1 ? "1 lead" : `${esperados} leads`),
    true,
  );
  es("Y NO LOS DEL MES EN CURSO", texto.includes(`${enBase(MES_HOY)} leads`), false);
}

console.log("\n── 4. EL CATÁLOGO NO SE ACHICA ──");
{
  /*
   * Lo que se filtra son los NÚMEROS, no la lista. Un programa sin leads este
   * mes tiene que seguir estando: esta pantalla también sirve para
   * administrarlos.
   */
  es(
    "están todos los programas del catálogo",
    await p.locator("section.card").count(),
    enCatalogo,
  );
}

console.log("\n── 5. EL CLIC ABRE LO MISMO QUE DICE LA TARJETA ──");
{
  // Volvemos al mes en curso, que tiene tres.
  await p.locator(`[data-periodo="${MES_HOY}"]`).click();
  await p.waitForTimeout(600);

  await tarjeta.getByText(/leads? ›/).click();
  await p.waitForTimeout(1200);

  /*
   * El módulo se mira en el título y no en la URL: la aplicación cambia de
   * pantalla por estado, sin reescribir la dirección. Mirar la URL daba rojo
   * con la pantalla correcta delante.
   */
  es("se fue a Clientes", (await p.locator("h1").first().innerText()).trim(), "Clientes");

  /*
   * La comprobación que importa: lo que se abrió tiene que ser del mes, no
   * todo el histórico del programa. Si el mes no viajara, acá habría más filas.
   */
  const totalHistorico = Number(
    sql(`select count(*) from public.oportunidades where producto_id=${prog}`),
  );
  es(
    "el mes y el histórico son distintos, así que esto distingue algo",
    enBase(MES_HOY) !== totalHistorico,
    true,
  );

  /*
   * Se cuentan las FILAS de la tabla, no si un número aparece en el texto.
   *
   * La primera versión de esta prueba miraba `cuerpo.includes("6")`, y eso lo
   * cumple cualquier pantalla que tenga un seis en cualquier parte: con el mes
   * quitado a propósito seguía en verde. Contar filas es lo único que
   * distingue «filtró por octubre» de «abrió todo el programa».
   */
  const filas = await p.locator("table tbody tr").count();
  es(`se listan los ${enBase(MES_HOY)} del mes`, filas, enBase(MES_HOY));
  es("Y NO LOS DEL HISTÓRICO COMPLETO", filas === totalHistorico, false);
}

await p.goto("http://127.0.0.1:3142/?mod=Programas", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: "/tmp/programas-por-mes.png", fullPage: false });
console.log("\n(captura en /tmp/programas-por-mes.png)");

es("ningún error de navegador en toda la corrida", errores, []);

await nav.close();
limpiar();
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
