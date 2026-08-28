/**
 * Los nombres mal escritos, ¿se arreglan de a uno y en tanda?
 *
 *     node supabase/pruebas/banco/prueba-nombres.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Analizar si se puede agregar un corrector ortográfico automático
 * latinoamericano, como sugerencia, para reducir errores de ortografía en
 * nombres y apellidos y en las notas del CRM.»
 *
 * Lo que se hizo, y por qué así:
 *
 *   EN LA FICHA, DE A UNO   una pastilla con el nombre YA arreglado, que se
 *                           aplica con un clic. Aparece sólo con el campo
 *                           enfocado y sólo si hay algo que proponer.
 *
 *   AL SUBIR UNA BASE       una casilla que endereza las MAYÚSCULAS de golpe,
 *                           porque ahí entran trescientas de una vez.
 *
 * Y la línea que separa las dos: en tanda se acomoda la capitalización —las
 * mismas letras— pero NUNCA se tocan las tildes, porque eso cambia letras y
 * trescientos cambios de letras sin que nadie mire es como se rompe una base.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-nom-${process.pid}-${Math.random()}.sql`);
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

const GRITADO = "JOSE MENJIVAR";
const ARCHIVO = "PRUEBA nombres gritados.csv";

const limpiar = () => {
  sql(`
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where upper(nombre) like 'NOMB%'
          or nombre in ('${GRITADO}', 'Jose Menjivar', 'José Menjívar'));
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where upper(nombre) like 'NOMB%'
          or nombre in ('${GRITADO}', 'Jose Menjivar', 'José Menjívar'));
    delete from public.clientes where upper(nombre) like 'NOMB%'
       or nombre in ('${GRITADO}', 'Jose Menjivar', 'José Menjívar');
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values ('${GRITADO}', '70660001');
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'NOM-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre = '${GRITADO}';
`);

// Una planilla como las que exporta la escuela: todo en mayúsculas.
const RUTA_CSV = path.join(os.tmpdir(), ARCHIVO);
fs.writeFileSync(
  RUTA_CSV,
  [
    "Nombre,Teléfono",
    "NOMBRES UNO PEREZ,70660011",
    "  NOMBRES   SEGUNDO   DE LA CRUZ  ,70660012",
    "nombres tres hernandez,70660013",
    "Nombres Cuatro Iraheta,70660014", // ya está bien: no tiene que cambiar
  ].join("\n"),
  "utf8",
);

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/nombres-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

console.log("── EN LA FICHA, DE A UNO ──");
{
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(2200);
  await p.getByText(GRITADO, { exact: false }).first().click();
  await p.waitForTimeout(2000);

  /*
   * La casilla del nombre del cliente.
   *
   * Se toma UNA VEZ y se guarda el elemento, no el localizador: buscar por
   * `input[value=...]` deja de encontrarlo en cuanto el valor cambia, que es
   * justamente lo que esta prueba va a hacer tres veces.
   */
  const caja = await p.locator(`input[value="${GRITADO}"]`).first().elementHandle();
  es("está la casilla con el nombre gritado", caja != null, true);

  await caja.click();
  await p.waitForTimeout(600);
  await foto("1-pastillas");

  const acomodada = p.getByRole("button", { name: "Jose Menjivar", exact: true });
  const conTilde = p.getByRole("button", { name: "José Menjívar", exact: true });
  es("ofrece el nombre acomodado", await acomodada.count(), 1);
  es("Y APARTE, EL DE LAS TILDES", await conTilde.count(), 1);

  /*
   * Que sean dos pastillas y no una es el punto: acomodar son las mismas
   * letras y es seguro; poner tildes cambia letras y hay gente que se
   * apellida sin ellas. Hay que poder aceptar lo primero sin lo segundo.
   */
  await acomodada.click();
  await p.waitForTimeout(600);
  es("un clic acomoda", await caja.inputValue(), "Jose Menjivar");

  await conTilde.click();
  await p.waitForTimeout(600);
  es("y el otro pone las tildes", await caja.inputValue(), "José Menjívar");
  await foto("2-aplicado");

  await p.getByRole("button", { name: /Guardar cambios/ }).first().click();
  await p.waitForTimeout(1200);
  const confirmar = p.getByRole("button", { name: /^Guardar$|Confirmar|Aceptar/ });
  if (await confirmar.count()) await confirmar.first().click();
  await p.waitForTimeout(2500);

  es(
    "QUEDÓ GUARDADO",
    sql(`select count(*) from public.clientes where nombre = 'José Menjívar';`),
    "1",
  );
}

console.log("\n── Y AL SUBIR UNA BASE, EN TANDA ──");
{
  // Se recarga en vez de cerrar la ficha a mano: el panel abierto tapa la
  // barra lateral, y lo que sigue es otra pantalla, no la continuación de
  // ésta. Además comprueba de paso que el nombre quedó guardado de verdad y
  // no sólo en la pantalla.
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);

  await p.locator('aside button[data-mod="Bases"]').click();
  await p.waitForTimeout(1800);
  await p.getByRole("button", { name: /Subir base/ }).click();
  await p.waitForTimeout(1200);
  await p.locator('input[type="file"]').setInputFiles(RUTA_CSV);
  await p.waitForTimeout(2500);
  await foto("3-casilla");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("la casilla dice cuántos va a acomodar", texto.includes("Acomodar 3 nombres"), true);

  // Tres y no cuatro: «Nombres Cuatro Iraheta» ya estaba bien escrito y no
  // se cuenta. Un contador que incluyera los que no cambian sería mentira.
  es("y no cuenta el que ya estaba bien", texto.includes("Acomodar 4"), false);

  await p.getByRole("button", { name: /Revisar e importar/ }).click();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /^Importar \d+/ }).click();
  await p.waitForTimeout(6000);
  await foto("4-importada");

  const nombres = sql(`
    select string_agg(nombre, ' | ' order by nombre)
      from public.clientes where upper(nombre) like 'NOMBRES %';
  `);
  es(
    "ENTRARON ACOMODADOS",
    nombres,
    "Nombres Cuatro Iraheta | Nombres Segundo de la Cruz | Nombres Tres Hernandez | Nombres Uno Perez",
  );

  /*
   * Y esto es lo que NO tiene que haber pasado: «Perez» y «Hernandez» están
   * en la lista de tildes, y en la ficha se habrían propuesto. En una tanda
   * de trescientas, no. Trescientos cambios de letras que nadie miró es
   * exactamente como se le cambia el apellido a alguien sin enterarse.
   */
  es(
    "PERO NADIE LE PUSO TILDES A NADIE",
    sql(`select count(*) from public.clientes where nombre like '%Pérez%' or nombre like '%Hernández%';`),
    "0",
  );
  /*
   * «de la Cruz» con las partículas en minúscula, y los espacios de más
   * comidos. Ojo con «dos», «da» y «do»: están en la lista de partículas por
   * los apellidos portugueses («dos Santos»), así que un nombre que use esas
   * palabras como palabra sale en minúscula. Es correcto para lo que se
   * espera de verdad en las planillas.
   */
  es(
    "y «de la Cruz» quedó con la partícula en minúscula",
    sql(`select count(*) from public.clientes where nombre = 'Nombres Segundo de la Cruz';`),
    "1",
  );
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where upper(nombre) like 'NOMB%';`),
  "0",
);
fs.rmSync(RUTA_CSV, { force: true });

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
