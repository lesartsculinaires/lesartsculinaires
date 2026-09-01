/**
 * Marcar varios programas en un lead, y que eso NO abra leads duplicados.
 *
 *     node supabase/pruebas/banco/prueba-programas-de-interes.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En la ficha de clientes quiero que en la parte de los programas se puedan
 * seleccionar varios, ya que un lead puede preguntar por varios programas a la
 * vez; ¿podrías ayudarme a aplicarlo a futuros leads y que no afecte al momento
 * de hacer un lead duplicado y esas cosas?»
 *
 * La segunda mitad de esa frase es la que manda, y es la que se prueba acá.
 *
 * ============================================================================
 * LAS TRES COSAS
 * ============================================================================
 *
 *   QUE SE PUEDAN MARCAR      En la ficha, con casillas, y que quede guardado.
 *
 *   QUE EL DE LA VENTA        `producto_id` es el que lleva la plata. No se
 *   NO SE PUEDA SACAR         puede desmarcar desde acá: un lead vendiendo un
 *                             programa por el que dice que nunca preguntaron
 *                             sería un dato que se contradice solo.
 *
 *   QUE NO ABRA DUPLICADOS    Lo importante. Una carga posterior por el
 *                             SEGUNDO programa tiene que caer sobre este mismo
 *                             lead. Antes abría uno nuevo, y eso es lo que la
 *                             escuela venía viendo repetido.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-prog-${process.pid}-${Math.random()}.sql`);
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

const QUIEN = "Interes Prueba Varios";
const CORREO = "interes.prueba@lac.test";
const limpiar = () => sql(`delete from public.clientes where nombre = '${QUIEN}';`);
limpiar();

const PROG_A = sql("select nombre from public.productos order by id limit 1;");
const PROG_B = sql("select nombre from public.productos order by id offset 1 limit 1;");
const ID_B = sql("select id from public.productos order by id offset 1 limit 1;");

// Un lead con el primer programa cargado. El disparador de la base tiene que
// haberlo anotado solo como su primer interés.
sql(`
  insert into public.clientes (nombre, correo) values ('${QUIEN}', '${CORREO}');
  insert into public.oportunidades (codigo, cliente_id, producto_id, fecha_registro)
  select 'CRM-6601', c.id, (select id from public.productos order by id limit 1), '2026-08-01'
    from public.clientes c where c.nombre = '${QUIEN}';
`);

const intereses = () =>
  sql(`select coalesce(string_agg(p.nombre, ' · ' order by p.nombre), '(ninguno)')
         from public.oportunidad_programas op
         join public.productos p on p.id = op.producto_id
         join public.oportunidades o on o.id = op.oportunidad_id
        where o.codigo = 'CRM-6601';`);

const cuantosLeads = () =>
  Number(sql(`select count(*) from public.oportunidades o
                join public.clientes c on c.id = o.cliente_id
               where c.nombre = '${QUIEN}';`));

console.log("── el disparador anota solo el programa de la venta ──");
{
  es("arranca con un lead", cuantosLeads(), 1);
  es("Y SU PROGRAMA YA ESTÁ ANOTADO", intereses(), PROG_A);
}

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/interes-${n}.png` });

const abrirFicha = async () => {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  await p.getByPlaceholder(/Buscar/).fill("Interes Prueba");
  await p.waitForTimeout(1500);
  await p.locator('main tbody tr:has-text("CRM-6601")').click();
  await p.waitForTimeout(2200);
};

await abrirFicha();

console.log("\n── el control está en la ficha ──");
{
  await foto("1-ficha");
  const abrir = p.getByRole("button", { name: /Programas por los que preguntó/ });
  es("hay un control de programas", await abrir.count(), 1);
  es("y ya muestra el de la venta", (await abrir.innerText()).includes(PROG_A), true);

  await abrir.click();
  await p.waitForTimeout(700);
  await foto("2-abierto");

  const texto = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  es("explica que no abre leads nuevos", /no.{0,3} abre leads nuevos/i.test(texto), true);
}

console.log("\n── EL DE LA VENTA NO SE PUEDE SACAR ──");
{
  /*
   * Si se pudiera, quedaría un lead vendiendo un programa por el que dice que
   * nunca preguntaron: un dato que se contradice solo.
   */
  const suyo = p.locator(`label:has-text("${PROG_A}") input[type=checkbox]`).first();
  es("está marcado", await suyo.isChecked(), true);
  es("Y NO SE DEJA DESMARCAR", await suyo.isDisabled(), true);
}

console.log("\n── se marca un segundo programa ──");
{
  const otro = p.locator(`label:has-text("${PROG_B}") input[type=checkbox]`).first();
  await otro.check();
  await p.waitForTimeout(2500);
  await foto("3-marcado");

  es("QUEDARON LOS DOS EN LA BASE", intereses().split(" · ").length, 2);
  es("y el segundo es el que se marcó", intereses().includes(PROG_B), true);
  es("sin abrir ningún lead nuevo", cuantosLeads(), 1);
}

console.log("\n── se desmarca y vuelve a quedar uno ──");
{
  const otro = p.locator(`label:has-text("${PROG_B}") input[type=checkbox]`).first();
  await otro.uncheck();
  await p.waitForTimeout(2500);
  es("vuelve a quedar sólo el de la venta", intereses(), PROG_A);

  // Y se vuelve a marcar, que es como queda para lo de abajo.
  await otro.check();
  await p.waitForTimeout(2500);
  es("y se puede volver a marcar", intereses().split(" · ").length, 2);
}

await ctx.close();
await nav.close();

console.log("\n── LO QUE IMPORTA: UNA CARGA POR EL SEGUNDO PROGRAMA NO DUPLICA ──");
{
  /*
   * El lead quedó con dos programas anotados. Ahora entra la misma persona por
   * el SEGUNDO, que es lo que pasa cuando se sube una base nueva.
   *
   * Antes de esto, el CRM comparaba sólo contra el programa principal, veía
   * «otro programa» y le abría un lead aparte. Con los intereses anotados
   * reconoce que ya preguntó por ése y completa el que hay.
   *
   * Se comprueba con la regla misma, que es la que deciden el alta, la
   * unificación y la importación.
   */
  const guion = `
    import { cualAbsorbe } from "/tmp/lr.mjs";
    const lead = {
      id: 1, codigo: "CRM-6601", vendedor_id: null,
      producto_id: ${sql("select id from public.productos order by id limit 1;")},
      territorio_id: null, canal_id: null, etapa_id: null, estado_id: null,
      fecha_registro: "2026-08-01", fecha_cierre: null,
      valor_oportunidad: null, venta_cerrada: null, descuento_promocion: null,
      programas: [${sql(`select string_agg(op.producto_id::text, ',') from public.oportunidad_programas op
                          join public.oportunidades o on o.id = op.oportunidad_id
                         where o.codigo = 'CRM-6601';`)}],
    };
    const entra = (prod) => ({
      vendedor_id: null, producto_id: prod, territorio_id: null, canal_id: null,
      etapa_id: null, estado_id: null, fecha_registro: "2026-09-01",
      fecha_cierre: null, valor_oportunidad: null, descuento_promocion: null,
    });
    const r = cualAbsorbe([lead], entra(${ID_B}), new Set());
    console.log(r.lead ? r.lead.codigo : "ABRE OTRO");
  `;
  const ruta = path.join(os.tmpdir(), `guion-${process.pid}.mjs`);
  fs.writeFileSync(ruta, guion, "utf8");
  const salida = execSync(`node ${ruta}`, { encoding: "utf8" }).trim();
  fs.rmSync(ruta, { force: true });

  es("CAE SOBRE EL LEAD QUE YA ESTABA", salida, "CRM-6601");
}

es("sin errores en la página", errores, []);

limpiar();
es("no quedó basura", cuantosLeads(), 0);
// La tabla hija se va en cascada con el lead.
es(
  "ni intereses colgados",
  sql(`select count(*) from public.oportunidad_programas op
         where not exists (select 1 from public.oportunidades o where o.id = op.oportunidad_id);`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
