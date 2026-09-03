/**
 * Mover un lead y que se vea en todas las pantallas, solo y al momento.
 *
 *     node supabase/pruebas/banco/prueba-todo-conectado.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «El Pipeline tiene que estar conectado con Clientes, que conecta para el
 *  Dashboard. Tiene que conectar datos con estatus, con estado y programas y
 *  fechas de cierre; esas cosas son las que tienen que verse en el Dashboard
 *  cuando interactuamos con cada lead. La idea es que se tiene que actualizar
 *  no más se mueva algo en Clientes, en tiempo real: cada cosa que se mueva en
 *  leads tiene que verse reflejado en esas áreas conectadas.»
 *
 * ============================================================================
 * QUÉ SE COMPRUEBA
 * ============================================================================
 *
 * Se cierra una venta DESDE LA FICHA de Clientes —como lo hace una asesora que
 * está hablando con el cliente— y sin recargar nada se mira:
 *
 *   El Dashboard      que suba «Venta cerrada» y la tasa de cierre, y que el
 *                     lead cambie de barra en el gráfico de Estados y en el de
 *                     Etapas.
 *
 *   El Pipeline       que la tarjeta haya cambiado de columna sola.
 *
 * Y la parte que estaba rota hasta ahora: que la ETAPA y el ESTADO terminen de
 * acuerdo. Marcar «Ganado» en la ficha no movía la tarjeta, así que el mismo
 * lead figuraba como venta ganada en los indicadores y como perdido en el
 * embudo, sin que nadie hiciera nada mal.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-con-${process.pid}-${Math.random()}.sql`);
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

const QUIEN = "Conectado Prueba";
const CODIGO = "CON-001";
const MONTO = 777;

const limpiar = () => sql(`delete from public.clientes where nombre = '${QUIEN}';`);
limpiar();

/*
 * Un lead vivo, del mes en curso, en Negociación.
 *
 * Del mes en curso porque el Dashboard abre ahí: un lead de marzo no se vería
 * y la prueba pasaría sin comprobar nada.
 */
sql(`
  insert into public.clientes (nombre, telefono) values ('${QUIEN}', '50366554433');
  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, estado_id,
     fecha_registro, valor_oportunidad)
  select '${CODIGO}', c.id,
         (select id from public.vendedores order by id limit 1),
         (select id from public.productos order by id limit 1),
         (select id from public.etapas  where nombre = 'Negociación'),
         (select id from public.estados where nombre = 'Activo'),
         current_date, 900
    from public.clientes c where c.nombre = '${QUIEN}';
`);

const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
  .trim();
const YO = "cccccccc-0000-0000-0000-000000000003";
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: YO, email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try { localStorage.setItem("lac.reservas.visto", h); } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/conectado-${n}.png`, fullPage: true });

const indicador = async (cual) =>
  (await p.locator(`main [data-kpi="${cual}"] [data-valor]`).innerText()).trim();

await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.getByText("En vivo", { exact: false }).first().waitFor({ timeout: 30_000 });
await p.waitForTimeout(2500);

console.log("── de dónde se parte ──");
const antes = {
  cerrada: await indicador("Venta cerrada"),
  pipeline: await indicador("En pipeline"),
};
await foto("1-antes");
es("el lead está en Negociación y Activo",
  sql(`select e.nombre || '/' || s.nombre from public.oportunidades o
         join public.etapas e on e.id=o.etapa_id
         join public.estados s on s.id=o.estado_id where o.codigo='${CODIGO}';`),
  "Negociación/Activo");

console.log("\n── SE CIERRA LA VENTA DESDE LA FICHA DE CLIENTES ──");
{
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder(/Buscar/).first().fill(QUIEN);
  await p.waitForTimeout(1500);
  await p.locator(`main tbody tr:has-text("${CODIGO}")`).click();
  await p.waitForTimeout(2200);
  await foto("2-ficha");

  /*
   * El estado, que es como cierra una venta quien está hablando con el
   * cliente: se marca «Ganado» en la ficha, sin pasar por el tablero.
   *
   * Los desplegables de la ficha no son `select` del navegador sino menús
   * propios, así que se abren con un clic y se elige del listado.
   */
  await p.locator('[role=dialog], aside').last()
    .locator('button:has-text("Estado")').first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Ganado", exact: true }).last().click();
  await p.waitForTimeout(700);

  // Y el monto cobrado, en la fila de «Venta cerrada» del registro.
  const fila = p.locator('tr:has-text("Venta cerrada"), div:has-text("Venta cerrada")').last();
  await fila.locator('input[inputmode="decimal"], input[type="number"], input').last()
    .fill(String(MONTO));
  await p.waitForTimeout(400);

  // Guardar: son dos pasos, confirmación incluida.
  await p.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await p.waitForTimeout(900);
  const aceptar = p.getByRole("button", { name: /Aceptar y guardar/i });
  if (await aceptar.count()) await aceptar.click();
  await p.waitForTimeout(2500);
  await foto("3-guardado");

  // La ficha se abre encima de la pantalla, así que hay que cerrarla antes de
  // ir a otro módulo: si no, tapa la barra lateral.
  await p.locator('[role=dialog], aside').last()
    .getByRole("button", { name: /^(×|✕|Cerrar)/ }).first().click()
    .catch(() => p.keyboard.press("Escape"));
  await p.waitForTimeout(1200);
}

console.log("\n── LA BASE DEJÓ LOS DOS CAMPOS DE ACUERDO ──");
{
  /*
   * Esto es lo que estaba roto. Marcar «Ganado» en la ficha ponía el estado y
   * dejaba la tarjeta donde estaba, así que el mismo lead figuraba como venta
   * ganada en los indicadores y en otra columna en el embudo.
   */
  es("EL ESTADO Y LA ETAPA COINCIDEN",
    sql(`select e.nombre || '/' || s.nombre from public.oportunidades o
           join public.etapas e on e.id=o.etapa_id
           join public.estados s on s.id=o.estado_id where o.codigo='${CODIGO}';`),
    "Ganado/Ganado");
  es("y el monto quedó guardado",
    sql(`select venta_cerrada::numeric(12,0) from public.oportunidades where codigo='${CODIGO}';`),
    String(MONTO));
}

console.log("\n── EL DASHBOARD CAMBIÓ SOLO, SIN RECARGAR ──");
{
  /*
   * Sin `reload` en ninguna parte: se vuelve al Dashboard y ya tiene que estar
   * al día. Lo que lo actualiza es el websocket, que escucha `oportunidades`.
   */
  await p.locator('aside button[data-mod="Dashboard"]').click();
  await p.waitForTimeout(2500);
  await foto("4-dashboard");

  const ahora = {
    cerrada: await indicador("Venta cerrada"),
    pipeline: await indicador("En pipeline"),
  };

  es("LA VENTA CERRADA SUBIÓ", ahora.cerrada !== antes.cerrada, true);
  es("y el pipeline bajó en uno", Number(ahora.pipeline), Number(antes.pipeline) - 1);

  // El monto exacto, contra la base.
  const enLaBase = Number(sql(`
    select coalesce(sum(venta_cerrada),0)::numeric(12,0) from public.oportunidades
     where to_char(fecha_registro,'YYYY-MM') = to_char(now(),'YYYY-MM');`));
  es("y coincide con la base", ahora.cerrada, "$" + enLaBase.toLocaleString("en-US"));
}

console.log("\n── Y SE VE EN LOS GRÁFICOS DEL DASHBOARD ──");
{
  /*
   * «Tiene que conectar datos con estatus, con estado y programas»: no alcanza
   * con que suba el número de arriba, el lead tiene que aparecer en la barra
   * que le toca.
   */
  const estados = await p.locator('main section:has(h3:text-is("Estados"))').innerText();
  es("aparece en Estados como Ganado", /Ganado/.test(estados), true);

  const etapas = await p.locator('main section:has(h3:text-is("Etapas"))').innerText();
  es("y en Etapas también", /Ganado/.test(etapas), true);

  const programa = sql(`select p.nombre from public.oportunidades o
                          join public.productos p on p.id=o.producto_id
                         where o.codigo='${CODIGO}';`);
  const programas = await p.locator('main section:has(h3:text-is("Programas"))').innerText();
  es("y su programa está en Programas", programas.includes(programa), true);
}

console.log("\n── Y LA TARJETA SE MOVIÓ SOLA EN EL PIPELINE ──");
{
  await p.locator('aside button[data-mod="Pipeline"]').click();
  await p.waitForTimeout(2500);
  await foto("5-pipeline");

  const enGanado = p.locator('main [data-etapa="Ganado"]');
  es("LA TARJETA ESTÁ EN GANADO", (await enGanado.innerText()).includes(QUIEN), true);

  const enNegociacion = p.locator('main [data-etapa="Negociación"]');
  es("y ya no está en Negociación", (await enNegociacion.innerText()).includes(QUIEN), false);
}

console.log("\n── UN CAMBIO DESDE FUERA TAMBIÉN LLEGA SOLO ──");
{
  /*
   * El caso de todos los días: otra asesora mueve un lead desde su
   * computadora. Acá se imita escribiendo en la base directamente, sin tocar
   * el navegador, y la pantalla tiene que enterarse igual.
   */
  const antesDeAfuera = await p.locator('main [data-etapa="Ganado"]').innerText();
  es("todavía está en Ganado", antesDeAfuera.includes(QUIEN), true);

  sql(`update public.oportunidades
          set estado_id = (select id from public.estados where nombre='Perdido')
        where codigo = '${CODIGO}';`);

  // Sin recargar. El aviso se junta durante 600 ms antes de refrescar.
  await p.waitForTimeout(4000);
  await foto("6-desde-afuera");

  es("SE MOVIÓ SOLA A PERDIDO",
    (await p.locator('main [data-etapa="Perdido"]').innerText()).includes(QUIEN), true);
  es("y salió de Ganado",
    (await p.locator('main [data-etapa="Ganado"]').innerText()).includes(QUIEN), false);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();

limpiar();
es("no quedó basura",
  sql(`select count(*) from public.oportunidades where codigo='${CODIGO}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
