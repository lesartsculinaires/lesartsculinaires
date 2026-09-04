/**
 * Los montos de la ficha: el orden, los rótulos, y que cada casilla siga
 * siendo la suya.
 *
 *     node supabase/pruebas/banco/prueba-orden-de-los-montos.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA, EN DOS RONDAS
 * ============================================================================
 *
 * PRIMERO: «Quiero que me cambies el orden de Valor de oportunidad a Venta
 * cerrada y viceversa. La fórmula está bien; es más en cuestión de términos.»
 * Preguntado cuál de las lecturas era, eligió mover los renglones: la casilla
 * de `venta_cerrada` arriba, «Reserva» en el medio, la de `valor_oportunidad`
 * abajo.
 *
 * DESPUÉS: «donde dice Venta cerrada, pásalo a Valor de oportunidad, y donde
 * dice Valor de oportunidad, pásalo a Venta cerrada. No toques la fórmula.»
 * Preguntado otra vez —porque el rótulo solo en la ficha dejaría al tablero
 * diciendo otra cosa del mismo número— eligió intercambiarlos EN TODO EL CRM.
 *
 * Así que hoy los rótulos están cruzados respecto de las columnas, a
 * propósito y en un solo lugar, `src/lib/montosDelLead.ts`:
 *
 *     columna `venta_cerrada`      se muestra como «Valor de oportunidad»
 *     columna `valor_oportunidad`  se muestra como «Venta cerrada»
 *
 * El orden de los renglones no se movió: sigue el de la primera ronda. Lo que
 * cambió es cómo se llaman, y los números NO se movieron con los nombres.
 *
 * ============================================================================
 * POR QUÉ ESTO SE PRUEBA Y NO SE MIRA Y LISTO
 * ============================================================================
 *
 * Porque el riesgo de mover dos bloques de código no es que queden en el orden
 * equivocado —eso se ve—, sino que una casilla termine escribiendo la columna
 * de la otra. Eso NO se ve: la ficha se vería perfecta y cada venta cerrada
 * que alguien escribiera se guardaría como valor de oportunidad, corrompiendo
 * los informes de a poco y sin avisar.
 *
 * Así que lo que se comprueba de verdad es lo de abajo: se escribe un número
 * en cada casilla y se va a mirar a la base en qué columna cayó.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/*
 * Los rótulos de hoy, copiados de `src/lib/montosDelLead.ts`.
 *
 * Copiados y no importados porque esto es un .mjs y aquello es TypeScript, y
 * traer un compilador para leer dos textos costaría más de lo que arregla. Se
 * llaman por su COLUMNA, igual que allá: es lo que evita cruzarlos al leer.
 */
const ROTULO_CERRADA = "Valor de oportunidad";   // rotula `venta_cerrada`
const ROTULO_VALOR = "Venta cerrada";            // rotula `valor_oportunidad`

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-montos-${process.pid}-${Math.random()}.sql`);
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

const QUIEN = "Montos Prueba Orden";
const limpiar = () => sql(`delete from public.clientes where nombre = '${QUIEN}';`);
limpiar();

// Los mismos números de la ficha que mandó la escuela: 495 de valor, 165 de
// reserva, 395 de venta cerrada.
sql(`
  insert into public.clientes (nombre, correo) values ('${QUIEN}', 'montos.prueba@lac.test');

  insert into public.oportunidades
    (codigo, cliente_id, fecha_registro, valor_oportunidad, reserva, venta_cerrada)
  select 'CRM-7701', c.id, '2026-08-25', 495, 165, 395
    from public.clientes c where c.nombre = '${QUIEN}';
`);

const enLaBase = (columna) =>
  sql(`select coalesce(${columna}::text, 'null') from public.oportunidades where codigo = 'CRM-7701';`);

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/montos-${n}.png` });

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2200);
await p.getByPlaceholder(/Buscar/).fill("Montos Prueba");
await p.waitForTimeout(1500);
await p.locator('main tbody tr:has-text("CRM-7701")').click();
await p.waitForTimeout(2200);
await foto("1-ficha");

console.log("── EL ORDEN QUE SE PIDIÓ ──");
{
  /*
   * Se leen los rótulos en el orden en que aparecen en la ficha.
   *
   * Ojo con leer esto rápido: arriba va la casilla de la columna
   * `venta_cerrada`, que desde el intercambio se ROTULA «Valor de
   * oportunidad». No es un error de tipeo ni una casilla cruzada; es
   * exactamente lo que pidió la escuela, y las tres comprobaciones de abajo
   * —cada número en su columna— son las que lo demuestran.
   */
  const t = (await p.locator("aside, [role=dialog]").last().innerText()).replace(/\s+/g, " ");

  const posCerrada = t.indexOf(ROTULO_CERRADA);
  const posReserva = t.indexOf("Reserva");
  const posValor = t.indexOf(ROTULO_VALOR);

  es("están los tres", posCerrada >= 0 && posReserva >= 0 && posValor >= 0, true);
  es("LA CASILLA DE `venta_cerrada` VA ARRIBA", posCerrada < posValor, true);
  es("y la reserva queda en el medio", posReserva > posCerrada && posReserva < posValor, true);
}

console.log("\n── los números no se movieron con las etiquetas ──");
{
  // Lo que estaba guardado sigue en su columna: mover un renglón no toca datos.
  es("el valor sigue siendo 495", enLaBase("valor_oportunidad"), "495.00");
  es("la reserva 165", enLaBase("reserva"), "165.00");
  es("y la venta cerrada 395", enLaBase("venta_cerrada"), "395.00");
}

console.log("\n── CADA CASILLA ESCRIBE SU PROPIA COLUMNA ──");
{
  /*
   * La comprobación que de verdad importa. Si al mover los bloques se hubiera
   * cruzado un `guardar`, la ficha se vería igual de bien y cada número que
   * alguien escribiera caería en la columna equivocada, sin ningún aviso.
   *
   * Se escribe un número distinto y reconocible en cada una y se va a mirar la
   * base.
   */
  const escribir = async (etiqueta, valor) => {
    const fila = p.locator(`tr:has-text("${etiqueta}"), div:has-text("${etiqueta}")`).last();
    const caja = fila.locator('input[inputmode="decimal"], input[type="number"], input').last();
    await caja.click();
    await caja.fill(String(valor));
    await caja.blur();
    await p.waitForTimeout(700);
  };

  await escribir(ROTULO_CERRADA, 111);
  await escribir("Reserva", 222);
  await escribir(ROTULO_VALOR, 333);
  await foto("2-escrito");

  /*
   * La ficha no escribe sola: junta los cambios y los muestra para repasarlos.
   * Son dos pasos —«Guardar cambios» abre el repaso, «Aceptar y guardar»
   * escribe— y hay que dar los dos, que es justo lo que hace una persona.
   */
  await p.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await p.waitForTimeout(1200);
  await foto("3-repaso");

  await p.getByRole("button", { name: /Aceptar y guardar/ }).click();
  await p.waitForTimeout(3000);
  await foto("4-guardado");

  es("EL 111 CAYÓ EN VENTA CERRADA", enLaBase("venta_cerrada"), "111.00");
  es("el 222 en reserva", enLaBase("reserva"), "222.00");
  es("Y EL 333 EN VALOR DE OPORTUNIDAD", enLaBase("valor_oportunidad"), "333.00");
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql(`select count(*) from public.clientes where nombre = '${QUIEN}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
