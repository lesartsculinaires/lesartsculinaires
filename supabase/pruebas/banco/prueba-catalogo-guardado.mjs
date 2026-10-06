/**
 * El catálogo se lee una vez, y aun así nunca se ve viejo.
 *
 *     node supabase/pruebas/banco/prueba-catalogo-guardado.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ ARREGLANDO
 * ============================================================================
 *
 * La portada entera se vuelve a armar en cada refresco —cada minuto, y además
 * cada vez que Realtime avisa de un cambio— y el catálogo son OCHO consultas de
 * las que ninguna cambia casi nunca. Medido contra producción el 6 de octubre
 * de 2026, con el equipo trabajando: 429 peticiones por minuto contra
 * PostgREST, unas 618.000 al día para tres o cuatro personas.
 *
 * ============================================================================
 * LAS DOS MITADES, Y POR QUÉ NINGUNA SIRVE SOLA
 * ============================================================================
 *
 *   QUE SE GUARDE     Si cada refresco vuelve a pedir los ocho catálogos, no se
 *                     ahorró nada y este cambio no existe.
 *
 *   QUE NO SE VEA     Y si se guarda pero no se tira al crear un programa,
 *   VIEJO             alguien lo crea, no lo ve, lo crea otra vez. Eso es peor
 *                     que el problema que se vino a resolver: un CRM lento
 *                     molesta, uno que miente hace perder trabajo.
 *
 * Esta prueba mide las consultas de verdad, contándolas en el registro del
 * proxy antes y después. Preguntar «¿tiene caché?» no sirve: la respuesta tiene
 * que ser cuántas veces se preguntó.
 *
 * ============================================================================
 * HASTA DÓNDE LLEGA, QUE SE COMPROBÓ
 * ============================================================================
 *
 * Se la puso en rojo a mano para ver qué caza. Quitando `revalidateTag` de
 * `crearPrograma` NO se puso roja: `revalidatePath("/")` ya alcanza para tirar
 * lo guardado. Quitando las dos, el paso 3 se puso rojo —el programa creado
 * desde el CRM no aparece—.
 *
 * O sea que esta prueba vigila LO QUE LE PASA A QUIEN USA EL CRM, que es lo que
 * importa, y no cuál de las dos líneas lo logra. Si alguien viene a limpiar
 * «líneas que no hacen nada» y se lleva las dos, esto se pone rojo.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";

import { tirarCatalogo } from "./tirarCatalogo.mjs";

const RAIZ = "/home/user/lesartsculinaires";
/*
 * `ON_ERROR_STOP` no es un detalle: sin él psql sale con 0 aunque la consulta
 * falle, y entonces una limpieza que no limpió nada pasa desapercibida. Eso ya
 * pasó una vez acá y dejó un programa de prueba en el catálogo del banco, que
 * puso en rojo OTRA prueba —`prueba-programas-por-mes`, que cuenta cuántos
 * programas hay—. Un desastre difícil de rastrear: el rojo sale en un archivo
 * que nadie tocó.
 */
const sql = (q) =>
  execSync(
    `su postgres -c "psql -h /tmp -p 5511 -d crm -v ON_ERROR_STOP=1 -A -t -c \\"${q}\\""`,
    { encoding: "utf8" },
  ).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/*
 * Cuántas veces se PIDIÓ una tabla del catálogo.
 *
 * Se cuenta sobre el registro del proxy del banco, que anota una línea por
 * petición. Es mejor que mirar la base: mide exactamente lo que este cambio
 * pretende bajar —cuántas veces la aplicación sale a preguntar— y no cuántas
 * veces Postgres acabó ejecutando algo.
 *
 * (El Postgres del banco no trae `pg_stat_statements`, que sería la otra vía.)
 */
const REGISTRO = `${RAIZ}/supabase/pruebas/banco/pxv.log`;
const consultasA = (tabla) => {
  const txt = fs.existsSync(REGISTRO) ? fs.readFileSync(REGISTRO, "utf8") : "";
  return txt.split("\n").filter((l) => l.trim() === `REST /${tabla}`).length;
};

const N = String(Date.now()).slice(-7);

/*
 * Barre TODOS los `CAT %`, no sólo los de esta corrida. El prefijo es de esta
 * prueba y de nadie más, y así una corrida que se cortó a la mitad no le deja
 * basura en el catálogo a la siguiente —ni a las otras pruebas del banco—.
 */
const limpiar = () => sql(`delete from public.productos where nombre like 'CAT %'`);
limpiar();

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

// Una primera carga para que el catálogo quede guardado.
await p.goto("http://127.0.0.1:3142/?mod=Programas", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);

console.log("── 1. RECARGAR LA PORTADA NO VUELVE A PEDIR EL CATÁLOGO ──");
{
  const antes = consultasA("etapas");
  /*
   * `etapas` es el testigo ideal: está en el catálogo, no la escribe nadie
   * desde la aplicación, y ninguna otra consulta la toca. Si sube, es porque
   * se volvió a leer el catálogo.
   */
  for (let i = 0; i < 3; i++) {
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
  }
  const despues = consultasA("etapas");

  console.log(`   (consultas a etapas: ${antes} → ${despues})`);
  es("tres recargas NO vuelven a pedirlo", despues - antes, 0);
  es("y la pantalla no tiró ningún error", errores, []);
}

console.log("\n── 2. PERO UN PROGRAMA NUEVO SE VE AL INSTANTE ──");
{
  const cuantosAntes = await p.locator("section.card").count();

  /*
   * Se crea por fuera de la aplicación, a propósito: así no pasa por ninguna
   * acción y no tira nada. Es la única forma de ver que lo guardado está
   * guardado de verdad —si apareciera acá, no habría caché que medir—.
   */
  sql(
    `insert into public.productos (nombre, categoria, activo) values ('CAT ${N} Nuevo', 'Curso corto', true)`,
  );

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const texto = (await p.locator("main").innerText()).replace(/\s+/g, " ");

  /*
   * Acá TIENE que seguir sin verse: ése es el precio de guardar, y está
   * elegido. Lo que no puede pasar es que no se vea después de tocar el botón.
   */
  es("recién creado por fuera, todavía no se ve (es lo esperado)", texto.includes(`CAT ${N} Nuevo`), false);
  es("y el catálogo sigue teniendo lo de antes", await p.locator("section.card").count(), cuantosAntes);
}

console.log("\n── 3. Y AL CREARLO DESDE EL CRM, APARECE ──");
{
  /*
   * El camino de verdad: el botón de la pantalla, que es el que llama a la
   * acción, que es la que tira el catálogo guardado. Éste es el paso que se
   * pone rojo si se deja de tirar —el caso que arruinaría el cambio entero—.
   */
  await p.locator('button:has-text("Crear nuevo programa")').click();
  await p.waitForTimeout(600);

  const cuadro = p.locator('[aria-label="Nuevo programa"]');
  await cuadro.locator('input[placeholder="Diplomado de Cocina"]').fill(`CAT ${N} Desde el CRM`);
  await cuadro.locator('button:has-text("Crear programa")').click();
  await p.waitForTimeout(3000);

  /*
   * Puede aparecer el aviso de nombres parecidos —hay programas con «Curso
   * corto» en el catálogo del banco—. Si sale, se confirma.
   */
  const igual = cuadro.locator('button:has-text("Crearlo igual")');
  if (await igual.count()) {
    await igual.click();
    await p.waitForTimeout(2500);
  }

  const texto = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  es("EL PROGRAMA CREADO DESDE EL CRM SE VE", texto.includes(`CAT ${N} Desde el CRM`), true);

  /*
   * Y de paso aparece el de antes: la etiqueta tira el catálogo entero, no una
   * fila. Es lo que hace que el caso del paso 2 se resuelva solo en cuanto
   * alguien toca algo.
   */
  es("y con él, el que se había creado por fuera", texto.includes(`CAT ${N} Nuevo`), true);
}

console.log("\n── 4. DESPUÉS DE ESO, VUELVE A GUARDARSE ──");
{
  const antes = consultasA("etapas");
  for (let i = 0; i < 2; i++) {
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
  }
  const despues = consultasA("etapas");
  console.log(`   (consultas a etapas: ${antes} → ${despues})`);
  es("dos recargas más, ninguna consulta", despues - antes, 0);
}

es("ningún error de navegador en toda la corrida", errores, []);

await nav.close();
limpiar();

/*
 * Y se tira el catálogo guardado al salir. No es cortesía: esta prueba crea y
 * borra programas, y lo que queda guardado es un catálogo que ya no existe. La
 * próxima prueba del banco que mire la pantalla lo vería, y el rojo le saldría
 * a ella.
 */
await tirarCatalogo();

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
