/**
 * La ficha desde el Inbox, el país de una lista y el cumpleaños.
 *
 *     node supabase/pruebas/banco/prueba-ficha-desde-inbox.mjs
 *
 * Tres cosas que se piden juntas porque se prueban en el mismo recorrido: se
 * abre una ficha desde la bandeja y, ya adentro, se elige el país y se carga
 * la fecha de nacimiento.
 *
 * ------------------------------------------------------------------------
 * LO QUE IMPORTA DE CADA UNA
 * ------------------------------------------------------------------------
 *
 * LA FICHA     que la bandeja siga detrás. Antes se saltaba a Clientes y
 *              quien estaba atendiendo perdía el hilo abierto y tenía que
 *              buscarlo otra vez entre todos.
 *
 * EL PAÍS      que sea una lista y no un cuadro de texto, y que lo elegido
 *              llegue a la base. La lista es lo que evita «guate», «Guate» y
 *              «GUATEMALA» conviviendo en la misma columna.
 *
 * EL CUMPLE    que se guarde como fecha. Es lo que después permite preguntar
 *              quién cumple esta semana.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-inbox-${process.pid}-${Math.random()}.sql`);
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

if (sql("select count(*) from information_schema.columns where table_name='clientes' and column_name='fecha_nacimiento';") !== "1") {
  console.error("Falta la columna. Corré 20261005120000_fecha_nacimiento.sql.");
  process.exit(1);
}

const TEL = "50370555001";
const CLIENTE = "Desde La Bandeja";
const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.oportunidades where codigo = 'INB-0001';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${CLIENTE}');
    delete from public.clientes where nombre = '${CLIENTE}';
  `);
};
limpiar();

// Un cliente con su lead y una conversación en la bandeja, con un entrante
// para que el hilo se vea normal.
sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '${TEL}');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'INB-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.conversaciones (telefono, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select '${TEL}', '${CLIENTE}', c.id, now()
    from public.clientes c where c.nombre = '${CLIENTE}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.INB1', 'entrante', 'text', 'Hola, quiero información', now()
    from public.conversaciones v where v.telefono = '${TEL}';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/inbox-ficha-${n}.png` });

const moduloActual = async () =>
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("aside nav button[data-mod]")].find(
      (x) => getComputedStyle(x).backgroundColor !== "rgba(0, 0, 0, 0)",
    );
    return b?.getAttribute("data-mod") ?? null;
  });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la ficha se abre sin salir de la bandeja ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);
es("estamos en Inbox", await moduloActual(), "Inbox");

await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(1800);

// El botón que lleva a la ficha desde la conversación abierta.
await p.getByRole("button", { name: /Ver ficha|Ficha/ }).first().click();
await p.waitForTimeout(2000);

const ficha = p.locator("aside").filter({ hasText: "INB-0001" });
es("se abrió la ficha", await ficha.count(), 1);
es("Y SEGUIMOS EN INBOX, NO EN CLIENTES", await moduloActual(), "Inbox");

// La bandeja tiene que seguir dibujada detrás.
const hayBandeja = await p.evaluate(() =>
  /Hola, quiero información/.test(document.querySelector("main")?.innerText ?? ""),
);
es("y el hilo sigue detrás", hayBandeja, true);
await foto("1-sobre-la-bandeja");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. el país se elige de una lista ──");
// ══════════════════════════════════════════════════════════════════════════
{
  // Primero hay que marcar el territorio como Extranjero para que aparezca.
  await ficha.getByRole("button", { name: /Territorio/ }).first().click({ force: true });
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: "Extranjero", exact: true }).first().click({ force: true });
  await p.waitForTimeout(1200);

  const lista = ficha.locator("select").filter({ hasText: "Guatemala" });
  es("EL PAÍS ES UNA LISTA, NO UN CUADRO DE TEXTO", await lista.count(), 1);

  const grupos = await lista.locator("optgroup").evaluateAll((gs) =>
    gs.map((g) => g.getAttribute("label")),
  );
  es("y viene agrupada, con Centroamérica primero", grupos[0], "Centroamérica y el Caribe");

  await lista.selectOption("Costa Rica");
  await p.waitForTimeout(1200);
  await foto("2-pais-elegido");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. el cumpleaños ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Se busca por la fila que dice «Cumpleaños», no con `.last()`.
   *
   * La ficha tiene otras casillas de fecha —registro, cierre— y `.last()`
   * agarraba una de ésas: la prueba escribía en el campo equivocado y después
   * se quejaba de que el cumpleaños no se había guardado, que era cierto pero
   * por su culpa.
   */
  const fila = ficha.locator("div").filter({ hasText: /^Cumpleaños/ }).last();
  const cumple = fila.locator('input[type="date"]').first();
  es("hay una casilla de fecha", await cumple.count(), 1);
  await cumple.fill("1995-04-03");
  await cumple.press("Enter");
  await p.waitForTimeout(1000);
}

// Guardar los cambios pendientes de la ficha.
await ficha.getByRole("button", { name: "Guardar cambios" }).click();
await p.waitForTimeout(900);
await p.getByRole("button", { name: /Guardar|Aceptar|Confirmar/ }).last().click();
await p.waitForTimeout(2600);
await foto("3-guardado");

console.log("\n── lo que quedó en la base ──");
{
  es(
    "EL PAÍS SE GUARDÓ",
    sql(`select coalesce(pais,'(vacío)') from public.clientes where nombre = '${CLIENTE}';`),
    "Costa Rica",
  );
  es(
    "Y EL CUMPLEAÑOS, COMO FECHA",
    sql(`select coalesce(fecha_nacimiento::text,'(vacío)') from public.clientes where nombre = '${CLIENTE}';`),
    "1995-04-03",
  );
  // Guardado como fecha se puede preguntar por día y mes, que es para lo que sirve.
  es(
    "y se puede preguntar quién cumple el 3 de abril",
    sql(`
      select count(*) from public.clientes
       where extract(day from fecha_nacimiento) = 3
         and extract(month from fecha_nacimiento) = 4
         and nombre = '${CLIENTE}';
    `),
    "1",
  );
}

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre = '${CLIENTE}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
