/**
 * Editar un programa: ¿quién puede, y qué se mueve cuando se cambia?
 *
 *     node supabase/pruebas/banco/prueba-editar-programa.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Coloquen en el módulo de Programas un botón para editar cada programa —el
 *  nombre u otra opción—. Esa acción sólo la tendrían los administradores.
 *  Otra cosa: el Jefe de Ventas tiene seleccionados los permisos del módulo de
 *  programas pero no le aparece para poder crear o editar.»
 *
 * Son dos cosas y la segunda es la interesante, porque no era un botón que
 * faltaba: era una casilla que mentía. El catálogo lo protege la política
 * `productos_administrar` —de `20260827120000_catalogo_programas.sql`—, que
 * exige `es_admin()` y NO mira `rol_permisos`. Marcarle «crear» y «editar» a
 * Jefe de Ventas no habilitaba nada; el botón no aparecía y, si aparecía, la
 * base lo rechazaba igual.
 *
 * Por eso esta prueba empieza por ahí: le marca las casillas al Jefe de Ventas
 * y comprueba que NO puede, ni por la pantalla ni llamando a la base por su
 * cuenta. Y comprueba que la pantalla de permisos ya no ofrece esas casillas,
 * que es la única corrección honesta: un control que no manda, o manda, o no
 * está. Es la misma conclusión que quedó escrita en
 * `20260927120000_modulos_por_rol.sql` cuando pasó lo mismo con «ver».
 *
 * ============================================================================
 * Y LO QUE NO TIENE QUE PASAR AL RENOMBRAR
 * ============================================================================
 *
 * Renombrar un programa toca una fila, pero de esa fila cuelgan los leads, el
 * historial de cursos y los cortes del Dashboard. Ningún lead se puede mover ni
 * quedar sin programa. Es lo mismo que vigila `prueba-renombrar-programa.mjs`
 * para el renombre por SQL; acá se vigila el que hace una persona con el botón.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";

const correr = (q, tolerante = false) => {
  const ruta = path.join(os.tmpdir(), `prueba-editprog-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    if (!tolerante && /^psql:.*ERROR:/m.test(salida)) {
      console.error(`\nLa base rechazó una sentencia de la prueba:\n${salida}\n`);
      process.exit(1);
    }
    return salida;
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};
const sql = (q) => correr(q);

const subDe = (archivo) => {
  const cuerpo = fs.readFileSync(`${BANCO}/${archivo}`, "utf8").trim().split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt"); // Administrador
const ALE = subDe("jwt-ale.txt"); // a quien acá se le pone el rol Jefe de ventas

/**
 * Corre `q` como esa persona.
 *
 * `set role` y no `set local role`: en psql cada sentencia es su propia
 * transacción, y con `local` se perdería antes de la llamada dejándola correr
 * como superusuario —o sea, salteando justo lo que se prueba—.
 */
const como = (sub, q) =>
  correr(
    `set role authenticated;\n` +
      `set request.jwt.claims to '{"sub":"${sub}","role":"authenticated"}';\n${q}`,
    true,
  );

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// ---------------------------------------------------------------- preparar

const VIEJO = "PRUEBA Diplomado de Alfarería";
const NUEVO = "PRUEBA Diplomado Superior de Alfarería";
const VECINO = "PRUEBA Diplomado de Alfarería Avanzada"; // se le parece, a propósito
const CLIENTE = "Alfarero De Prueba";
const ROL_JEFE = sql(`select id from public.roles where nombre ilike 'Jefe de ventas' limit 1;`);
const ROL_ORIGINAL = sql(`select rol_id from public.usuarios where id = '${ALE}';`);

const limpiar = () => {
  sql(`
    delete from public.oportunidades where codigo like 'ALF-%';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre = '${CLIENTE}');
    delete from public.clientes where nombre = '${CLIENTE}';
    delete from public.productos where nombre like 'PRUEBA Diplomado%Alfarer%';
    update public.usuarios set rol_id = ${ROL_ORIGINAL || "null"} where id = '${ALE}';
  `);
};
limpiar();

sql(`
  insert into public.productos (nombre, categoria, precio, horario, activo)
  values ('${VIEJO}', 'Diplomado', 495, 'Sábados de 8:00 a 12:00', true),
         ('${VECINO}', 'Diplomado', 595, null, true);

  insert into public.clientes (nombre, telefono) values ('${CLIENTE}', '70880001');

  insert into public.oportunidades
    (codigo, cliente_id, vendedor_id, producto_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'ALF-0001', c.id,
         (select id from public.vendedores where activo order by id limit 1),
         (select id from public.productos where nombre = '${VIEJO}'),
         (select id from public.etapas order by orden limit 1),
         current_date, 495
    from public.clientes c where c.nombre = '${CLIENTE}';
`);

const idDelPrograma = sql(`select id from public.productos where nombre = '${VIEJO}';`);

/*
 * El caso de la escuela, montado tal cual: Ale pasa a ser Jefe de Ventas y se
 * le marcan las cuatro casillas de programas. Si el permiso sirviera para algo,
 * desde acá tendría que poder.
 */
sql(`
  update public.usuarios set rol_id = ${ROL_JEFE} where id = '${ALE}';
  insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
  values (${ROL_JEFE}, 'programas', true, true, true, true)
  on conflict (rol_id, modulo) do update
    set ver = true, crear = true, editar = true, eliminar = true;
`);

// --------------------------------------------------------------- navegador

const galletaDe = (archivo, sub, correo) => {
  const jwt = fs.readFileSync(`${BANCO}/${archivo}`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: sub, email: correo },
      }),
    ).toString("base64")
  );
};

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const abrir = async (archivo, sub, correo) => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galletaDe(archivo, sub, correo), domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  return { ctx, p };
};

const foto = (p, n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/editprog-${n}.png` });

const irAProgramas = async (p) => {
  await p.locator('aside button[data-mod="Programas"]').click();
  await p.waitForTimeout(1800);
};

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL JEFE DE VENTAS, CON LAS CASILLAS MARCADAS ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await abrir("jwt-ale.txt", ALE, "ale@lac.test");
  await irAProgramas(p);
  await foto(p, "1-jefe");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("ve el módulo —«ver» sí está marcado", texto.includes(VIEJO), true);
  es("pero NO le aparece «Crear nuevo programa»", texto.includes("Crear nuevo programa"), false);
  es(
    "NI UN BOTÓN DE EDITAR",
    await p.getByRole("button", { name: `Editar ${VIEJO}`, exact: true }).count(),
    0,
  );

  // Y no es sólo que el botón no esté: llamando a la base por su cuenta
  // tampoco. Es lo que hace que esconderlo no sea la única defensa.
  const salida = como(ALE, `update public.productos set nombre = 'COLADO' where id = ${idDelPrograma};`);
  es(
    "Y LA BASE TAMPOCO LO DEJA, CON CASILLA O SIN ELLA",
    sql(`select nombre from public.productos where id = ${idDelPrograma};`),
    VIEJO,
  );
  if (/ERROR/.test(salida)) console.log(`   (la base dijo: ${salida.split("\n").pop()})`);

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LA PANTALLA DE PERMISOS YA NO OFRECE ESAS CASILLAS ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await abrir("jwt-jefa.txt", JEFA, "jefa@lac.test");
  await p.locator('aside button[data-mod="Usuarios y Roles"]').click();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Roles y Permisos/ }).first().click();
  await p.waitForTimeout(1200);
  await foto(p, "2-permisos");

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es(
    "lo dice en la fila de Programas",
    /Crear, editar y eliminar: sólo dirección/.test(texto),
    true,
  );
  es(
    "y explica por qué, en vez de dejar un hueco",
    /Programas no tiene casillas de crear, editar ni eliminar/.test(texto),
    true,
  );
  es(
    "ya no hay interruptor de «crear» para Programas",
    await p.getByRole("switch", { name: "Programas crear" }).count(),
    0,
  );
  es(
    "PERO «VER» SIGUE VALIENDO: con eso se le esconde la pantalla a un rol",
    await p.getByRole("switch", { name: "Programas ver" }).count(),
    1,
  );

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. DIRECCIÓN SÍ: renombrar, y que no se mueva ningún lead ──");
// ══════════════════════════════════════════════════════════════════════════
const antesLeads = sql(
  "select coalesce(producto_id,0)||'x'||count(*) from public.oportunidades group by producto_id order by producto_id",
);

const { ctx, p } = await abrir("jwt-jefa.txt", JEFA, "jefa@lac.test");
await irAProgramas(p);

{
  const boton = p.getByRole("button", { name: `Editar ${VIEJO}`, exact: true });
  es("dirección sí tiene el botón", await boton.count(), 1);

  await boton.click();
  await p.waitForTimeout(700);
  await foto(p, "3-cuadro");

  const cuadro = p.getByRole("dialog");
  const texto = (await cuadro.evaluate((n) => n.innerText)).replace(/\s+/g, " ");
  es("el cuadro trae el horario cargado", /horario vigente/i.test(texto), true);
  es(
    "y avisa que dar de baja no borra nada",
    /No borra nada/.test(texto),
    true,
  );

  const campoNombre = cuadro.locator("input").first();
  es("y el nombre que tiene hoy", await campoNombre.inputValue(), VIEJO);
}

console.log("\n   · el nombre parecido se avisa antes de guardar");
{
  const cuadro = p.getByRole("dialog");
  // Sin el «de»: es como se cuelan los duplicados de verdad, y es el caso que
  // `programasParecidos` existe para atrapar.
  await cuadro.locator("input").first().fill(VECINO.replace("Diplomado de", "Diplomado"));
  await p.waitForTimeout(300);
  await cuadro.getByRole("button", { name: /Guardar cambios/ }).click();
  await p.waitForTimeout(1800);
  await foto(p, "4-parecidos");

  const texto = (await cuadro.evaluate((n) => n.innerText)).replace(/\s+/g, " ");
  es("dice cuál se le parece", texto.includes(VECINO), true);
  es(
    "y no guardó todavía",
    sql(`select nombre from public.productos where id = ${idDelPrograma};`),
    VIEJO,
  );
  es(
    "el botón pasa a pedir confirmación",
    await cuadro.getByRole("button", { name: /Guardarlo igual/ }).count(),
    1,
  );
}

console.log("\n   · el nombre repetido no se guarda ni forzando");
{
  const cuadro = p.getByRole("dialog");
  await cuadro.locator("input").first().fill(VECINO);
  await p.waitForTimeout(300);
  await cuadro.getByRole("button", { name: /Guardar/ }).click();
  await p.waitForTimeout(1800);

  const texto = (await cuadro.evaluate((n) => n.innerText)).replace(/\s+/g, " ");
  es("avisa que ese nombre ya está", /Ya existe/.test(texto), true);
  es(
    "Y NO LO PISÓ",
    sql(`select nombre from public.productos where id = ${idDelPrograma};`),
    VIEJO,
  );
}

console.log("\n   · el cambio de verdad");
{
  const cuadro = p.getByRole("dialog");
  await cuadro.locator("input").first().fill(NUEVO);
  await p.waitForTimeout(300);
  // Precio: el segundo campo de texto del cuadro.
  await cuadro.locator('input[inputmode="decimal"]').fill("750");
  await cuadro.locator("textarea").fill("Viernes de 18:00 a 21:00");
  await p.waitForTimeout(300);
  await cuadro.getByRole("button", { name: /Guardar/ }).click();
  await p.waitForTimeout(2600);
  await foto(p, "5-guardado");

  es(
    "el nombre quedó",
    sql(`select nombre from public.productos where id = ${idDelPrograma};`),
    NUEVO,
  );
  es(
    "el precio también",
    sql(`select precio::int from public.productos where id = ${idDelPrograma};`),
    "750",
  );
  es(
    "y el horario, que se edita en el mismo cuadro",
    sql(`select horario from public.productos where id = ${idDelPrograma};`),
    "Viernes de 18:00 a 21:00",
  );
  es(
    "NINGÚN LEAD SE MOVIÓ",
    sql("select coalesce(producto_id,0)||'x'||count(*) from public.oportunidades group by producto_id order by producto_id"),
    antesLeads,
  );
  es(
    "ninguno quedó sin programa",
    sql("select count(*) from public.oportunidades where producto_id is null and codigo like 'ALF-%';"),
    "0",
  );
  es(
    "y quedó anotado quién lo hizo",
    sql(`select count(*) from public.actividad
          where entidad = 'programa' and entidad_id = ${idDelPrograma} and accion = 'edito';`) !== "0",
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. DAR DE BAJA: sale de donde se elige, no de donde se usó ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await p.getByRole("button", { name: `Editar ${NUEVO}`, exact: true }).click();
  await p.waitForTimeout(700);

  const cuadro = p.getByRole("dialog");
  await cuadro.locator('input[type="checkbox"]').check();
  await p.waitForTimeout(200);
  await cuadro.getByRole("button", { name: /Guardar/ }).click();
  await p.waitForTimeout(2600);
  await foto(p, "6-de-baja");

  es(
    "quedó dado de baja en la base",
    sql(`select activo from public.productos where id = ${idDelPrograma};`),
    "f",
  );

  const texto = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("SIGUE EN EL CATÁLOGO, marcado", texto.includes("Dado de baja"), true);
  es("y con su nombre, para poder reactivarlo", texto.includes(NUEVO), true);
}

console.log("\n   · pero ya no se ofrece para un lead nuevo");
{
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1800);
  await p.getByRole("button", { name: /Nuevo cliente|\+ Nuevo/ }).first().click();
  await p.waitForTimeout(1500);
  await foto(p, "7-alta");

  const opciones = await p.evaluate(() =>
    [...document.querySelectorAll("select option")].map((o) => o.textContent ?? ""),
  );
  es("NO ESTÁ EN EL DESPLEGABLE DE PROGRAMA", opciones.includes(NUEVO), false);
  es("y el que sigue activo sí está", opciones.includes(VECINO), true);
}

console.log("\n   · y el lead que ya lo tenía lo sigue mostrando");
{
  // Es la razón de que se dé de baja en vez de borrarse: sacarlo de la ficha
  // dejaría un hueco donde hay un dato.
  es(
    "el lead conserva su programa",
    sql(`select p.nombre from public.oportunidades o
          join public.productos p on p.id = o.producto_id
         where o.codigo = 'ALF-0001';`),
    NUEVO,
  );
  es(
    "y la vista del pipeline lo sigue nombrando",
    sql(`select producto from public.vw_pipeline where codigo = 'ALF-0001';`),
    NUEVO,
  );
}

await ctx.close();
await nav.close();

// ---------------------------------------------------------------- limpiar

limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.productos where nombre like 'PRUEBA Diplomado%Alfarer%';`),
  "0",
);

console.log(
  f === 0
    ? "\nTodo bien: el catálogo lo cambia dirección, y la casilla que no mandaba ya no está."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f ? 1 : 0);
