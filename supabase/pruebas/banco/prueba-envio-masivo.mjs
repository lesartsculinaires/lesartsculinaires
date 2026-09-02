/**
 * Envío masivo: seleccionar en Clientes y mandarles una plantilla.
 *
 *     node supabase/pruebas/banco/prueba-envio-masivo.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Necesito poder seleccionar a los leads o clientes para después agregar un
 * botón de WhatsApp y escribirles grupalmente, enviar mensajes masivos con
 * plantilla aprobada por Meta […] y que no vaya a generar algún conflicto con
 * Meta como bloquear la cuenta.»
 *
 * ============================================================================
 * LO QUE SE PRUEBA, Y POR QUÉ CADA COSA
 * ============================================================================
 *
 *   QUE LA LISTA SE ARME EN EL SERVIDOR   La pantalla manda ids de leads; quién
 *                                         entra de verdad lo decide el
 *                                         servidor. Si eso se decidiera en el
 *                                         navegador, el «no molestar» sería una
 *                                         sugerencia.
 *
 *   QUE SE VEA QUIÉN QUEDA AFUERA         «Se van a mandar 3 de 6» no se puede
 *                                         revisar. El detalle es lo que deja
 *                                         darse cuenta de que faltan por un
 *                                         teléfono mal cargado.
 *
 *   QUE NADIE RECIBA DOS VECES            Una persona con tres leads se
 *                                         selecciona tres veces sin querer. Es
 *                                         lo que más hace que alguien bloquee
 *                                         el número.
 *
 *   QUE UN ENVÍO FALLIDO NO MIENTA        Acá no hay Meta: el token es de
 *                                         mentira. Lo que importa es que el
 *                                         fallo se vea y que los destinatarios
 *                                         queden marcados como fallidos, no
 *                                         como enviados.
 *
 * Necesita el banco armado, la aplicación en 3142 y la migración
 * 20261014120000_envios_masivos.sql.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-envio-${process.pid}-${Math.random()}.sql`);
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

const limpiar = () =>
  sql(`
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA %');
    delete from public.envios where nombre like 'PRUEBA %';
    delete from public.oportunidades where codigo like 'ENV-%';
    delete from public.clientes where nombre like 'Masivo %';
    delete from public.plantillas where id = 'prueba-masiva';
  `);
limpiar();

/*
 * Cinco personas y seis leads:
 *
 *   Uno       normal
 *   Dos       normal, y tiene DOS leads: no puede recibir dos mensajes
 *   Tres      pidió que no le escriban
 *   Cuatro    sin teléfono
 *   Cinco     normal
 *
 * O sea: se seleccionan seis filas y tienen que salir tres mensajes.
 */
sql(`
  insert into public.clientes (nombre, telefono, no_molestar) values
    ('Masivo Uno',    '7055-0001', false),
    ('Masivo Dos',    '7055-0002', false),
    ('Masivo Tres',   '7055-0003', true),
    ('Masivo Cuatro', null,        false),
    ('Masivo Cinco',  '7055-0005', false);

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro)
  select 'ENV-000' || row_number() over (order by c.id), c.id,
         (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre like 'Masivo %';

  -- El segundo lead de «Dos»: la trampa de todos los días.
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro)
  select 'ENV-0009', c.id, (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre = 'Masivo Dos';

  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables)
  values ('prueba-masiva', 'recordatorio_masivo', 'es', 'APPROVED', 'MARKETING',
          'Hola {{nombre}}, te recordamos que el {{2}} arranca el diplomado.', 2)
  on conflict (id) do update set estado = excluded.estado, cuerpo = excluded.cuerpo;
`);

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/envio-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2800);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2000);

console.log("── se buscan y se marcan las seis filas ──");
{
  await p.locator('main input[placeholder*="Buscar nombre"]').first().fill("Masivo");
  await p.waitForTimeout(1500);

  const casillas = p.locator('main tbody input[type="checkbox"]');
  const cuantas = await casillas.count();
  console.log(`   (${cuantas} filas)`);
  es("aparecen los seis leads", cuantas, 6);

  for (let i = 0; i < cuantas; i++) await casillas.nth(i).check();
  await p.waitForTimeout(700);
  await foto("1-marcadas");

  es("y la barra dice seis", (await texto()).includes("6 seleccionadas"), true);
}

console.log("\n── el botón de escribirles ──");
{
  const boton = p.getByRole("button", { name: /Escribirles por WhatsApp/ });
  es("está en la barra", await boton.count(), 1);
  await boton.click();
  await p.waitForTimeout(800);
  await foto("2-nombrar");

  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  es("se abre la ventana", await dlg.count(), 1);
  es("dice cuántos hay marcados", (await dlg.innerText()).includes("6 leads marcados"), true);

  await dlg.locator("input").first().fill("PRUEBA Campaña masiva");
  await p.getByRole("button", { name: "Ver a quiénes les llega" }).click();
  await p.waitForTimeout(2500);
  await foto("3-revisar");
}

console.log("\n── el servidor decide, y lo explica ──");
{
  const t = await texto();
  console.log(`   (${(t.match(/Le llega a \d+ personas?/) ?? ["—"])[0]})`);

  // Seis filas marcadas, tres mensajes: uno repetido, uno sin teléfono, uno
  // que pidió que no le escriban.
  es("LE LLEGA A TRES, NO A SEIS", /Le llega a 3 personas/.test(t), true);
  es("y avisa que quedan afuera tres", /Quedan afuera 3/.test(t), true);
  es("uno porque pidió que no le escriban", /1 pidió que no le escriban/.test(t), true);
  es("uno sin teléfono", /1 sin teléfono/.test(t), true);
  es("y uno que estaba dos veces", /1 estaba dos veces en la selección/.test(t), true);

  /*
   * EL TOPE DEL DÍA, CON EL NÚMERO DE VERDAD.
   *
   * Antes esta pantalla decía «Meta le pone un tope diario» sin decir cuál, y
   * el cálculo que lo sabía estaba escrito pero no lo llamaba nadie. Así que
   * avisaba de un límite que no mostraba y no hacía cumplir: se podía lanzar
   * una campaña de mil y descubrir a la mitad que Meta empezó a rechazar.
   *
   * El número sale de WhatsApp Manager —2.000 conversaciones iniciadas por la
   * empresa en 24 horas, comprobado el 2/9/2026— menos el 10% que se reserva
   * para lo que salga por el chat normal, que cuenta contra el mismo tope.
   */
  es("DICE CUÁNTAS QUEDAN HOY", /Quedan 1.?800 de las 2.?000/.test(t), true);
  es("y explica el margen que se reserva", /se reserva para lo que salga por el chat/.test(t), true);
  // Tres destinatarios contra mil ochocientos: no hay desborde que avisar.
  es("sin aviso de desborde, que no lo hay", /no entra hoy/.test(t), false);

  es(
    "en la base quedaron tres destinatarios",
    sql(`select count(*) from public.envio_destinatarios d
          join public.envios e on e.id = d.envio_id
         where e.nombre = 'PRUEBA Campaña masiva';`),
    "3",
  );
  es(
    "con el teléfono ya listo para Meta",
    sql(`select string_agg(d.telefono, ',' order by d.telefono)
           from public.envio_destinatarios d
           join public.envios e on e.id = d.envio_id
          where e.nombre = 'PRUEBA Campaña masiva';`),
    "50370550001,50370550002,50370550005",
  );
}

console.log("\n── se elige la plantilla y se ve cómo queda ──");
{
  const dlg = p.getByRole("dialog", { name: "Escribirles por WhatsApp" });
  await dlg.locator("select").first().selectOption({ label: "recordatorio_masivo (es)" });
  await p.waitForTimeout(900);
  await foto("4-plantilla");

  const t = await texto();
  // El primer hueco se propone con el nombre de cada quien, que es lo que la
  // escuela no podía hacer con su plantilla.
  es("propone el nombre del cliente", /El nombre del cliente/.test(t), true);
  es("y pide el otro dato", await dlg.locator('input[placeholder*="hueco"]').count(), 1);

  await dlg.locator('input[placeholder*="hueco"]').fill("15 de septiembre");
  await p.waitForTimeout(600);
  await foto("5-vista-previa");

  const t2 = await texto();
  es("LA VISTA PREVIA LO MUESTRA ARMADO", /Hola María, te recordamos que el 15 de septiembre/.test(t2), true);
  es("y aclara que el nombre cambia", /a cada quien le va a llegar con su propio nombre/.test(t2), true);
}

console.log("\n── se manda; acá no hay Meta y tiene que decirlo ──");
{
  await p.getByRole("button", { name: /^Mandar a 3$/ }).click();
  await p.waitForTimeout(6000);
  await foto("6-mandando");

  const t = await texto();
  console.log(`   (${(t.match(/El token de WhatsApp[^]{0,40}/) ?? ["sin aviso"])[0]})`);
  es("SE VE POR QUÉ NO SALIÓ", /token de WhatsApp venció o es inválido/.test(t), true);

  // Lo que importa: nadie quedó marcado como enviado.
  es(
    "ninguno figura como enviado",
    sql(`select count(*) from public.envio_destinatarios d
          join public.envios e on e.id = d.envio_id
         where e.nombre = 'PRUEBA Campaña masiva' and d.estado = 'enviado';`),
    "0",
  );
  es(
    "el primero quedó como fallido, con su motivo",
    sql(`select count(*) from public.envio_destinatarios d
          join public.envios e on e.id = d.envio_id
         where e.nombre = 'PRUEBA Campaña masiva'
           and d.estado = 'fallido' and d.motivo is not null;`),
    "1",
  );
  es(
    "y los otros dos siguen pendientes, para reanudar",
    sql(`select count(*) from public.envio_destinatarios d
          join public.envios e on e.id = d.envio_id
         where e.nombre = 'PRUEBA Campaña masiva' and d.estado = 'pendiente';`),
    "2",
  );
}

console.log("\n── y aparece en el módulo de Envíos ──");
{
  await p.getByRole("button", { name: "Cerrar", exact: true }).click();
  await p.waitForTimeout(1500);
  await p.locator('aside button[data-mod^="Env"]').click();
  await p.waitForTimeout(2500);
  await foto("7-envios");

  const t = await texto();
  es("está la campaña", t.includes("PRUEBA Campaña masiva"), true);
  es("con su plantilla", t.includes("recordatorio_masivo"), true);
  es("y sus tres destinatarios", /3 destinatarios/.test(t), true);

  console.log("\n   ── se abre y muestra el embudo ──");
  await p.getByRole("button", { name: /PRUEBA Campaña masiva/ }).click();
  await p.waitForTimeout(900);
  await foto("8-detalle");

  const t2 = await texto();
  // Sin distinguir mayúsculas: el rótulo va en versalitas por hoja de estilos,
  // así que `innerText` lo devuelve en mayúsculas.
  es("dice qué se mandó", /lo que se mandó/i.test(t2), true);
  es("con el ejemplo del nombre", /Hola María/.test(t2), true);
  es("y el embudo", /Llegaron al teléfono/.test(t2) && /Contestaron/.test(t2), true);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", sql("select count(*) from public.envios where nombre like 'PRUEBA %';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
