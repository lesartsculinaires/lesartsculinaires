/**
 * Borrar una base repetida: ¿se lleva lo que tiene que llevarse, y sólo eso?
 *
 *     node supabase/pruebas/banco/prueba-borrar-base.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTA PRUEBA ES CASI TODA NEGATIVA
 * ------------------------------------------------------------------------
 *
 * Porque esto borra datos que no vuelven. Que la base repetida desaparezca es
 * la parte fácil; lo que decide si la función sirve o es un desastre es lo que
 * NO tiene que tocar:
 *
 *   LA BASE BUENA          y sus leads, que son los mismos nombres.
 *
 *   EL CONTACTO COMPARTIDO alguien que entró por la base repetida y después
 *                          escribió por WhatsApp tiene un lead que no es de
 *                          esta carga. Borrarlo se llevaría esa conversación.
 *
 *   LO TRABAJADO           un lead con notas, con dinero o que avanzó de etapa
 *                          frena la operación entera. Alguien invirtió tiempo
 *                          ahí y eso no se tira por limpiar un duplicado.
 *
 *   Y LO QUE NO ES SUYO    una asesora no puede borrar una base, aunque llame
 *                          a la función por su cuenta.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const correr = (q, tolerante = false) => {
  const ruta = path.join(os.tmpdir(), `prueba-borrar-${process.pid}-${Math.random()}.sql`);
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
/** Tolera el error: se usa para comprobar que un rechazo ocurre. */
const sqlCrudo = (q) => correr(q, true);

/**
 * Los ids de las dos personas del banco que hacen falta acá.
 *
 * `borrar_base` pregunta por el rol adentro, así que ni siquiera el superusuario
 * de Postgres puede llamarla: para la base, «postgres» no es dirección. Hay que
 * darle una sesión de verdad, y es lo correcto —si se pudiera desde psql sin
 * identidad, la comprobación no serviría de nada—.
 */
const subDe = (archivo) =>
  JSON.parse(
    Buffer.from(
      fs
        .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
        .trim()
        .split(".")[1],
      "base64url",
    ).toString(),
  ).sub;

const JEFA = subDe("jwt-jefa.txt"); // Administrador
const ALE = subDe("jwt-ale.txt");   // Ventas

/** Corre `q` como esa persona. `set role` y no `set local role`: en psql cada
 *  sentencia es su propia transacción y `local` se perdería antes de la
 *  llamada, dejándola correr como superusuario y salteando lo que se prueba. */
const como = (sub, q, tolerante = false) =>
  correr(
    `set role authenticated;\n` +
      `set request.jwt.claims to '{"sub":"${sub}","role":"authenticated"}';\n${q}`,
    tolerante,
  );

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

if (
  sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='borrar_base';`) !== "1"
) {
  console.error("Falta la función. Corré 20261010120000_borrar_base_duplicada.sql.");
  process.exit(1);
}

const ARCHIVO = "PRUEBA Repetida.xlsx";
const limpiar = () => {
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select id from public.oportunidades where codigo like 'BOR-%');
    delete from public.oportunidades where codigo like 'BOR-%';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where nombre like 'Borrar %');
    delete from public.clientes where nombre like 'Borrar %';
    delete from public.importaciones where archivo like 'PRUEBA %';
  `);
};
limpiar();

/*
 * El escenario, armado a mano para que cada pieza pruebe una cosa:
 *
 *   base 1 (la buena)     dos leads
 *   base 2 (la copia)     los mismos dos contactos otra vez, más uno que
 *                         además tiene un lead de otro lado
 */
sql(`
  insert into public.importaciones (archivo, filas, creado_en)
  values ('${ARCHIVO}', 2, now() - interval '2 minutes'),
         ('${ARCHIVO}', 3, now() - interval '1 minute');

  insert into public.clientes (nombre, telefono) values
    ('Borrar Uno', '70440001'),
    ('Borrar Dos', '70440002'),
    ('Borrar Compartido', '70440003'),
    ('Borrar Solo', '70440004');

  -- La base buena.
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0001', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en limit 1)
    from public.clientes c where c.nombre = 'Borrar Uno';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0002', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en limit 1)
    from public.clientes c where c.nombre = 'Borrar Dos';

  -- La copia: los mismos dos, más el compartido.
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0003', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Borrar Uno';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0004', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Borrar Dos';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0005', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Borrar Compartido';

  -- Éste existe únicamente por la copia: es el único que se tiene que borrar.
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id)
  select 'BOR-0007', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1)
    from public.clientes c where c.nombre = 'Borrar Solo';

  -- Y el compartido tiene además un lead que NO es de ninguna base: escribió
  -- por WhatsApp. Ese lead es el que lo salva de que lo borren.
  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro)
  select 'BOR-0006', c.id, (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre = 'Borrar Compartido';
`);

const COPIA = sql(`
  select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en desc limit 1;
`);
const BUENA = sql(`
  select id from public.importaciones where archivo='${ARCHIVO}' order by creado_en limit 1;
`);

console.log("── qué dice que se va a llevar, antes de tocar nada ──");
{
  const r = como(JEFA, `select leads || '|' || contactos || '|' || contactos_solo || '|' || trabajados
                   from public.revisar_base(${COPIA});`);
  const [leads, contactos, solos, trabajados] = r.split("|");

  es("cuatro leads", leads, "4");
  es("de cuatro contactos", contactos, "4");
  /*
   * Y acá está lo que salva la operación de ser un desastre: de los cuatro
   * contactos de la copia, se borra UNO.
   *
   * «Borrar Uno» y «Borrar Dos» tienen su lead de la base buena —son los
   * mismos nombres, por eso está repetida—, y el compartido tiene el suyo de
   * WhatsApp. Un borrado que se llevara «los contactos de la copia» habría
   * vaciado justamente la base que se quería conservar.
   */
  es("PERO SÓLO UNO SE QUEDARÍA SIN NADA", solos, "1");
  es("y ninguno está trabajado todavía", trabajados, "0");

  es(
    "y no borró nada: es de sólo lectura",
    sql(`select count(*) from public.oportunidades where codigo like 'BOR-%';`),
    "7",
  );
}

console.log("\n── una asesora no puede ──");
{
  /*
   * `set role` y no `set local role`: en psql cada sentencia es su propia
   * transacción, así que `local` se perdería antes de la llamada y el borrado
   * correría como superusuario, saltándose justo lo que se quiere probar.
   */
  const salida = como(ALE, `select ok from public.borrar_base(${COPIA});`, true);

  es("LA RECHAZA", /Sólo dirección puede borrar una base/.test(salida), true);
  es(
    "y no se llevó nada",
    sql(`select count(*) from public.oportunidades where codigo like 'BOR-%';`),
    "7",
  );
}

console.log("\n── un lead trabajado frena la operación ──");
{
  sql(`
    insert into public.oportunidad_notas (oportunidad_id, nota)
    select id, 'Llamé, le interesa.' from public.oportunidades where codigo = 'BOR-0003';
  `);

  const r = como(JEFA, `select ok || '|' || coalesce(motivo,'') from public.borrar_base(${COPIA});`);
  es("dice que no", r.split("|")[0], "false");
  es("y explica por qué", /ya se trabajaron/.test(r), true);
  es(
    "SIN BORRAR NADA",
    sql(`select count(*) from public.oportunidades where codigo like 'BOR-%';`),
    "7",
  );

  // Con `forzar` sí, que es lo que hace la casilla de la pantalla.
  const r2 = como(JEFA, `select ok from public.borrar_base(${COPIA}, true);`);
  es("pero forzando sí", r2, "t");
}

console.log("\n── QUÉ QUEDÓ ──");
{
  es(
    "la copia ya no está en la lista",
    sql(`select count(*) from public.importaciones where id = ${COPIA};`),
    "0",
  );
  es(
    "Y LA BUENA SIGUE",
    sql(`select count(*) from public.importaciones where id = ${BUENA};`),
    "1",
  );
  es(
    "con sus dos leads intactos",
    sql(`select count(*) from public.oportunidades where importacion_id = ${BUENA};`),
    "2",
  );
  es(
    "los cuatro leads de la copia se fueron",
    sql(`select count(*) from public.oportunidades where codigo in ('BOR-0003','BOR-0004','BOR-0005','BOR-0007');`),
    "0",
  );

  /*
   * Y acá lo que salva la operación de ser un desastre: los contactos que
   * también estaban en la base buena NO se borraron, porque les quedaba un
   * lead. Borrarlos habría vaciado la base que se quería conservar.
   */
  es(
    "«Borrar Uno» sigue, porque le queda su lead de la base buena",
    sql(`select count(*) from public.clientes where nombre = 'Borrar Uno';`),
    "1",
  );
  es("«Borrar Dos» también", sql(`select count(*) from public.clientes where nombre = 'Borrar Dos';`), "1");
  es(
    "Y EL COMPARTIDO TAMBIÉN, por su lead de WhatsApp",
    sql(`select count(*) from public.clientes where nombre = 'Borrar Compartido';`),
    "1",
  );
  es(
    "que sigue ahí",
    sql(`select count(*) from public.oportunidades where codigo = 'BOR-0006';`),
    "1",
  );
  es(
    "Y EL QUE SÓLO EXISTÍA POR LA COPIA, ESE SÍ SE FUE",
    sql(`select count(*) from public.clientes where nombre = 'Borrar Solo';`),
    "0",
  );
}

console.log("\n── una base que ya no existe ──");
{
  const r = como(JEFA, `select ok || '|' || coalesce(motivo,'') from public.borrar_base(${COPIA});`);
  es("no revienta", r.split("|")[0], "false");
  es("y lo dice en castellano", /ya no existe/.test(r), true);
}

console.log("\n── y una base sin nada adentro se borra igual ──");
{
  sql(`insert into public.importaciones (archivo, filas) values ('PRUEBA Vacia.xlsx', 0);`);
  const id = sql(`select id from public.importaciones where archivo = 'PRUEBA Vacia.xlsx';`);
  es("sale bien", como(JEFA, `select ok from public.borrar_base(${id});`), "t");
  es(
    "y ya no está",
    sql(`select count(*) from public.importaciones where archivo = 'PRUEBA Vacia.xlsx';`),
    "0",
  );
}

limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.clientes where nombre like 'Borrar %';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
