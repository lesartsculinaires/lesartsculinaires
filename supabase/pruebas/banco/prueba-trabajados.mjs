/**
 * ¿Qué cuenta como «lead trabajado» al borrar una base?
 *
 *     node supabase/pruebas/banco/prueba-trabajados.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * El cartel de borrar la base repetida de la escuela decía:
 *
 *     325 de esos leads ya se trabajaron.
 *
 * sobre 325 leads. Todos. Un aviso que se enciende siempre no avisa de nada:
 * se aprende a tildar la casilla sin leer, que es justo lo contrario de lo que
 * un freno así tiene que lograr.
 *
 * Salía de esto:
 *
 *     m.etapa_id is distinct from (select id from primera)   as avanzo
 *
 * Dos problemas, y los dos se prueban acá:
 *
 *   UN LEAD SIN ETAPA CONTABA    `is distinct from` con null da verdadero, así
 *                                que un lead al que nadie le puso etapa
 *                                figuraba como avanzado. Nadie lo avanzó:
 *                                nunca tuvo.
 *
 *   NO SE SABÍA POR QUÉ          «325 trabajados» puede ser 325 leads con
 *                                notas y dinero —gravísimo— o 325 que la
 *                                planilla cargó en una etapa que no es la
 *                                primera —que no es trabajo de nadie—. Son
 *                                decisiones opuestas y el número solo no las
 *                                distingue, así que ahora viene desglosado.
 *
 * Necesita el banco armado y las migraciones 20261010 y 20261013.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-trab-${process.pid}-${Math.random()}.sql`);
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

const ARCHIVO = "PRUEBA Trabajados.xlsx";
const limpiar = () =>
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select id from public.oportunidades where codigo like 'TRB-%');
    delete from public.oportunidades where codigo like 'TRB-%';
    delete from public.clientes where nombre like 'Trabajado %';
    delete from public.importaciones where archivo = '${ARCHIVO}';
  `);
limpiar();

/*
 * Cinco leads de la misma base, uno por cada caso:
 *
 *   SIN ETAPA        el que estaba mal contado. No lo trabajó nadie.
 *   PRIMERA ETAPA    recién cargado, tampoco.
 *   OTRA ETAPA       movido, y nada más. Cuenta, pero es el caso flojo.
 *   CON NOTA         alguien escribió algo. Cuenta de verdad.
 *   CON DINERO       hay una reserva anotada. Cuenta de verdad.
 */
sql(`
  insert into public.importaciones (archivo, filas) values ('${ARCHIVO}', 5);

  insert into public.clientes (nombre, telefono) values
    ('Trabajado Sinetapa',  '70440001'),
    ('Trabajado Primera',   '70440002'),
    ('Trabajado Movido',    '70440003'),
    ('Trabajado Connota',   '70440004'),
    ('Trabajado Condinero', '70440005');

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id, reserva)
  select 'TRB-0001', c.id, null, current_date,
         (select id from public.importaciones where archivo = '${ARCHIVO}'), null
    from public.clientes c where c.nombre = 'Trabajado Sinetapa';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id, reserva)
  select 'TRB-0002', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo = '${ARCHIVO}'), null
    from public.clientes c where c.nombre = 'Trabajado Primera';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id, reserva)
  select 'TRB-0003', c.id, (select id from public.etapas order by orden offset 1 limit 1), current_date,
         (select id from public.importaciones where archivo = '${ARCHIVO}'), null
    from public.clientes c where c.nombre = 'Trabajado Movido';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id, reserva)
  select 'TRB-0004', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo = '${ARCHIVO}'), null
    from public.clientes c where c.nombre = 'Trabajado Connota';

  insert into public.oportunidad_notas (oportunidad_id, nota)
  select id, 'Llamé y quedó de confirmar' from public.oportunidades where codigo = 'TRB-0004';

  insert into public.oportunidades (codigo, cliente_id, etapa_id, fecha_registro, importacion_id, reserva)
  select 'TRB-0005', c.id, (select id from public.etapas order by orden limit 1), current_date,
         (select id from public.importaciones where archivo = '${ARCHIVO}'), 50
    from public.clientes c where c.nombre = 'Trabajado Condinero';
`);

const revision = () =>
  sql(`
    select leads || '|' || trabajados || '|' || con_notas || '|' || con_dinero
             || '|' || con_cierre || '|' || con_etapa
      from public.revisar_base(
        (select id from public.importaciones where archivo = '${ARCHIVO}'));
  `).split("|");

const [leads, trabajados, conNotas, conDinero, conCierre, conEtapa] = revision();

console.log("── la cuenta, desglosada ──");
console.log(
  `   (leads ${leads} · trabajados ${trabajados} · notas ${conNotas} · ` +
    `dinero ${conDinero} · cierre ${conCierre} · sólo etapa ${conEtapa})`,
);
{
  es("son los cinco de la base", leads, "5");

  /*
   * Tres y no cuatro: el sin etapa quedó afuera, que es el arreglo. Antes
   * contaban el sin etapa, el movido, el de la nota y el del dinero.
   */
  es("TRABAJADOS: TRES, NO CUATRO", trabajados, "3");

  es("uno por su nota", conNotas, "1");
  es("uno por su dinero", conDinero, "1");
  es("ninguno cerrado", conCierre, "0");
  es("y uno SÓLO por la etapa", conEtapa, "1");

  // Lo que hace útil el desglose: el «sólo por etapa» es el que se puede
  // mirar con menos miedo, y tiene que quedar separado de los otros.
  es(
    "las partes explican el total",
    Number(conNotas) + Number(conDinero) + Number(conCierre) + Number(conEtapa),
    Number(trabajados),
  );
}

console.log("\n── el que no tiene etapa no aparece por ningún lado ──");
{
  // Es el caso que rompía la cuenta en la escuela: una carga de Excel sin
  // columna de etapa dejaba trescientos leads así.
  sql(`
    delete from public.oportunidad_notas where oportunidad_id in
      (select id from public.oportunidades where codigo like 'TRB-%');
    delete from public.oportunidades where codigo in ('TRB-0003','TRB-0004','TRB-0005');
  `);

  const [n, t] = revision();
  console.log(`   (quedan ${n}: el sin etapa y el de la primera)`);
  es("quedan dos", n, "2");
  es("Y NINGUNO CUENTA COMO TRABAJADO", t, "0");
}

console.log("\n── y sin nada trabajado, borra sin pedir permiso ──");
{
  const r = sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
    select ok || '|' || coalesce(motivo, 'sin motivo') || '|' || leads_borrados
      from public.borrar_base(
        (select id from public.importaciones where archivo = '${ARCHIVO}'), false);
  `).split("|");

  console.log(`   (${r.join(" · ")})`);
  es("SALE BIEN SIN FORZAR", r[0], "true");
  es("sin motivo que explicar", r[1], "sin motivo");
  es("y se llevó los dos leads", r[2], "2");
}

limpiar();
es("no quedó basura", sql(`select count(*) from public.importaciones where archivo = '${ARCHIVO}';`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
