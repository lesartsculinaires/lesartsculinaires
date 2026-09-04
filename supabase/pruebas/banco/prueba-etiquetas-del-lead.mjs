/**
 * Etiquetas en la ficha del lead, y el filtro que arma el envío.
 *
 *     node supabase/pruebas/banco/prueba-etiquetas-del-lead.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Quiero que pongamos en la ficha de cada lead una opción para colocar
 * etiquetas o viñetas, para que eso ayude al momento de hacer los envíos
 * masivos y seleccionarlos o agruparlos.»
 *
 * Son las dos mitades y la segunda es la que le da sentido a la primera: una
 * etiqueta que se pone y no se puede cosechar después no sirve para armar
 * nada. Por eso esta prueba no termina en «se guardó»: sigue hasta Clientes,
 * filtra por la etiqueta y comprueba que quede en pantalla la persona
 * etiquetada y NO la otra, que es exactamente el momento en que alguien marca
 * todas las filas y aprieta «Escribirles por WhatsApp».
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `etq-lead-${process.pid}-${Math.random()}.sql`);
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
  sql(
    "select count(*) from information_schema.tables where table_name='oportunidad_etiquetas';",
  ) !== "1"
) {
  console.error("Falta la tabla. Corré 20261022120000_etiquetas_en_el_lead.sql.");
  process.exit(1);
}

// Dos personas: una se etiqueta, la otra no. La segunda es la que demuestra
// que el filtro filtra, en vez de dejar todo pasar.
const CON = "Etiquetado Prueba";
const SIN = "Sin Etiqueta Prueba";
const ETIQUETA = "Viene de feria PRUEBA";

const limpiar = () => {
  sql(`
    delete from public.oportunidad_etiquetas where oportunidad_id in
      (select id from public.oportunidades where codigo in ('ETQ-0001','ETQ-0002'));
    delete from public.oportunidades where codigo in ('ETQ-0001','ETQ-0002');
    delete from public.clientes where nombre in ('${CON}', '${SIN}');
    delete from public.etiquetas where nombre = '${ETIQUETA}';
  `);
};
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values ('${CON}','50370666001'), ('${SIN}','50370666002');

  insert into public.oportunidades (codigo, cliente_id, etapa_id, estado_id, fecha_registro)
  select 'ETQ-0001', c.id,
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre='Activo'),
         current_date
    from public.clientes c where c.nombre = '${CON}';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, estado_id, fecha_registro)
  select 'ETQ-0002', c.id,
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre='Activo'),
         current_date
    from public.clientes c where c.nombre = '${SIN}';
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
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/etq-lead-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2000);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la ficha deja poner una etiqueta ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByPlaceholder(/Buscar/).first().fill(CON);
await p.waitForTimeout(1500);
await p.locator('main tbody tr:has-text("ETQ-0001")').click();
await p.waitForTimeout(2200);

const ficha = p.locator("aside").filter({ hasText: "ETQ-0001" });
es("se abrió la ficha", await ficha.count(), 1);
es(
  "y tiene su parte de etiquetas",
  await ficha.getByRole("button", { name: /\+ Etiqueta/ }).count(),
  1,
);

// Se crea desde la misma ficha, que es como se usa: nadie va a otra pantalla
// a dar de alta «viene de feria» antes de poder ponerla.
await ficha.getByRole("button", { name: /\+ Etiqueta/ }).first().click();
await p.waitForTimeout(700);
await p.getByPlaceholder("Nueva etiqueta…").fill(ETIQUETA);
await p.waitForTimeout(300);
await p.getByRole("button", { name: "Crear y ponerla" }).first().click();
await p.waitForTimeout(3000);
await foto("1-puesta");

es(
  "SE GUARDÓ EN LA BASE, COLGADA DEL LEAD",
  sql(`
    select count(*) from public.oportunidad_etiquetas oe
    join public.oportunidades o on o.id = oe.oportunidad_id
    join public.etiquetas e on e.id = oe.etiqueta_id
    where o.codigo = 'ETQ-0001' and e.nombre = '${ETIQUETA}';
  `),
  "1",
);
es(
  "y NO se le puso al otro lead",
  sql(`
    select count(*) from public.oportunidad_etiquetas oe
    join public.oportunidades o on o.id = oe.oportunidad_id
    where o.codigo = 'ETQ-0002';
  `),
  "0",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. EL FILTRO EN CLIENTES, QUE ES LO QUE ARMA EL ENVÍO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Primero se cierra el desplegable de etiquetas, y después la ficha.
 *
 * El desplegable deja una capa invisible a pantalla completa para cerrarse al
 * hacer clic afuera —así funciona también en la bandeja—, y mientras está,
 * cualquier clic le llega a ella y no al botón de abajo. Un clic en cualquier
 * lado la levanta, que es justo para lo que está.
 */
await p.mouse.click(700, 950);
await p.waitForTimeout(600);
await p.locator('aside button[aria-label="Cerrar"]').first().click();
await p.waitForTimeout(1500);
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2500);

es(
  "hay un filtro de etiqueta",
  await p.getByRole("button", { name: /Etiqueta/ }).count() > 0,
  true,
);

await p.getByRole("button", { name: /Etiqueta/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole("button", { name: ETIQUETA, exact: true }).first().click();
await p.waitForTimeout(2000);
await foto("2-filtrado");

const enPantalla = async () =>
  (await p.locator("main").innerText()).replace(/\s+/g, " ");

const texto = await enPantalla();
es("QUEDA EL ETIQUETADO", texto.includes("ETQ-0001"), true);
es("Y NO EL QUE NO LO ESTÁ", texto.includes("ETQ-0002"), false);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. quitarla la saca de verdad ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('main tbody tr:has-text("ETQ-0001")').click();
await p.waitForTimeout(2200);
await p
  .locator("aside")
  .filter({ hasText: "ETQ-0001" })
  .getByRole("button", { name: new RegExp(ETIQUETA) })
  .first()
  .click();
await p.waitForTimeout(2200);

es(
  "se borró la fila",
  sql(`
    select count(*) from public.oportunidad_etiquetas oe
    join public.oportunidades o on o.id = oe.oportunidad_id
    where o.codigo = 'ETQ-0001';
  `),
  "0",
);

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.clientes where nombre in ('${CON}','${SIN}');`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
