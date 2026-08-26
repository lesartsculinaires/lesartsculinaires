/**
 * Formularios: la casilla del rol decide, no «sos administrador».
 *
 *     node supabase/pruebas/banco/prueba-formularios-por-rol.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO
 * ------------------------------------------------------------------------
 *
 * El defecto que reportó la escuela: dirección le tildó «crear» al Jefe de
 * ventas y el botón «Nuevo formulario» seguía sin aparecer.
 *
 * La casilla se guardaba bien; lo que fallaba es que nadie la leía. La
 * pantalla preguntaba «¿sos administrador?», las acciones del servidor lo
 * mismo, y las políticas de las tablas también: tres lugares con la misma
 * pregunta equivocada. Por eso la prueba mira los tres.
 *
 * El tercero es el que protege. Se comprueba pidiéndole el `insert` a la base
 * directamente con la sesión de la persona, saltándose el CRM entero.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * Como `sql`, pero sin cortar cuando la base rechaza algo.
 *
 * Es para las sentencias que se espera que fallen: media prueba de acá
 * consiste en que la política diga que no, y ese «no» llega como un ERROR de
 * psql. Con el corte puesto, la prueba se moría justo cuando el CRM estaba
 * haciendo lo correcto.
 */
const sqlCrudo = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-form-crudo-${process.pid}-${Math.random()}.sql`);
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

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-form-${process.pid}-${Math.random()}.sql`);
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

if (sql("select count(*) from pg_policies where policyname='formularios_crear';") !== "1") {
  console.error("Faltan las políticas. Corré 20261004120000_formularios_por_rol.sql.");
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
const ROL = sql(`select rol_id from public.usuarios where id = '${ALE}';`);

const ANTES = sql(`
  select coalesce(ver::text,'-')||'|'||coalesce(crear::text,'-')||'|'||coalesce(editar::text,'-')
    from public.rol_permisos where rol_id = ${ROL} and modulo = 'formularios';
`);

const ponerle = (ver, crear, editar) =>
  sql(`
    insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
    values (${ROL}, 'formularios', ${ver}, ${crear}, ${editar}, false)
        on conflict (rol_id, modulo) do update
       set ver = excluded.ver, crear = excluded.crear, editar = excluded.editar;
  `);

const como = (quien, sentencia) =>
  sqlCrudo(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';
    ${sentencia}
    reset role;
  `);

const limpiar = () => sql("delete from public.formularios where nombre like 'PRUEBA %';");
limpiar();

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. sin la casilla, la base no la deja armar uno ──");
// ══════════════════════════════════════════════════════════════════════════
{
  ponerle(true, false, false);
  como(ALE, `
    insert into public.formularios (nombre, descripcion, activo)
    values ('PRUEBA sin permiso', 'x', true);
  `);
  es(
    "NO SE CREÓ, AUNQUE PIDIÓ EL INSERT DIRECTO",
    sql("select count(*) from public.formularios where nombre = 'PRUEBA sin permiso';"),
    "0",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. con «crear», sí ──");
// ══════════════════════════════════════════════════════════════════════════
{
  ponerle(true, true, false);
  como(ALE, `
    insert into public.formularios (nombre, descripcion, activo)
    values ('PRUEBA con permiso', 'x', true);
  `);
  es(
    "el formulario quedó creado",
    sql("select count(*) from public.formularios where nombre = 'PRUEBA con permiso';"),
    "1",
  );

  /*
   * Y puede escribirle las preguntas.
   *
   * Es el caso que obligó a que las preguntas acepten «crear» además de
   * «editar»: armar un formulario son dos escrituras, y exigiendo «editar»
   * para la segunda quien tiene sólo «crear» quedaría con un formulario vacío
   * ya creado y sin forma de completarlo.
   */
  const id = sql("select id from public.formularios where nombre = 'PRUEBA con permiso';");
  como(ALE, `
    insert into public.formulario_campos (formulario_id, etiqueta, tipo, orden)
    values (${id}, 'PRUEBA pregunta', 'texto', 1);
  `);
  es(
    "y le pudo escribir las preguntas",
    sql(`select count(*) from public.formulario_campos where formulario_id = ${id};`),
    "1",
  );

  // Pero sin «editar» no puede tocar el formulario ya hecho.
  como(ALE, `update public.formularios set nombre = 'PRUEBA cambiado' where id = ${id};`);
  es(
    "SIN «EDITAR» NO PUEDE CAMBIARLO",
    sql(`select nombre from public.formularios where id = ${id};`),
    "PRUEBA con permiso",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. y en la pantalla ──");
// ══════════════════════════════════════════════════════════════════════════

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
  await p.locator('aside button[data-mod="Formularios"]').click();
  await p.waitForTimeout(1800);
  return { nav, p };
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/form-${n}.png` });

{
  // Sin «crear»: no hay botón. Es exactamente lo que veía Katya.
  ponerle(true, false, false);
  const { nav, p } = await abrir();
  es("sin «crear» no aparece «Nuevo formulario»",
     await p.getByRole("button", { name: "Nuevo formulario" }).count(), 0);
  es("ni «Editar preguntas»",
     await p.getByRole("button", { name: "Editar preguntas" }).count(), 0);
  await foto(p, "1-sin-permiso");
  await nav.close();
}

{
  // Con «crear» y sin «editar»: el botón de armar sí, el de editar no.
  ponerle(true, true, false);
  const { nav, p } = await abrir();
  es("CON «CREAR» YA APARECE «Nuevo formulario»",
     await p.getByRole("button", { name: "Nuevo formulario" }).count(), 1);
  es("pero todavía no «Editar preguntas»",
     await p.getByRole("button", { name: "Editar preguntas" }).count(), 0);
  await nav.close();
}

{
  // Con las dos: los dos botones.
  ponerle(true, true, true);
  const { nav, p } = await abrir();
  es("con «editar» aparece también «Editar preguntas»",
     (await p.getByRole("button", { name: "Editar preguntas" }).count()) > 0, true);
  await foto(p, "2-con-permiso");
  await nav.close();
}

// Dejar el rol como estaba.
if (ANTES === "") {
  sql(`delete from public.rol_permisos where rol_id = ${ROL} and modulo = 'formularios';`);
} else {
  const [v, c, e] = ANTES.split("|");
  ponerle(v, c, e);
}
limpiar();

es(
  "el rol quedó como estaba",
  sql(`
    select coalesce(ver::text,'-')||'|'||coalesce(crear::text,'-')||'|'||coalesce(editar::text,'-')
      from public.rol_permisos where rol_id = ${ROL} and modulo = 'formularios';
  `),
  ANTES,
);
es("y no quedaron formularios de prueba",
   sql("select count(*) from public.formularios where nombre like 'PRUEBA %';"), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
