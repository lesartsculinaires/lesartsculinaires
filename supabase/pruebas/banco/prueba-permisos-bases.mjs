/**
 * Bases: quién puede subir una y quién puede abrirla.
 *
 *     npx esbuild src/lib/permisos.ts --bundle --format=esm --platform=node \
 *       --alias:@=./src --outfile=supabase/pruebas/permisos.mjs
 *     node supabase/pruebas/banco/prueba-permisos-bases.mjs
 *
 * El primer paso arma la copia de `puede()` que corre en el navegador, para
 * poder compararla contra la de la base. Es un archivo generado y no se
 * guarda en el repositorio.
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * Que las casillas «crear» y «editar» del rol, que hasta ahora se guardaban y
 * nadie leía, cambien de verdad lo que pasa. Y en los dos lados, porque son
 * dos cosas distintas:
 *
 *   la pantalla   no ofrece un botón que iba a fallar
 *   la base       lo impide aunque nadie mire la pantalla
 *
 * Lo segundo es lo que protege. Se prueba pidiéndole a la base el `insert`
 * directamente con la sesión de la asesora, saltándose el CRM entero: es lo
 * que puede hacer cualquiera que tenga la llave pública del proyecto, que está
 * en el navegador de todos.
 *
 * ------------------------------------------------------------------------
 * Y QUE LAS DOS COPIAS DE LA REGLA DIGAN LO MISMO
 * ------------------------------------------------------------------------
 *
 * La regla está escrita dos veces: `public.puede()` en la base y `puede()` en
 * `src/lib/permisos.ts`. Es a propósito —la pantalla necesita decidir sin
 * preguntar— pero dos copias se separan solas con el tiempo. Acá se las
 * compara contra los mismos casos, incluidos los dos valores por omisión, que
 * son justo donde es fácil que una diga sí y la otra no.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import { puede } from "/home/user/lesartsculinaires/supabase/pruebas/permisos.mjs";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-bases-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

if (sql("select count(*) from pg_proc where proname = 'puede';") === "0") {
  console.error("Falta la función. Corré 20261002120000_permisos_de_bases.sql.");
  process.exit(1);
}

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const ALE = subDe("jwt-ale.txt");

const ROL_ALE = sql(`select rol_id from public.usuarios where id = '${ALE}';`);
const ANTES = sql(`
  select coalesce(ver::text, '-') || '|' || coalesce(crear::text, '-') || '|' ||
         coalesce(editar::text, '-')
    from public.rol_permisos where rol_id = ${ROL_ALE} and modulo = 'bases';
`);

/** Corre una sentencia con la sesión de alguien, como lo haría PostgREST. */
const como = (quien, sentencia) =>
  sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';
    ${sentencia}
    reset role;
  `);

const ponerle = (ver, crear, editar) =>
  sql(`
    insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
    values (${ROL_ALE}, 'bases', ${ver}, ${crear}, ${editar}, false)
        on conflict (rol_id, modulo) do update
       set ver = excluded.ver, crear = excluded.crear, editar = excluded.editar;
  `);

const limpiar = () => sql("delete from public.importaciones where archivo like 'PRUEBA %';");
limpiar();

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. las dos copias de la regla dicen lo mismo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Se prueban los tres estados que existen: sin fila —el valor por omisión,
   * que es distinto para «ver» que para el resto—, todo destildado, y
   * habilitado.
   */
  const casos = [
    { nombre: "sin fila", fila: null },
    { nombre: "todo en no", fila: { ver: false, crear: false, editar: false } },
    { nombre: "puede subir y abrir", fila: { ver: true, crear: true, editar: true } },
  ];

  for (const caso of casos) {
    if (caso.fila) ponerle(caso.fila.ver, caso.fila.crear, caso.fila.editar);
    else sql(`delete from public.rol_permisos where rol_id = ${ROL_ALE} and modulo = 'bases';`);

    for (const accion of ["ver", "crear", "editar"]) {
      const enLaBase = como(ALE, `select public.puede('bases', '${accion}');`) === "t";

      const permisos = caso.fila
        ? [{ rolId: 1, modulo: "bases", ...caso.fila, eliminar: false }]
        : [];
      const enLaPantalla = puede(permisos, 1, false, "bases", accion);

      es(
        `«${accion}» con ${caso.nombre}: la base y la pantalla coinciden (${enLaBase ? "sí" : "no"})`,
        enLaPantalla,
        enLaBase,
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. sin el permiso, la base no la deja subir ──");
// ══════════════════════════════════════════════════════════════════════════
{
  ponerle(true, false, false);

  como(ALE, `
    insert into public.importaciones (archivo, filas, creado_por)
    values ('PRUEBA sin permiso.xlsx', 0, '${ALE}');
  `);

  es(
    "NO SE ABRIÓ LA BASE, AUNQUE PIDIÓ EL INSERT DIRECTO",
    sql("select count(*) from public.importaciones where archivo = 'PRUEBA sin permiso.xlsx';"),
    "0",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. con el permiso, sí ──");
// ══════════════════════════════════════════════════════════════════════════
{
  ponerle(true, true, true);

  como(ALE, `
    insert into public.importaciones (archivo, filas, creado_por)
    values ('PRUEBA con permiso.xlsx', 0, '${ALE}');
  `);

  es(
    "la base quedó abierta",
    sql("select count(*) from public.importaciones where archivo = 'PRUEBA con permiso.xlsx';"),
    "1",
  );

  // Y puede seguir sumándole filas: la importación va de a doscientas y
  // acumula el contador lote a lote. Si el update quedara cerrado, un archivo
  // grande se cortaría en el segundo lote.
  como(ALE, `
    update public.importaciones set filas = 200 where archivo = 'PRUEBA con permiso.xlsx';
  `);
  es(
    "y puede sumarle los lotes siguientes",
    sql("select filas from public.importaciones where archivo = 'PRUEBA con permiso.xlsx';"),
    "200",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. y en la pantalla ──");
// ══════════════════════════════════════════════════════════════════════════

/*
 * Las bases que inventó esta prueba se van antes de mirar la pantalla.
 *
 * Se quedaron arriba de la lista y no tienen ningún registro —se abrieron
 * vacías, a propósito— así que el clic de más abajo caía sobre ellas y leía
 * «esta base no tiene registros vivos». La prueba decía que el detalle no
 * abría cuando en realidad abría perfecto y no había nada que mostrar.
 */
limpiar();

const abrir = async () => {
  const jwt = fs
    .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-ale.txt", "utf8")
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
        user: { id: ALE, email: "ale@lac.test" },
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
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2400);
  return { nav, p };
};

const enModulo = async (p, modulo) => {
  await p.locator(`aside button[data-mod="${modulo}"]`).click();
  await p.waitForTimeout(1800);
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/bases-${n}.png` });

{
  ponerle(true, false, false);
  const { nav, p } = await abrir();

  await enModulo(p, "Bases");
  es("sin permiso NO aparece «Subir base»",
     await p.getByRole("button", { name: "↑ Subir base" }).count(), 0);

  // Y las bases no se abren: el detalle es la lista de nombres del archivo.
  const filas = p.locator("tbody tr");
  if ((await filas.count()) > 0) {
    await filas.first().click();
    await p.waitForTimeout(900);
    const texto = (await p.evaluate(() => document.querySelector("main")?.innerText ?? "")).replace(/\s+/g, " ");
    es("y el clic en una base no abre nada", /CRM-\d/.test(texto), false);
  }
  await foto(p, "1-sin-permiso");

  await enModulo(p, "Clientes");
  es("tampoco «Subir base de datos» en Clientes",
     await p.getByRole("button", { name: "↑ Subir base de datos" }).count(), 0);

  await nav.close();
}

{
  ponerle(true, true, true);
  const { nav, p } = await abrir();

  await enModulo(p, "Bases");
  es("CON PERMISO SÍ APARECE «Subir base»",
     await p.getByRole("button", { name: "↑ Subir base" }).count(), 1);

  const filas = p.locator("tbody tr");
  if ((await filas.count()) > 0) {
    await filas.first().click();
    await p.waitForTimeout(900);
    const texto = (await p.evaluate(() => document.querySelector("main")?.innerText ?? "")).replace(/\s+/g, " ");
    es("y ahora la base se abre y muestra sus registros", /CRM-\d/.test(texto), true);
  }
  await foto(p, "2-con-permiso");

  await enModulo(p, "Clientes");
  es("y vuelve el botón de Clientes",
     await p.getByRole("button", { name: "↑ Subir base de datos" }).count(), 1);

  await nav.close();
}

// Dejar el rol como estaba.
if (ANTES === "") {
  sql(`delete from public.rol_permisos where rol_id = ${ROL_ALE} and modulo = 'bases';`);
} else {
  const [v, c, e] = ANTES.split("|");
  ponerle(v, c, e);
}
limpiar();

es(
  "el rol de Ale quedó como estaba",
  sql(`
    select coalesce(ver::text,'-')||'|'||coalesce(crear::text,'-')||'|'||coalesce(editar::text,'-')
      from public.rol_permisos where rol_id = ${ROL_ALE} and modulo = 'bases';
  `),
  ANTES,
);
es("y no quedaron bases de prueba",
   sql("select count(*) from public.importaciones where archivo like 'PRUEBA %';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
