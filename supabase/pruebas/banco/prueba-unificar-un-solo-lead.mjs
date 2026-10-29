/**
 * Unificar deja UN lead, no dos.
 *
 *     node supabase/pruebas/banco/prueba-unificar-un-solo-lead.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Todavía se siguen duplicando leads a pesar de que di la opción de unificar.
 * Quiero saber cuál es el problema y resolvelo: la idea es que se unifique la
 * información, que la que se repita se unifique y la adicional se agregue, que
 * sea uno solo.»
 *
 * La foto que lo mostraba: CRM-2625 y CRM-2626, los dos de Yolanda, el mismo
 * día, los dos «Sin asignar» y sin programa, con el cartel «Oportunidad
 * agregada al contacto existente» encima.
 *
 * ============================================================================
 * QUÉ ESTABA PASANDO
 * ============================================================================
 *
 * El botón hacía dos cosas y sólo una estaba bien: unificaba la FICHA de la
 * persona —quedaba una— y después abría una oportunidad NUEVA. La pantalla de
 * Clientes lista oportunidades, así que la persona seguía apareciendo dos
 * veces. Unificar no arreglaba el duplicado: lo movía un nivel más abajo.
 *
 * ============================================================================
 * LO QUE SE PRUEBA ACÁ Y NO EN `leadRepetido.test.mjs`
 * ============================================================================
 *
 * Aquélla prueba la regla. Ésta prueba que la regla llegue hasta la base a
 * través del botón que aprieta una persona: la acción de servidor, el permiso
 * de la sesión y la fila que queda escrita. Es donde se rompería si algo del
 * medio no pasara los datos.
 *
 *   NO SE CREA UN SEGUNDO LEAD      La comprobación que importa. Se cuenta
 *                                   antes y después.
 *
 *   LO QUE FALTABA SE COMPLETA      Si el lead viejo no tenía asesor y el alta
 *                                   trae uno, queda con asesor. «La información
 *                                   adicional se agrega».
 *
 *   LO QUE CHOCA NO SE PISA         Y no se pierde: queda en la bitácora.
 *
 *   OTRO PROGRAMA SÍ ABRE OTRO      La regla opuesta, que es la que evita que
 *                                   arreglar el duplicado se coma una venta.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-un-lead-${process.pid}-${Math.random()}.sql`);
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

const CORREO = "yolanda.prueba@lac.test";
const TEL = "7455-9001";

const limpiar = () =>
  sql(`
    delete from public.clientes where correo = '${CORREO}' or telefono = '${TEL}';
  `);
limpiar();

/** Cuántos leads tiene Yolanda ahora mismo. */
const cuantosLeads = () =>
  Number(
    sql(`select count(*) from public.oportunidades o
          join public.clientes c on c.id = o.cliente_id
         where c.correo = '${CORREO}';`),
  );

const elLead = (campo) =>
  sql(`select coalesce(o.${campo}::text, 'null') from public.oportunidades o
        join public.clientes c on c.id = o.cliente_id
       where c.correo = '${CORREO}' order by o.id limit 1;`);

/*
 * Yolanda, ya cargada: una ficha y UN lead, sin asesor y sin programa. Es
 * exactamente la fila de la foto antes de que apretaran «Unificar».
 */
sql(`
  insert into public.clientes (nombre, correo, telefono)
  values ('Yolanda Romero', '${CORREO}', '${TEL}');

  insert into public.oportunidades (codigo, cliente_id, fecha_registro)
  select 'CRM-9625', c.id, current_date
    from public.clientes c where c.correo = '${CORREO}';
`);

es("arranca con un lead", cuantosLeads(), 1);
es("sin asesor", elLead("vendedor_id"), "null");

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/unlead-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

/**
 * Abrir «Nuevo cliente» y llenarlo con los datos de Yolanda otra vez.
 *
 * Es lo que hace una asesora que no sabe que ya está cargada: la carga de
 * nuevo, el CRM la reconoce, y ella aprieta «Unificar».
 */
const cargarDeNuevo = async ({ vendedor, programa } = {}) => {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);

  await p.getByRole("button", { name: "+ Nuevo cliente" }).first().click();
  await p.waitForTimeout(900);

  await p.locator("#campo-nombre").fill("Yolanda Romero");
  await p.locator("#campo-correo").fill(CORREO);
  await p.waitForTimeout(1200);

  if (vendedor) {
    await p.locator('label:has-text("Vendedor") select').selectOption({ label: vendedor });
  }
  if (programa) {
    await p.locator('label:has-text("Programa") select').selectOption({ label: programa });
  }
  await p.waitForTimeout(500);
};

console.log("\n── el CRM la reconoce mientras se escribe ──");
{
  await cargarDeNuevo();
  await foto("1-reconocida");

  const t = await texto();
  es("avisa que ya existe", /Este contacto ya existe en la base de datos/.test(t), true);
  es("y ofrece unificar", await p.getByRole("button", { name: /Unificar con este contacto/ }).count(), 1);
}

console.log("\n── SE APRIETA UNIFICAR ──");
{
  await p.getByRole("button", { name: /Unificar con este contacto/ }).first().click();
  await p.waitForTimeout(3000);
  await foto("2-unificado");

  /*
   * LA COMPROBACIÓN QUE IMPORTA. Antes de esto acá había dos: CRM-9625 y uno
   * nuevo. La foto de la escuela era exactamente esto.
   */
  es("SIGUE HABIENDO UN SOLO LEAD", cuantosLeads(), 1);

  const t = await texto();
  es("y la pantalla lo dice", /Quedó un solo lead/.test(t), true);
  es("nombrando cuál", /CRM-9625/.test(t), true);
  // Que no diga «se creó»: era la frase de antes, y era la que hacía pensar
  // que estaba bien.
  es("SIN HABLAR DE UNO NUEVO", /Se abrió un lead aparte/.test(t), false);
}

console.log("\n── lo que faltaba se completa ──");
{
  // Se vuelve a cargar, ahora con asesor. El lead no tenía: tiene que quedar
  // con él, y seguir siendo uno.
  await p.getByRole("button", { name: "Entendido, cerrar" }).click();
  await p.waitForTimeout(1500);

  const asesor = sql("select nombre from public.vendedores where activo order by id limit 1;");
  await cargarDeNuevo({ vendedor: asesor });
  await p.getByRole("button", { name: /Unificar con este contacto/ }).first().click();
  await p.waitForTimeout(3000);
  await foto("3-completado");

  es("sigue siendo uno solo", cuantosLeads(), 1);
  es("Y AHORA TIENE ASESOR", elLead("vendedor_id") !== "null", true);

  const t = await texto();
  es("la pantalla cuenta qué completó", /Se completó .*Asesor/.test(t), true);
}

console.log("\n── lo que choca no se pisa, pero tampoco se pierde ──");
{
  await p.getByRole("button", { name: "Entendido, cerrar" }).click();
  await p.waitForTimeout(1500);

  const puestoAntes = elLead("vendedor_id");
  const otro = sql(
    `select nombre from public.vendedores where activo and id::text <> '${puestoAntes}' order by id limit 1;`,
  );

  await cargarDeNuevo({ vendedor: otro });
  await p.getByRole("button", { name: /Unificar con este contacto/ }).first().click();
  await p.waitForTimeout(3000);
  await foto("4-choque");

  es("y sigue siendo uno solo", cuantosLeads(), 1);
  es("EL ASESOR QUE TENÍA NO SE PISA", elLead("vendedor_id"), puestoAntes);

  const t = await texto();
  es("se avisa que se conservó", /se conservaron como estaban/.test(t), true);
  es("diciendo cuál", /Asesor/.test(t), true);

  /*
   * Y no se pierde: queda escrito en la bitácora del lead. Es la otra mitad de
   * «que la información adicional se agregue» —un dato que no se puede aplicar
   * sin pisar otro se guarda igual, para que lo mire una persona—.
   */
  const enLaBitacora = sql(
    `select count(*) from public.oportunidad_notas n
       join public.oportunidades o on o.id = n.oportunidad_id
       join public.clientes c on c.id = o.cliente_id
      where c.correo = '${CORREO}' and n.origen = 'unificacion';`,
  );
  es("QUEDÓ ANOTADO EN LA BITÁCORA", enLaBitacora, "1");
}

console.log("\n── PERO OTRO PROGRAMA SÍ ES OTRO TRATO ──");
{
  /*
   * La regla opuesta, y la que hace que arreglar el duplicado no se coma una
   * venta: Panadería en marzo y Pastelería en septiembre son dos ventas con dos
   * montos.
   */
  await p.getByRole("button", { name: "Entendido, cerrar" }).click();
  await p.waitForTimeout(1500);

  // Al lead que hay se le pone un programa, para que el nuevo pueda ser otro.
  const programas = sql("select nombre from public.productos order by id limit 2;").split("\n");
  sql(`
    update public.oportunidades o
       set producto_id = (select id from public.productos where nombre = '${programas[0]}')
      from public.clientes c
     where c.id = o.cliente_id and c.correo = '${CORREO}';
  `);

  await cargarDeNuevo({ programa: programas[1] });
  await p.getByRole("button", { name: /Unificar con este contacto/ }).first().click();
  await p.waitForTimeout(3000);
  await foto("5-otro-programa");

  es("AHORA SÍ SON DOS", cuantosLeads(), 2);

  const t = await texto();
  es("y la pantalla explica por qué", /Se abrió un lead aparte/.test(t), true);
  es("nombrando el motivo", /es de otro programa/.test(t), true);
}

es("sin errores en la página", errores, []);

await ctx.close();
await nav.close();
limpiar();
es("no quedó basura", cuantosLeads(), 0);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
