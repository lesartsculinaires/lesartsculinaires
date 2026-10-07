/**
 * Dar de alta a alguien lo deja listo para recibir leads, no a medias.
 *
 *     node supabase/pruebas/banco/prueba-alta-con-ficha.mjs
 *
 * ============================================================================
 * LO QUE SE VIENE A ARREGLAR
 * ============================================================================
 *
 * Entrar al CRM y poder atender leads son dos cosas separadas: la cuenta vive
 * en `usuarios` y la ficha en `vendedores`, y las une `vendedores.usuario_id`.
 * El alta creaba la cuenta y se detenía ahí.
 *
 * O sea que la persona entraba al CRM sin problema —veía las pantallas, el
 * menú, todo— y no se le podía asignar ni un lead, porque no existía como
 * vendedor. Nada fallaba y nada avisaba.
 *
 * El 7 de octubre de 2026 pasó con una asesora nueva, que entró el mismo día.
 * Y al revisar: de doce cuentas, OCHO estaban así, y el reparto automático
 * terminaba siempre en la misma persona —la única con rol que recibe leads y
 * ficha—. Mil cuarenta leads contra tres, uno y dieciséis.
 *
 * ============================================================================
 * LAS TRES COSAS QUE SE VIGILAN
 * ============================================================================
 *
 *   QUE SE CREE           Con la casilla marcada, el alta tiene que dejar la
 *                         ficha creada Y ENLAZADA. Enlazada es la mitad que se
 *                         olvida: una ficha suelta no es de nadie.
 *
 *   QUE ENTRE AL REPARTO  Que `vendedores_para_reparto()` la incluya. Es lo que
 *                         falla sin ruido: a quien no tiene ficha no la saltea
 *                         con un error, directamente no está en la lista.
 *
 *   QUE EMPIECE EN CERO   Su tablero tiene que estar limpio: cero leads suyos.
 *                         Es lo que se pidió —«un pipeline en limpio»— y lo que
 *                         permite empezar a asignarle.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `alta-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -v ON_ERROR_STOP=1 -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    if (/ERROR:/m.test(salida)) {
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

const N = String(Date.now()).slice(-7);
const CORREO = `nueva${N}@lac.test`;
const NOMBRE = `Nueva Asesora ${N}`;

const limpiar = () => {
  sql(`
    delete from public.vendedores where correo like '%@lac.test' and nombre like 'Nueva Asesora %';
    delete from public.usuarios  where correo like 'nueva%@lac.test';
    delete from auth.users       where email  like 'nueva%@lac.test';
  `);
};
limpiar();

/*
 * El rol tiene que ser uno que RECIBA LEADS: es el caso que se escapaba. Se
 * busca en la base en vez de fijar un id, porque los roles son de la escuela y
 * sus ids no son estables entre bancos.
 */
const ROL = sql(`select id from public.roles where recibe_leads and activo order by id limit 1;`);
const ROL_NOMBRE = sql(`select nombre from public.roles where id = ${ROL};`);
console.log(`   (rol de la prueba: «${ROL_NOMBRE}», de los que reciben leads)`);

// ── la pantalla ────────────────────────────────────────────────────────────

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/alta-${n}.png` });

try {
  await p.goto("http://127.0.0.1:3142/?mod=Usuarios%20y%20Roles", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);

  console.log("\n── 1. SE DA DE ALTA DESDE LA PANTALLA ──");
  {
    await p.getByRole("button", { name: /Nuevo usuario/i })
      .first()
      .click();
    await p.waitForTimeout(600);

    await p.locator('input[type="email"]').first().fill(CORREO);
    await p.locator('input[placeholder="mínimo 8 caracteres"]').first().fill("unaclave12345");

    const nombre = p.locator('input[placeholder="opcional"]').first();
    if (await nombre.count()) await nombre.fill(NOMBRE);

    await p.locator("select").filter({ hasText: "Sin rol" }).first().selectOption(String(ROL));
    await p.waitForTimeout(400);
    await foto("1-alta");

    /*
     * La casilla tiene que venir MARCADA SOLA al elegir un rol que recibe
     * leads. Es la mitad del arreglo: si hubiera que acordarse de marcarla, se
     * olvidaría igual que se olvidaba el paso de antes.
     */
    const casilla = p.locator('input[type="checkbox"]').last();
    es("LA CASILLA DE LA FICHA VIENE MARCADA SOLA", await casilla.isChecked(), true);

    await p.getByRole("button", { name: /^Crear usuario$/ }).first().click();
    await p.waitForTimeout(3500);
    await foto("2-creada");
  }

  /** El id de su ficha. Se usa también en el paso 3, así que vive acá afuera. */
  let ficha = "";

  console.log("\n── 2. QUEDÓ LISTA PARA RECIBIR LEADS ──");
  {
    const idUsuario = sql(`select coalesce((select id::text from public.usuarios where correo = '${CORREO}' limit 1), '');`);
    es("la cuenta existe", idUsuario.length > 0, true);
    if (!idUsuario) throw new Error("sin cuenta no hay nada más que comprobar");

    ficha = sql(
      `select coalesce(max(id)::text, 'NINGUNA') from public.vendedores where usuario_id = '${idUsuario}';`,
    );
    es("Y TIENE SU FICHA DE VENDEDOR, ENLAZADA", ficha !== "NINGUNA", true);
    /*
     * Sin ficha no tiene sentido seguir, y preguntarle a la base por la ficha
     * «NINGUNA» sólo convierte un rojo legible en un error de psql.
     */
    if (ficha === "NINGUNA") throw new Error("sin ficha no hay nada más que comprobar");

    /*
     * Lo que fallaba sin ruido. A quien no tiene ficha el reparto no la saltea
     * con un error: no está en la lista y el reparto sigue, entre menos gente.
     */
    const enElReparto = sql(
      `select count(*) from public.vendedores_para_reparto() where id = ${ficha};`,
    );
    es("Y ENTRA EN EL REPARTO AUTOMÁTICO", enElReparto, "1");

    // Y el pipeline en limpio, que es lo que se pidió.
    const suyos = sql(`select count(*) from public.oportunidades where vendedor_id = ${ficha};`);
    es("con su pipeline en cero", suyos, "0");

    // La ficha lleva su nombre y su correo, no un hueco.
    es(
      "la ficha lleva su nombre",
      sql(`select nombre from public.vendedores where id = ${ficha};`),
      NOMBRE,
    );
    es(
      "y su correo",
      sql(`select correo from public.vendedores where id = ${ficha};`),
      CORREO,
    );
  }

  console.log("\n── 3. Y SE LE PUEDE ASIGNAR, QUE ERA EL PUNTO ──");
  {
    /*
     * Aparecer en el desplegable de «asignar a» es lo que la hace utilizable.
     * Sale del catálogo de vendedores, que se guarda: si el alta no lo tirara,
     * la persona no aparecería hasta dentro de cinco minutos.
     */
    /*
     * Se mira el CATÁLOGO y no el texto de un tablero: una vendedora sin leads
     * no sale en ningún tablero —no tiene nada que mostrar— pero sí tiene que
     * estar entre las fichas que se pueden elegir. Esa lista sale del catálogo
     * guardado, así que si el alta no lo tirara, no aparecería hasta dentro de
     * cinco minutos.
     */
    await p.goto("http://127.0.0.1:3142/?mod=Usuarios%20y%20Roles", { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);

    const opciones = await p.locator("option").allInnerTexts();
    es("ESTÁ EN EL CATÁLOGO, SIN ESPERAR AL CACHÉ", opciones.includes(NOMBRE), true);

    /*
     * Y su fila la muestra ya enlazada. Es la comprobación que cierra el
     * círculo: no es que exista una ficha suelta por ahí, es que es LA SUYA.
     */
    const fila = p.locator("tr").filter({ hasText: CORREO });
    es("y su fila la muestra enlazada con ella", await fila.locator("select").nth(1).inputValue(), ficha);
  }

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log(`✗ la prueba se cortó: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await ctx.close().catch(() => {});
  await nav.close().catch(() => {});
  limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
