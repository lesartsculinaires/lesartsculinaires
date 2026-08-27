/**
 * La ficha se abre encima del tablero, y el país del extranjero.
 *
 *     node supabase/pruebas/banco/prueba-ficha-sobre-pipeline.mjs
 *
 * Dos cosas que se piden juntas porque se prueban en el mismo recorrido: se
 * abre una ficha desde el Pipeline y, ya adentro, se marca «Extranjero» y se
 * escribe el país.
 *
 * ------------------------------------------------------------------------
 * LO QUE IMPORTA DE CADA UNA
 * ------------------------------------------------------------------------
 *
 * DE LA FICHA      que el tablero siga detrás. Antes se saltaba a Clientes, y
 *                  volver costaba reencontrar la columna y volver a elegir el
 *                  asesor. Se comprueba mirando que las columnas del embudo
 *                  sigan dibujadas con la ficha abierta, y que al cerrarla la
 *                  pantalla siga siendo Pipeline.
 *
 * DEL PAÍS         que la casilla aparezca sólo con «Extranjero», que aparezca
 *                  ANTES de guardar el territorio —porque lo normal es marcar
 *                  y escribir seguido— y que lo escrito llegue a la base.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-ficha-${process.pid}-${Math.random()}.sql`);
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

if (sql("select count(*) from public.territorios where lower(btrim(nombre))='extranjero';") !== "1") {
  console.error("Falta «Extranjero». Corré 20261003120000_extranjero.sql.");
  process.exit(1);
}

const CLIENTE = "Ficha Sobre Tablero";
const limpiar = () => {
  sql(`
    delete from public.oportunidades where codigo = 'FST-0001';
    delete from public.clientes where nombre = '${CLIENTE}';
  `);
};
limpiar();

sql(`
  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '70880001');
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'FST-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.etapas order by orden limit 1),
         current_date
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/ficha-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2400);

/** Qué módulo está marcado en la barra. */
const moduloActual = async () =>
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("aside nav button[data-mod]")].find(
      (x) => getComputedStyle(x).backgroundColor !== "rgba(0, 0, 0, 0)",
    );
    return b?.getAttribute("data-mod") ?? null;
  });

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la ficha se abre sin salir del tablero ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Pipeline"]').click();
await p.waitForTimeout(2000);
es("estamos en Pipeline", await moduloActual(), "Pipeline");

await p.getByText(CLIENTE, { exact: false }).first().click();
await p.waitForTimeout(1800);

/*
 * La ficha es un `aside`, sin `role="dialog"`, así que se la reconoce por lo
 * que muestra: el código del lead. Buscarla por rol devolvía cero y la prueba
 * decía que no había abierto cuando estaba abierta.
 */
const ficha = p.locator("aside").filter({ hasText: "FST-0001" });
es("se abrió la ficha", await ficha.count(), 1);

es("Y SEGUIMOS EN PIPELINE, NO EN CLIENTES", await moduloActual(), "Pipeline");

// El tablero tiene que seguir dibujado detrás: si se hubiera cambiado de
// pantalla, sus columnas ya no estarían.
const hayEmbudo = await p.evaluate(() =>
  /Prospectos|Contacto|Propuesta|Cierre/.test(document.querySelector("main")?.innerText ?? ""),
);
es("y el embudo sigue detrás", hayEmbudo, true);
await foto("1-sobre-el-tablero");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Extranjero, y el país escrito ──");
// ══════════════════════════════════════════════════════════════════════════

// Antes de marcar nada, la casilla de país no tiene que estar.
const dice = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
es("todavía no se pide el país", /\bPaís\b/.test(await dice()), false);

// Marcar «Extranjero» en el desplegable de Territorio.
/*
 * El desplegable se abre con `force`.
 *
 * El botón tiene adentro un `<span>—</span>` con el valor, y Playwright ve que
 * ese span queda encima del punto donde iba a hacer clic y se queda esperando
 * a que se despeje, cosa que no pasa nunca. El clic va igual al botón, que es
 * quien tiene el manejador.
 */
await ficha.getByRole("button", { name: /Territorio/ }).first().click({ force: true });
await p.waitForTimeout(700);
await p.getByRole("button", { name: "Extranjero", exact: true }).first().click({ force: true });
await p.waitForTimeout(1200);

es("AHORA SÍ SE PIDE EL PAÍS, ANTES DE GUARDAR", /\bPaís\b/.test(await dice()), true);
await foto("2-pide-el-pais");

/*
 * El País pasó de cuadro de texto a lista.
 *
 * Esta prueba lo escribía a mano y buscaba el campo por su placeholder de
 * entonces —«Guatemala, Honduras, España…»—. Ahora se elige de un desplegable
 * agrupado, que es lo que evita que la misma columna termine con «guate»,
 * «Guate» y «GUATEMALA».
 */
const caja = ficha.locator("select").filter({ hasText: "Costa Rica" });
es("el país se elige de una lista", await caja.count(), 1);
await caja.selectOption("Costa Rica");
await p.waitForTimeout(900);

// Guardar los dos cambios juntos: el territorio y el país.
await p.getByRole("button", { name: "Guardar cambios" }).click();
await p.waitForTimeout(900);
await p.getByRole("button", { name: /Guardar|Aceptar|Confirmar/ }).last().click();
await p.waitForTimeout(2500);
await foto("3-guardado");

es(
  "EL PAÍS QUEDÓ EN LA BASE",
  sql(`select coalesce(pais,'(vacío)') from public.clientes where nombre = '${CLIENTE}';`),
  "Costa Rica",
);
es(
  "y el territorio es Extranjero",
  sql(`
    select t.nombre from public.oportunidades o
      join public.territorios t on t.id = o.territorio_id
     where o.codigo = 'FST-0001';
  `),
  "Extranjero",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. al cerrar, el tablero sigue ahí ──");
// ══════════════════════════════════════════════════════════════════════════
await p.keyboard.press("Escape");
await p.waitForTimeout(1200);
es("la pantalla sigue siendo Pipeline", await moduloActual(), "Pipeline");

await nav.close();
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre = '${CLIENTE}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
