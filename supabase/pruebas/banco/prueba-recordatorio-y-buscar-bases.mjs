/**
 * El recordatorio a mano en la ficha, y el buscador del módulo de Bases.
 *
 *     node supabase/pruebas/banco/prueba-recordatorio-y-buscar-bases.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En la ficha de clientes, un apartado que diga Recordatorio, con un cuadro
 *  de fecha y otro de texto del por qué esa fecha; esa fecha tiene que estar
 *  vinculada al módulo de recordatorios para notificarle.»
 *
 * Y: «en el módulo de bases, una barra de búsqueda para buscar más rápido.»
 *
 * ============================================================================
 * LO QUE DE VERDAD HAY QUE COMPROBAR
 * ============================================================================
 *
 * De lo primero, la palabra clave es VINCULADO. Que el cuadro guarde algo es
 * fácil; lo que importa es que eso aparezca DESPUÉS en el módulo de
 * Recordatorios, porque si no queda una nota escondida en una ficha que nadie
 * vuelve a abrir. Por eso la prueba guarda en un lado y va a mirar al otro.
 *
 * Del buscador, que filtre de verdad la tabla y que el vacío diga cuál de los
 * dos vacíos es: «no hay bases» cuando en realidad hay veinte y ninguna
 * coincide manda a buscar el problema donde no está.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `rec-${process.pid}-${Math.random()}.sql`);
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
  !/manual/.test(
    sql(`select pg_get_constraintdef(oid) from pg_constraint
          where conname = 'seguimientos_tipo_check';`),
  )
) {
  console.error("Falta la migración 20261104120000_recordatorio_a_mano.sql.");
  process.exit(1);
}

// ---------------------------------------------------------------- preparar

const subDe = (a) =>
  JSON.parse(
    Buffer.from(fs.readFileSync(`${BANCO}/${a}`, "utf8").trim().split(".")[1], "base64url").toString(),
  ).sub;
const JEFA = subDe("jwt-jefa.txt");

const marca = Date.now();
const CLIENTE = `Recordar A ${marca}`;
const MOTIVO = `Cobra el 10 y pidio que le marque despues ${marca}`;
const ARCHIVO_A = `PRUEBA feria julio ${marca}.xlsx`;
const ARCHIVO_B = `PRUEBA inscripciones agosto ${marca}.xlsx`;
const EN_LA_BASE_B = `Solo En Agosto ${marca}`;
const EN_LA_BASE_A = `Solo En Julio ${marca}`;

const limpiar = () => {
  sql(`
    delete from public.seguimientos where oportunidad_id in
      (select id from public.oportunidades where codigo like 'REC-%');
    delete from public.oportunidades where codigo like 'REC-%';
    delete from public.clientes where nombre like 'Recordar A 17%'
                                  or nombre like 'Solo En %';
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

/** El día de pasado mañana, que es una fecha futura y estable. */
const enDias = (n) => {
  const d = new Date(Date.now() + n * 86_400_000 - 6 * 3_600_000);
  return d.toISOString().slice(0, 10);
};
const FECHA = enDias(2);

sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '70660001');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'REC-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date, 495
    from public.clientes c where c.nombre = '${CLIENTE}';

  -- Dos bases, para el buscador. La segunda trae un cliente con nombre propio,
  -- para comprobar que también se busca por ahí.
  insert into public.importaciones (archivo, filas, creado_en)
  values ('${ARCHIVO_A}', 1, now()), ('${ARCHIVO_B}', 1, now());

  insert into public.clientes (nombre, telefono) values ('${EN_LA_BASE_B}', '70660002');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro,
     valor_oportunidad, importacion_id)
  select 'REC-0002', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date, 495,
         (select id from public.importaciones where archivo = '${ARCHIVO_B}')
    from public.clientes c where c.nombre = '${EN_LA_BASE_B}';

  -- Con cliente PROPIO y no con el de arriba: dos leads del mismo nombre
  -- hacen que el clic en la lista abra uno y la comprobación mire el otro.
  -- Pasó, y la prueba decía que no se había guardado cuando sí.
  insert into public.clientes (nombre, telefono) values ('${EN_LA_BASE_A}', '70660003');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro,
     valor_oportunidad, importacion_id)
  select 'REC-0003', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date, 495,
         (select id from public.importaciones where archivo = '${ARCHIVO_A}')
    from public.clientes c where c.nombre = '${EN_LA_BASE_A}';
`);

// --------------------------------------------------------------- navegador

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
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
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));
const p = await ctx.newPage();
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/rec-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL APARTADO EN LA FICHA ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2000);
await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(2000);
await foto("1-ficha");

{
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("dice «Recordatorio»", texto.includes("Recordatorio"), true);
  es("hay un cuadro de fecha", await p.locator('input[aria-label="Fecha del recordatorio"]').count(), 1);
  es("y uno de por qué", await p.locator('textarea[aria-label="Por qué esa fecha"]').count(), 1);
  es(
    "avisa a dónde va a aparecer",
    /va a aparecer en Recordatorios/i.test(texto),
    true,
  );
}

console.log("\n   · sin motivo no se guarda");
{
  await p.locator('input[aria-label="Fecha del recordatorio"]').fill(FECHA);
  await p.waitForTimeout(400);
  const boton = p.getByRole("button", { name: /Agendar recordatorio/ });
  es("EL BOTÓN SIGUE APAGADO con la fecha sola", await boton.isDisabled(), true);
}

console.log("\n   · con los dos, se guarda");
{
  await p.locator('textarea[aria-label="Por qué esa fecha"]').fill(MOTIVO);
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Agendar recordatorio/ }).click();
  await p.waitForTimeout(2800);
  await foto("2-guardado");

  es(
    "QUEDÓ EN LA BASE, con su fecha",
    sql(`select s.proxima::text from public.seguimientos s
           join public.oportunidades o on o.id = s.oportunidad_id
          where o.codigo = 'REC-0001';`),
    FECHA,
  );
  es(
    "y con el porqué que se escribió",
    sql(`select s.detalle from public.seguimientos s
           join public.oportunidades o on o.id = s.oportunidad_id
          where o.codigo = 'REC-0001';`),
    MOTIVO,
  );
  es(
    "anotado como puesto a mano, no deducido de una nota",
    sql(`select s.tipo from public.seguimientos s
           join public.oportunidades o on o.id = s.oportunidad_id
          where o.codigo = 'REC-0001';`),
    "manual",
  );

  // Y se ve en la propia ficha, para no dejar tres para el mismo cliente.
  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("se ve en la ficha lo que quedó agendado", texto.includes(MOTIVO), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LO QUE IMPORTA: APARECE EN EL MÓDULO DE RECORDATORIOS ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Es la palabra del pedido: «vinculado al módulo de recordatorios». Un
   * cuadro que guarda algo que después no aparece en ningún lado es una nota
   * escondida en una ficha que nadie vuelve a abrir.
   */
  /*
   * Se cambia de módulo por la dirección y no con el clic de la barra.
   *
   * Con la ficha abierta, la capa del cajón cubre la barra lateral y el clic
   * se queda esperando para siempre. Cerrarla primero tampoco alcanza: si hay
   * algo sin guardar pide confirmación, y eso convierte una comprobación de
   * recordatorios en una de cuadros de diálogo.
   */
  /*
   * Se recarga y se entra por la barra.
   *
   * Con la ficha abierta, la capa del cajón cubre la barra lateral y el clic
   * se queda esperando para siempre. Y `?mod=` no sirve: la dirección no
   * elige módulo, siempre cae en Dashboard —lo comprobé—. Recargar suelta el
   * cajón y deja la barra alcanzable.
   */
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Recordatorios"]').click();
  await p.waitForTimeout(2500);
  await foto("3-modulo");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("ESTÁ EN EL MÓDULO DE RECORDATORIOS", texto.includes(MOTIVO), true);
  es("con el nombre del cliente", texto.includes(CLIENTE), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EL BUSCADOR DE BASES ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.locator('aside button[data-mod="Bases"]').click();
  await p.waitForTimeout(2500);
  await foto("4-bases");

  const buscador = p.locator("input[data-buscar-bases]");
  es("hay una barra de búsqueda", await buscador.count(), 1);

  const filas = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const antes = await filas();
  es("se ven las dos bases de la prueba", antes.includes(ARCHIVO_A) && antes.includes(ARCHIVO_B), true);

  console.log("\n   · filtra por el nombre del archivo");
  await buscador.fill("agosto");
  await p.waitForTimeout(900);
  const conAgosto = await filas();
  es("queda la de agosto", conAgosto.includes(ARCHIVO_B), true);
  es("Y SE VA LA DE JULIO", conAgosto.includes(ARCHIVO_A), false);
  await foto("5-filtrado");

  console.log("\n   · y por un cliente que la base trajo");
  await buscador.fill(EN_LA_BASE_B);
  await p.waitForTimeout(900);
  const porCliente = await filas();
  es("ENCUENTRA LA BASE POR SU CLIENTE", porCliente.includes(ARCHIVO_B), true);
  es("y no la otra", porCliente.includes(ARCHIVO_A), false);

  console.log("\n   · el vacío dice cuál de los dos vacíos es");
  await buscador.fill("esto no existe en ninguna parte");
  await p.waitForTimeout(900);
  const vacio = await filas();
  es("NO DICE «todavía no hay bases», que sería mentira", /Todavía no hay bases cargadas/.test(vacio), false);
  es("dice que ninguna coincide", /Ninguna base coincide/.test(vacio), true);
  await foto("6-vacio");

  console.log("\n   · y se puede borrar la búsqueda");
  await p.getByRole("button", { name: "Borrar la búsqueda" }).click();
  await p.waitForTimeout(900);
  const despues = await filas();
  es("vuelven las dos", despues.includes(ARCHIVO_A) && despues.includes(ARCHIVO_B), true);
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.oportunidades where codigo like 'REC-%';`),
  "0",
);

console.log(
  f === 0
    ? "\nTodo bien: el recordatorio llega al módulo, y las bases se buscan."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f ? 1 : 0);
