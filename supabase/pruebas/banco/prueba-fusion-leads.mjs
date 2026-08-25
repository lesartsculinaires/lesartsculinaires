/**
 * Unir dos leads que son el mismo: ¿se pierde algo?
 *
 *     node supabase/pruebas/banco/prueba-fusion-leads.mjs
 *
 * Es el caso de katy G: una sola persona, dos leads del mismo programa, uno
 * abierto por Instagram y otro por WhatsApp. Unirlos borra uno, y de una
 * oportunidad cuelgan siete tablas de las cuales seis borran en cascada. Lo
 * que se vigila:
 *
 *   1. QUE NO SE PIERDA LA BITÁCORA NI LOS COMPROBANTES. Notas, adjuntos,
 *      eventos, links de pago, recordatorios y seguimientos tienen que estar
 *      en el lead que queda. Si el borrado corriera antes que la mudanza se
 *      irían con el lead que se va, y nadie lo notaría hasta buscar un
 *      comprobante que ya no está.
 *   2. QUE SOBREVIVA EL CANAL DEL LEAD QUE SE VA. Es el motivo entero de todo
 *      esto: la persona sí llegó por los dos lados, y esa es la parte que hay
 *      que conservar cuando el lead desaparece.
 *   3. Que quede escrito qué se unió. Esto no se deshace con un botón.
 *   4. QUE NO UNA LEADS DE PERSONAS DISTINTAS. Un id mal tipeado movería el
 *      historial de un cliente al de otro, en silencio.
 *
 * Necesita el banco armado. No necesita la aplicación.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-fusion-leads-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
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

const JEFA = "cccccccc-0000-0000-0000-000000000003";
const comoJefa = (sentencia) =>
  sql(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${JEFA}","role":"authenticated"}';
    ${sentencia}
    commit;
  `);

const limpiar = `
  delete from oportunidad_notas where oportunidad_id in
    (select id from oportunidades where codigo in ('KTY-1','KTY-2','OTRA-1'));
  delete from contactos_canal where cliente_id in
    (select id from clientes where nombre in ('KATY prueba','OTRA prueba'));
  delete from oportunidades where codigo in ('KTY-1','KTY-2','OTRA-1');
  delete from clientes where nombre in ('KATY prueba','OTRA prueba');
`;
sql(limpiar);

// Katy: una ficha, dos leads del mismo programa, uno por cada canal.
sql(`
  insert into clientes (nombre, telefono) values ('KATY prueba','70956875');
  insert into clientes (nombre, telefono) values ('OTRA prueba','70956999');

  -- El viejo: entró por Instagram, está en Propuesta, tiene la historia.
  insert into oportunidades (codigo, cliente_id, canal_id, etapa_id, fecha_registro, valor_oportunidad)
  select 'KTY-1', c.id, 1, (select id from etapas order by orden limit 1), '2026-07-12', 500
    from clientes c where c.nombre='KATY prueba';

  -- El nuevo: entró por WhatsApp, está más avanzado, sin valor cargado.
  insert into oportunidades (codigo, cliente_id, canal_id, etapa_id, fecha_registro, reserva)
  select 'KTY-2', c.id, 3, (select id from etapas order by orden desc limit 1), '2026-07-21', 100
    from clientes c where c.nombre='KATY prueba';

  -- Y un lead de OTRA persona, para comprobar que no se deja unir.
  insert into oportunidades (codigo, cliente_id, canal_id, etapa_id, fecha_registro)
  select 'OTRA-1', c.id, 1, (select id from etapas order by orden limit 1), '2026-07-12'
    from clientes c where c.nombre='OTRA prueba';

  -- Historia en el que se va: una nota que no puede perderse.
  insert into oportunidad_notas (oportunidad_id, nota, origen)
  select id, 'Dijo que le interesa, la llamo el lunes', 'comentario'
    from oportunidades where codigo='KTY-1';
`);

const viejo = sql("select id from oportunidades where codigo='KTY-1';");
const nuevo = sql("select id from oportunidades where codigo='KTY-2';");
const otra = sql("select id from oportunidades where codigo='OTRA-1';");
const katy = sql("select id from clientes where nombre='KATY prueba';");

console.log("── antes ──");
es("dos leads", sql("select count(*) from oportunidades where codigo in ('KTY-1','KTY-2');"), "2");

// Se conserva el más avanzado, que es el que tiene el progreso real.
console.log("\n── se conserva el más avanzado (KTY-2) ──");
{
  const salida = comoJefa(`select fusionar_oportunidades(${nuevo}, array[${viejo}]::bigint[]);`);
  console.log(`   (${salida.split("\n").filter((l) => /Se unieron/.test(l))[0] ?? ""})`);
}

es("queda un solo lead", sql("select count(*) from oportunidades where codigo in ('KTY-1','KTY-2');"), "1");
es("y es KTY-2", sql("select codigo from oportunidades where codigo in ('KTY-1','KTY-2');"), "KTY-2");

console.log("\n── NO SE PERDIÓ LA HISTORIA ──");
es(
  "la nota del lead viejo está en el que quedó",
  sql(`select count(*) from oportunidad_notas where oportunidad_id=${nuevo}
        and nota like 'Dijo que le interesa%';`),
  "1",
);
es(
  "y quedó escrito qué se unió",
  sql(`select count(*) from oportunidad_notas where oportunidad_id=${nuevo}
        and origen='sistema' and nota like '%KTY-1%';`),
  "1",
);

console.log("\n── EL CANAL DEL QUE SE FUE SOBREVIVIÓ ──");
{
  const filas = sql(`
    select ca.nombre || '|' || to_char(cc.primera_vez at time zone 'America/El_Salvador','DD/MM')
      from contactos_canal cc join canales ca on ca.id=cc.canal_id
     where cc.cliente_id=${katy} order by cc.primera_vez;
  `);
  console.log(filas.split("\n").map((l) => "   " + l).join("\n"));
  const lista = filas.split("\n").filter(Boolean);
  es("están los dos canales", lista.length, 2);
  es("INSTAGRAM PRIMERO, QUE ES EL DEL LEAD BORRADO", lista[0].split("|")[0], "Instagram");
  es("con su fecha", lista[0].split("|")[1], "12/07");
}

console.log("\n── se completó sin pisar ──");
es("tomó el valor que le faltaba", sql(`select valor_oportunidad::int from oportunidades where id=${nuevo};`), "500");
es("Y CONSERVÓ SU RESERVA", sql(`select reserva::int from oportunidades where id=${nuevo};`), "100");
es(
  "y se quedó con la fecha más vieja",
  sql(`select fecha_registro from oportunidades where id=${nuevo};`),
  "2026-07-12",
);

console.log("\n── lo que NO tiene que poder ──");
{
  const salida = comoJefa(`select fusionar_oportunidades(${nuevo}, array[${otra}]::bigint[]);`);
  es("NO UNE LEADS DE PERSONAS DISTINTAS", /no son del mismo contacto/i.test(salida), true);
  es("y el de la otra sigue ahí", sql("select count(*) from oportunidades where codigo='OTRA-1';"), "1");
  es(
    "todavía apuntando a su dueña",
    sql(`select count(*) from oportunidades o join clientes c on c.id=o.cliente_id
          where o.codigo='OTRA-1' and c.nombre='OTRA prueba';`),
    "1",
  );
}
{
  const salida = comoJefa(`select fusionar_oportunidades(${nuevo}, array[${nuevo}]::bigint[]);`);
  es("unir un lead consigo mismo no hace nada", /No había nada que unir/.test(salida), true);
  es("y sigue existiendo", sql(`select count(*) from oportunidades where id=${nuevo};`), "1");
}

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
