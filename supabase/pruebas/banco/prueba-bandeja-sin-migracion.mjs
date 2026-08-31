/**
 * ¿La bandeja aguanta si todavía no se corrió la migración de las marcas?
 *
 *     node supabase/pruebas/banco/prueba-bandeja-sin-migracion.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO ES UNA PRUEBA Y NO UNA SUPOSICIÓN
 * ------------------------------------------------------------------------
 *
 * Porque es exactamente lo que va a pasar en la escuela. El código se despliega
 * solo cuando algo llega a `main`; el SQL lo corre una persona, a mano, cuando
 * puede. Entre las dos cosas pasan horas o días, y en esa ventana la aplicación
 * nueva está hablando con una base vieja.
 *
 * Sin cuidado, eso es una bandeja en blanco: pedirle a PostgREST tres columnas
 * que no existen devuelve 42703 y el error se lleva la consulta entera, no sólo
 * las columnas que faltan. La bandeja es de lo más usado del CRM y quedaría
 * muerta hasta que alguien se acuerde de correr el archivo, sin ninguna pista
 * de por qué.
 *
 * Lo que se prueba: que sin las columnas la bandeja siga andando entera —listar,
 * abrir, leer— y que las tres marcas nuevas, en vez de fallar calladas, digan
 * qué archivo hay que correr.
 *
 * La prueba tira las columnas y las vuelve a poner al terminar. Necesita el
 * banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";

const psql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

/** Deja la base como estaba antes de la migración de las marcas. */
const quitarColumnas = () =>
  psql(
    "alter table public.conversaciones drop column if exists no_leida, " +
      "drop column if exists fijada, drop column if exists silenciada; " +
      "notify pgrst, 'reload schema';",
  );

/** Y las devuelve. Igual que la migración, que sólo agrega. */
const ponerColumnas = () =>
  psql(
    "alter table public.conversaciones " +
      "add column if not exists no_leida boolean not null default false, " +
      "add column if not exists fijada boolean not null default false, " +
      "add column if not exists silenciada boolean not null default false; " +
      "notify pgrst, 'reload schema';",
  );

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

quitarColumnas();
// PostgREST tiene que enterarse antes de que la pantalla pida nada.
await new Promise((s) => setTimeout(s, 1500));

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
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

try {
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

  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2500);

  console.log("── la bandeja de siempre, entera ──");
  {
    es("SIGUE MOSTRANDO LOS HILOS", (await p.locator("main button.row").count()) > 0, true);

    // Abrir un hilo llama a `marcarLeida`, que ahora también apaga `no_leida`.
    // Sin el reintento sin esa columna, entrar a cualquier conversación
    // fallaría, que es la bandeja entera.
    await p.locator("main button.row").first().click();
    await p.waitForTimeout(2500);
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("Y SE PUEDE ENTRAR A UNO", t.includes("Elegí una conversación de la izquierda"), false);
  }

  console.log("\n── y las marcas nuevas dicen qué falta ──");
  {
    await p.getByRole("button", { name: /^Más acciones de / }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("menuitem", { name: "📌 Fijar arriba" }).click();
    await p.waitForTimeout(2000);
    await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/sin-migracion.png" });

    const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    console.log(`   (${(t.match(/Para fijar[^]{0,110}/) ?? ["sin aviso"])[0]})`);
    es("NOMBRA EL ARCHIVO QUE HAY QUE CORRER", /20261011120000_bandeja_marcas\.sql/.test(t), true);
    // Cerrarse dejaría a la persona apretando un botón que no hace nada y sin
    // manera de enterarse de por qué.
    es("y el menú se queda abierto para poder leerlo", await p.getByRole("menu").count(), 1);
  }

  es("sin errores en la página", errores, []);
  await ctx.close();
} finally {
  await nav.close();
  ponerColumnas();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
