/**
 * El horario del diplomado, ¿lo escribe ventas y sale en el link de registro?
 *
 *     node supabase/pruebas/banco/prueba-horario-del-diplomado.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Agregar un campo de Horarios del diplomado cerrado para que aparezca cuando
 * se manda el link de registro.» Y después, la parte difícil: «el horario es
 * por programa, pero esto varía en relación a que se está cambiando el horario
 * constantemente en cada año».
 *
 * ------------------------------------------------------------------------
 * DÓNDE SE ROMPE ESTO
 * ------------------------------------------------------------------------
 *
 * En el año que viene, no hoy.
 *
 * Lo fácil habría sido una sola columna en `productos`: el recibo la lee y
 * listo. Anda perfecto hasta el día en que dirección carga el calendario
 * nuevo, y ahí, sin que nadie toque ninguna ficha, todos los recibos ya
 * emitidos empiezan a decir el horario del año siguiente. Académica inscribe a
 * la gente del año pasado en los días equivocados y nadie sabe por qué.
 *
 * Por eso son dos columnas y por eso la prueba más importante de este archivo
 * es la última: cambiar el horario del programa NO tiene que cambiar el de una
 * inscripción ya cerrada.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-horario-${process.pid}-${Math.random()}.sql`);
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
  sql(`select count(*) from information_schema.columns
        where table_name = 'vw_pipeline' and column_name = 'horario';`) !== "1"
) {
  console.error("Falta la columna. Corré 20261008120000_horario_del_diplomado.sql.");
  process.exit(1);
}

const CLIENTE = "Horario Prueba";
const PROGRAMA = "PRUEBA Diplomado de Horarios";
const DEL_PROGRAMA = "Sábados de 8:00 a 12:00, del 15/02 al 20/06";
const CERRADO = "Domingos de 9:00 a 13:00 (grupo especial)";

const limpiar = () => {
  sql(`
    delete from public.enlaces_pago where oportunidad_id in
      (select id from public.oportunidades where codigo = 'HOR-0001');
    delete from public.oportunidades where codigo = 'HOR-0001';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${CLIENTE}');
    delete from public.clientes where nombre = '${CLIENTE}';
    delete from public.productos where nombre = '${PROGRAMA}';
  `);
};
limpiar();

sql(`
  insert into public.productos (nombre, categoria, horario)
  values ('${PROGRAMA}', 'Diplomado', '${DEL_PROGRAMA}');

  insert into public.clientes (nombre, telefono, pais)
  values ('${CLIENTE}', '70770001', 'Guatemala');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'HOR-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos where nombre = '${PROGRAMA}'),
         (select id from public.etapas order by orden limit 1),
         current_date, 850
    from public.clientes c where c.nombre = '${CLIENTE}';
`);

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/horario-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2000);

console.log("── se abre la ficha ──");
await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(2000);
await foto("1-ficha");

{
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("está el campo del horario", texto.includes("Horario del diplomado"), true);
  es(
    "y avisa que falta, antes de mandar el link",
    texto.includes("no tiene cargado el horario del diplomado") ||
      texto.includes("no tiene cargado el"),
    true,
  );
}

console.log("\n── el horario del programa se ofrece con un clic ──");
{
  /*
   * Éste es el punto de que exista `productos.horario`: que ventas no teclee
   * el mismo horario en trescientos leads.
   *
   * Mientras el lead no tiene horario propio, el del programa es el texto en
   * gris de la casilla; la pastilla aparece al enfocarla —como el resto de las
   * sugerencias de la ficha— y lo mete de verdad con un clic.
   */
  const caja = p.locator(`textarea[placeholder="${DEL_PROGRAMA}"]`);
  es("la casilla muestra el del programa en gris", await caja.count(), 1);

  await caja.click();
  await p.waitForTimeout(500);

  const pastilla = p.getByRole("button", { name: DEL_PROGRAMA });
  es("y enfocada, ofrece la pastilla", await pastilla.count(), 1);
  await foto("2-pastilla");

  await pastilla.click();
  await p.waitForTimeout(500);
  es("un clic lo escribe", await caja.inputValue(), DEL_PROGRAMA);
}

console.log("\n── pero ventas escribe el suyo ──");
{
  // Se cerró con este alumno en otro horario: un grupo especial. Es el caso
  // que obliga a que el campo sea del lead y no del programa.
  const caja = p.locator(`textarea[placeholder="${DEL_PROGRAMA}"]`);
  await caja.fill(CERRADO);
  await caja.blur();
  es("se pudo escribir en el campo", await caja.count(), 1);
  await p.waitForTimeout(800);

  await p.getByRole("button", { name: /Guardar cambios/ }).first().click();
  await p.waitForTimeout(1200);
  // El repaso de cambios pide confirmar.
  const confirmar = p.getByRole("button", { name: /^Guardar$|Confirmar|Aceptar/ });
  if (await confirmar.count()) await confirmar.first().click();
  await p.waitForTimeout(2500);
  await foto("3-guardado");

  es(
    "QUEDÓ GUARDADO EN EL LEAD",
    sql(`select coalesce(horario, '(vacío)') from public.oportunidades where codigo = 'HOR-0001';`),
    CERRADO,
  );
  es(
    "y el del programa no se tocó",
    sql(`select horario from public.productos where nombre = '${PROGRAMA}';`),
    DEL_PROGRAMA,
  );
}

console.log("\n── y sale en el link de registro ──");
{
  const token = "prueba" + "H".repeat(30);
  sql(`
    insert into public.enlaces_pago (token, oportunidad_id, vence_en)
    select '${token}', id, now() + interval '30 days'
      from public.oportunidades where codigo = 'HOR-0001';
  `);

  const recibo = await ctx.newPage();
  await recibo.goto(`http://127.0.0.1:3142/registro/${token}`, { waitUntil: "networkidle" });
  await recibo.waitForTimeout(1200);
  const texto = (await recibo.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  await recibo.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/horario-4-recibo.png" });

  es("el recibo dice HORARIO", texto.includes("Horario"), true);
  es("Y ES EL QUE ESCRIBIÓ VENTAS", texto.includes(CERRADO), true);
  es("no el del programa", texto.includes(DEL_PROGRAMA), false);

  /*
   * Y el país.
   *
   * «Territorio: Extranjero» a secas no le sirve a quien inscribe: no
   * distingue a alguien de Guatemala de alguien de España, y de eso dependen
   * el trámite y los papeles que hay que pedirle.
   */
  es("Y DICE DE QUÉ PAÍS ES", texto.includes("País") && texto.includes("Guatemala"), true);
  await recibo.close();
}

console.log("\n── EL AÑO QUE VIENE: dirección cambia el calendario ──");
{
  /*
   * La prueba que justifica todo el diseño. Si esto fallara, cada cambio de
   * calendario reescribiría en silencio los recibos ya emitidos.
   */
  const NUEVO = "Viernes de 6:00 a 9:00 pm, del 01/02 al 30/05";
  sql(`update public.productos set horario = '${NUEVO}' where nombre = '${PROGRAMA}';`);

  es(
    "el lead ya cerrado NO cambió",
    sql(`select horario from public.oportunidades where codigo = 'HOR-0001';`),
    CERRADO,
  );

  const token2 = "prueba" + "J".repeat(30);
  sql(`
    insert into public.enlaces_pago (token, oportunidad_id, vence_en)
    select '${token2}', id, now() + interval '30 days'
      from public.oportunidades where codigo = 'HOR-0001';
  `);
  const recibo = await ctx.newPage();
  await recibo.goto(`http://127.0.0.1:3142/registro/${token2}`, { waitUntil: "networkidle" });
  await recibo.waitForTimeout(1200);
  const texto = (await recibo.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  es("Y EL RECIBO SIGUE DICIENDO LO QUE SE LE PROMETIÓ", texto.includes(CERRADO), true);
  es("no el calendario nuevo", texto.includes(NUEVO), false);
  await recibo.close();
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.productos where nombre = '${PROGRAMA}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
