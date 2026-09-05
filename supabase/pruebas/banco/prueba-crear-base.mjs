/**
 * «Crear base nueva» desde los clientes marcados.
 *
 *     node supabase/pruebas/banco/prueba-crear-base.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Quiero que cuando se seleccionen clientes en el módulo de Clientes aparezca
 * un botón que diga "Crear base nueva" para poder crear una nueva base desde
 * el CRM y que aparezca en el módulo de Base.»
 *
 * ============================================================================
 * QUÉ SE PRUEBA, Y POR QUÉ ESTO NO ALCANZA CON MIRARLO
 * ============================================================================
 *
 * El recorrido entero: marcar filas en Clientes, apretar el botón, ponerle
 * nombre, y encontrarla en Bases con sus leads adentro. Eso se podría mirar.
 *
 * Lo que NO se ve mirando es lo de abajo, y es lo que justifica el archivo:
 *
 *   EL LEAD SE MUEVE DE VERDAD    `oportunidad.importacion_id` tiene que
 *                                 quedar apuntando a la base nueva. Si no se
 *                                 escribiera, la base aparecería igual en la
 *                                 lista —vacía— y se vería casi bien.
 *
 *   Y SALE DE LA VIEJA            Un lead pertenece a UNA base. Meterlo en la
 *                                 nueva lo saca de aquélla, y la pantalla lo
 *                                 avisa con el número puesto antes de tocar
 *                                 nada. Acá se comprueba que el aviso diga la
 *                                 verdad: que el que estaba en la base vieja
 *                                 efectivamente ya no esté.
 *
 *   NO SE ARRASTRA A NADIE MÁS    Sólo los marcados. Un `update` sin filtro
 *                                 se vería idéntico en la pantalla de quien
 *                                 lo apretó y se llevaría media base.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `base-${process.pid}-${Math.random()}.sql`);
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

const NOMBRE = "Feria de agosto PRUEBA";
const VIEJA = "Planilla vieja PRUEBA";

const limpiar = () => {
  sql(`
    update public.oportunidades set importacion_id = null
     where codigo like 'BAS-%';
    delete from public.oportunidades where codigo like 'BAS-%';
    delete from public.clientes where nombre like '%Prueba Base%';
    delete from public.importaciones where archivo in ('${NOMBRE}', '${VIEJA}');
  `);
};
limpiar();

/*
 * Tres leads y una base vieja.
 *
 * El primero ya está en la base vieja: es el que prueba que el movimiento
 * ocurre y que el aviso no miente. El segundo no está en ninguna. El tercero
 * NO se va a marcar, y es el que demuestra que sólo se llevan los marcados.
 */
sql(`
  insert into public.importaciones (archivo, filas) values ('${VIEJA}', 1);

  insert into public.clientes (nombre, telefono) values
    ('Uno Prueba Base', '50370800001'),
    ('Dos Prueba Base', '50370800002'),
    ('Tres Prueba Base', '50370800003');

  insert into public.oportunidades
    (codigo, cliente_id, etapa_id, estado_id, fecha_registro, importacion_id)
  select 'BAS-0001', c.id,
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre = 'Activo'),
         current_date,
         (select id from public.importaciones where archivo = '${VIEJA}')
    from public.clientes c where c.nombre = 'Uno Prueba Base';

  insert into public.oportunidades
    (codigo, cliente_id, etapa_id, estado_id, fecha_registro)
  select 'BAS-0002', c.id,
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre = 'Activo'),
         current_date
    from public.clientes c where c.nombre = 'Dos Prueba Base';

  insert into public.oportunidades
    (codigo, cliente_id, etapa_id, estado_id, fecha_registro)
  select 'BAS-0003', c.id,
         (select id from public.etapas order by orden limit 1),
         (select id from public.estados where nombre = 'Activo'),
         current_date
    from public.clientes c where c.nombre = 'Tres Prueba Base';
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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/base-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(2200);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. sin nada marcado no hay botón ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La barra entera aparece con la selección. Comprobarlo es lo que da sentido
// al paso siguiente: que el botón salga porque se marcó, y no porque estaba.
es(
  "el botón no está antes de marcar",
  await p.getByRole("button", { name: "Crear base nueva" }).count(),
  0,
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. AL MARCAR, APARECE «CREAR BASE NUEVA» ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByPlaceholder(/Buscar/).first().fill("Prueba Base");
await p.waitForTimeout(1600);

for (const codigo of ["BAS-0001", "BAS-0002"]) {
  await p.locator(`main tbody tr:has-text("${codigo}") input[type=checkbox]`).first().check();
  await p.waitForTimeout(500);
}

es(
  "APARECIÓ EL BOTÓN",
  await p.getByRole("button", { name: "Crear base nueva" }).count(),
  1,
);
await foto("1-marcados");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. la ventana avisa lo que se va a mover ──");
// ══════════════════════════════════════════════════════════════════════════
await p.getByRole("button", { name: "Crear base nueva" }).first().click();
await p.waitForTimeout(1200);

{
  const t = (await p.locator('[role=dialog]').innerText()).replace(/\s+/g, " ");
  es("dice cuántos leads lleva", /2 leads marcados/.test(t), true);
  es(
    "Y AVISA QUE UNO SE MUEVE DE OTRA BASE",
    /1 de los marcados ya está en otra base/.test(t),
    true,
  );
  // `exact` para no chocar con «Crear base nueva», el de la barra de atrás.
  es(
    "el botón espera el nombre",
    await p.getByRole("button", { name: "Crear base", exact: true }).isDisabled(),
    true,
  );
}
await foto("2-ventana");

await p.getByPlaceholder(/Feria de agosto/).fill(NOMBRE);
await p.waitForTimeout(300);
await p.getByRole("button", { name: "Crear base", exact: true }).click();
await p.waitForTimeout(3500);
await foto("3-creada");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. LO QUE QUEDÓ EN LA BASE DE DATOS ──");
// ══════════════════════════════════════════════════════════════════════════
es(
  "se creó la base, con las dos filas contadas",
  sql(`select filas::text from public.importaciones where archivo = '${NOMBRE}';`),
  "2",
);
es(
  "LOS DOS MARCADOS QUEDARON ADENTRO",
  sql(`
    select count(*) from public.oportunidades o
    join public.importaciones i on i.id = o.importacion_id
    where i.archivo = '${NOMBRE}' and o.codigo in ('BAS-0001','BAS-0002');
  `),
  "2",
);
es(
  "Y EL QUE NO SE MARCÓ SIGUE SIN BASE",
  sql(`select coalesce(importacion_id::text, '(sin base)') from public.oportunidades where codigo = 'BAS-0003';`),
  "(sin base)",
);
es(
  "el que venía de la vieja SALIÓ de la vieja",
  sql(`
    select count(*) from public.oportunidades o
    join public.importaciones i on i.id = o.importacion_id
    where i.archivo = '${VIEJA}';
  `),
  "0",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. Y APARECE EN EL MÓDULO DE BASES ──");
// ══════════════════════════════════════════════════════════════════════════
await p.locator('aside button[data-mod="Bases"]').click();
await p.waitForTimeout(2800);

{
  const t = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  es("LA BASE NUEVA ESTÁ EN LA LISTA", t.includes(NOMBRE), true);
  es("y la vieja sigue estando, vacía", t.includes(VIEJA), true);
}
await foto("4-en-bases");

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.importaciones where archivo in ('${NOMBRE}','${VIEJA}');`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
