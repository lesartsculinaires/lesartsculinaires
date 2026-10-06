/**
 * El día a día del Dashboard: que se vea, que sume, y que sea interactivo.
 *
 *     node supabase/pruebas/banco/prueba-dia-a-dia.mjs
 *
 * ============================================================================
 * LO QUE SE COMPRUEBA ACÁ Y NO EN LA PRUEBA DE UNIDAD
 * ============================================================================
 *
 * `diaADia.test.mjs` ya comprueba que las cuentas salgan bien. Eso se puede
 * hacer sin navegador y es donde van los casos raros.
 *
 * Acá se comprueba lo único que no se puede comprobar sin abrir la pantalla:
 *
 *   QUE LLEGUE EL DATO     Los números del gráfico salen de la base, no de un
 *                          arreglo escrito a mano. Si mañana alguien cambia de
 *                          dónde lee el Dashboard, esto se pone en rojo.
 *
 *   QUE RESPONDA AL CLIC   Es lo que pidió la escuela —«que sea interactiva cada
 *                          gráfica»—. Un gráfico que dibuja bien y no contesta
 *                          al clic cumple la mitad del pedido.
 *
 *   QUE SE PUEDA LEER      Sin distinguir los colores: la leyenda con los
 *                          nombres escritos y la vista de tabla. La paleta tiene
 *                          tres tonos por debajo de 3:1 contra el blanco, así
 *                          que esto no es un extra, es la condición para poder
 *                          usarlos.
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

// ── los leads de la prueba, repartidos en días y canales conocidos ─────────
//
// Se siembran en el MES EN CURSO porque es el que el tablero abre solo. Dos
// días distintos y dos canales distintos: con un solo día no se podría
// distinguir «dibujó el día correcto» de «dibujó cualquiera».
const N = String(Date.now()).slice(-7);
const hoy = new Date();
const AÑO = hoy.getFullYear();
const MES = hoy.getMonth() + 1;
const dd = (n) => String(n).padStart(2, "0");
const CLAVE_MES = `${AÑO}-${dd(MES)}`;
const DIA_A = 6;
const DIA_B = 13;

const limpiar = () => {
  sql(`delete from public.oportunidades where codigo like 'DIA-${N}-%'`);
  sql(`delete from public.clientes where nombre like 'DIA ${N} %'`);
};
limpiar();

/*
 * Los nombres salen de la base y no se escriben acá.
 *
 * El canal de WhatsApp está cargado como «Whatsapp» en el banco y como
 * «WhatsApp» en producción. Una prueba que escriba el nombre a mano se rompe
 * por una mayúscula y no por el código que viene a vigilar.
 */
const canalWa = sql(`select id from public.canales where lower(nombre) like 'whats%' limit 1`);
const canalIg = sql(`select id from public.canales where lower(nombre) like 'instagram%' limit 1`);
if (!canalWa || !canalIg) throw new Error("El banco no tiene los canales de WhatsApp e Instagram.");
const nombreWa = sql(`select nombre from public.canales where id=${canalWa}`);
const nombreIg = sql(`select nombre from public.canales where id=${canalIg}`);

const productos = sql(
  `select string_agg(id::text, ',' order by id) from (select id from public.productos where activo order by id limit 2) t`,
).split(",");
if (productos.length < 2) throw new Error("El banco necesita al menos dos programas activos.");
const [progA, progB] = productos;
const nombreProgA = sql(`select nombre from public.productos where id=${progA}`);

/** Siembra un lead en un día, canal y programa concretos. */
const sembrar = (dia, canal, producto, i) => {
  sql(
    `insert into public.clientes (nombre, telefono) values ('DIA ${N} ${dia}-${i}', NULL)`,
  );
  const cliente = sql(`select id from public.clientes where nombre='DIA ${N} ${dia}-${i}'`);
  sql(
    `insert into public.oportunidades (codigo, cliente_id, canal_id, producto_id, fecha_registro)
     values ('DIA-${N}-${dia}-${i}', ${cliente}, ${canal}, ${producto}, '${AÑO}-${dd(MES)}-${dd(dia)}')`,
  );
};

// Día A: 3 leads (2 WhatsApp + 1 Instagram). Día B: 1 lead (WhatsApp).
sembrar(DIA_A, canalWa, progA, 1);
sembrar(DIA_A, canalWa, progA, 2);
sembrar(DIA_A, canalIg, progB, 3);
sembrar(DIA_B, canalWa, progA, 4);

/*
 * Cuántos hay EN LA BASE ese día — todos, no sólo los de esta prueba.
 *
 * El banco se arma con sus propios leads inventados, y algunos caen en este
 * mismo mes. Contar sólo los sembrados acá haría que la prueba exigiera un
 * número más chico que el real y fallara por tener razón el gráfico.
 */
const enBase = (dia) =>
  sql(
    `select count(*) from public.oportunidades where fecha_registro='${AÑO}-${dd(MES)}-${dd(dia)}'`,
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
/*
 * El aviso de pendientes se da por visto antes de abrir.
 *
 * Es un diálogo modal: si aparece, tapa el tablero y los clics de la prueba van
 * a parar a él. No se está esquivando nada de lo que se quiere probar —el aviso
 * tiene su propia prueba— sino sacando de en medio algo que no es el asunto.
 */
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

await p.goto("http://127.0.0.1:3142/?mod=Dashboard", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);

const grafico = p.locator(`[data-dia-a-dia="${CLAVE_MES}"]`);

console.log("── 1. EL GRÁFICO SALE, Y CON LOS DATOS DE LA BASE ──");
{
  es("la pantalla no tiró ningún error", errores, []);
  es("el día a día está en pantalla", await grafico.count(), 1);

  /*
   * El número del gráfico contra el número de la base. Es lo que convierte
   * esto en «está conectado» y no «dibuja algo».
   */
  const leadsDiaA = await grafico
    .locator(`[data-grafico="canales"] [data-dia="${DIA_A}"]`)
    .getAttribute("data-leads");
  es(`el día ${DIA_A} dibuja los que hay en la base`, leadsDiaA, enBase(DIA_A));
  es("y son al menos los tres sembrados", Number(leadsDiaA) >= 3, true);

  const leadsDiaB = await grafico
    .locator(`[data-grafico="canales"] [data-dia="${DIA_B}"]`)
    .getAttribute("data-leads");
  es(`el día ${DIA_B} también`, leadsDiaB, enBase(DIA_B));
}

console.log("\n── 2. TODOS LOS DÍAS DEL MES OCUPAN SU LUGAR ──");
{
  const cuantos = new Date(AÑO, MES, 0).getDate();
  es(
    "hay una columna por día del mes",
    await grafico.locator('[data-grafico="canales"] [data-dia]').count(),
    cuantos,
  );
  /*
   * Un día sin leads tiene que estar igual. Si se saltaran, el calendario se
   * correría y el día 13 quedaría dibujado donde va otro.
   */
  const vacio = DIA_A + 1 === DIA_B ? DIA_A + 2 : DIA_A + 1;
  es(
    `el día ${vacio}, sin leads, sigue teniendo su columna`,
    await grafico.locator(`[data-grafico="canales"] [data-dia="${vacio}"]`).count(),
    1,
  );
}

console.log("\n── 3. LOS DOS GRÁFICOS: CANAL Y DIPLOMADO ──");
{
  es("el de canales está", await grafico.locator('[data-grafico="canales"]').count(), 1);
  es("el de programas está", await grafico.locator('[data-grafico="programas"]').count(), 1);
  es(
    `la leyenda nombra ${nombreWa}, sin depender del color`,
    await grafico.locator(`[data-grafico="canales"] [data-serie="${nombreWa}"]`).count(),
    1,
  );
  es(
    "y la de programas nombra el diplomado",
    await grafico.locator(`[data-grafico="programas"] [data-serie="${nombreProgA}"]`).count(),
    1,
  );
}

console.log("\n── 4. ES INTERACTIVO: EL CLIC EN UN DÍA ABRE ESE DÍA ──");
{
  es("antes de tocar nada, no hay día fijado", await grafico.locator("[data-detalle-vacio]").count(), 1);

  await grafico.locator(`[data-grafico="canales"] [data-dia="${DIA_A}"]`).click();
  await p.waitForTimeout(400);

  es(
    `el detalle es del día ${DIA_A}`,
    await grafico.locator(`[data-detalle-dia="${DIA_A}"]`).count(),
    1,
  );

  const texto = (await grafico.locator(`[data-detalle-dia="${DIA_A}"]`).innerText()).replace(/\s+/g, " ");
  es("dice cuántos leads fueron, y es el número de la base", texto.includes(`${enBase(DIA_A)} leads`), true);
  es(
    "Y NOMBRA LOS CANALES, con su número",
    texto.includes(nombreWa) && texto.includes(nombreIg),
    true,
  );
  es("y también el diplomado", texto.includes(nombreProgA), true);

  /*
   * Segundo clic: se suelta. Y hay que SACAR EL RATÓN de la columna para
   * comprobarlo: con el cursor encima el detalle se sigue viendo, que es lo que
   * tiene que pasar —soltar el clic no apaga la vista previa del ratón—.
   */
  await grafico.locator(`[data-grafico="canales"] [data-dia="${DIA_A}"]`).click();
  await p.mouse.move(5, 5);
  await p.waitForTimeout(400);
  es("el segundo clic lo suelta", await grafico.locator("[data-detalle-vacio]").count(), 1);
}

console.log("\n── 5. LA VISTA DE TABLA: LA MISMA VERDAD SIN UN SOLO COLOR ──");
{
  await grafico.locator("[data-ver-tabla]").click();
  await p.waitForTimeout(400);

  es("la tabla aparece", await grafico.locator("[data-tabla-dia-a-dia]").count(), 1);
  es("y los gráficos se van", await grafico.locator('[data-grafico="canales"]').count(), 0);

  const filas = await grafico.locator("[data-tabla-dia-a-dia] tbody tr").count();
  es("una fila por día del mes", filas, new Date(AÑO, MES, 0).getDate());

  const tabla = (await grafico.locator("[data-tabla-dia-a-dia]").innerText()).replace(/\s+/g, " ");
  es("con los canales por nombre", tabla.includes(nombreWa), true);

  await grafico.locator("[data-ver-tabla]").click();
  await p.waitForTimeout(400);
  es("y se puede volver a los gráficos", await grafico.locator('[data-grafico="canales"]').count(), 1);
}

console.log("\n── 6. SE PUEDE USAR SIN RATÓN ──");
{
  /*
   * Las columnas son `button`: se llega con el tabulador y el foco abre el
   * detalle igual que el ratón. Un gráfico al que sólo se llega apuntando deja
   * afuera a quien no puede apuntar.
   */
  await grafico.locator(`[data-grafico="canales"] [data-dia="${DIA_B}"]`).focus();
  await p.waitForTimeout(300);
  es(
    `con el foco en el día ${DIA_B} se ve su detalle`,
    await grafico.locator(`[data-detalle-dia="${DIA_B}"]`).count(),
    1,
  );
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  es("y con Enter queda fijado", await grafico.locator(`[data-detalle-dia="${DIA_B}"]`).count(), 1);
}

await p.screenshot({ path: "/tmp/dia-a-dia.png", fullPage: false });
console.log("\n(captura en /tmp/dia-a-dia.png)");

es("ningún error de navegador en toda la corrida", errores, []);

await nav.close();
limpiar();
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
