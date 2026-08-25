/**
 * Fusionar dos fichas: ¿se pierde algo?
 *
 *     node supabase/pruebas/banco/prueba-fusion.mjs
 *
 * Unir contactos es la operación más destructiva del CRM: mueve leads de una
 * ficha a otra y después borra fichas. No se deshace con un botón. Lo que se
 * vigila acá es exactamente lo que no puede pasar:
 *
 *   1. QUE SE PIERDA UN LEAD. `oportunidades` borra en cascada, así que si el
 *      borrado corriera antes que la mudanza, los leads de la ficha absorbida
 *      se irían con ella y nadie se enteraría hasta que falte plata en un
 *      informe.
 *   2. QUE SE PIERDA LA FECHA DE ENTRADA. El sentido de todo esto es saber por
 *      dónde llegó primero la persona. Si al juntar los canales se pisara la
 *      primera fecha con la más nueva, se perdería justo el dato que se quería
 *      conservar.
 *   3. QUE SE PISE UN DATO BUENO. Completar llena huecos; nunca reemplaza algo
 *      que ya estaba, porque lo que está pudo corregirse a mano.
 *   4. Que se pueda fusionar una ficha consigo misma y quede vacía.
 *
 * Necesita el banco armado. No necesita la aplicación.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const TEL = "70956875";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-fusion-${process.pid}.sql`);
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

/*
 * La fusión pide ser dirección, y con razón. Para la prueba se corre como
 * administrador de verdad —el rol y el `sub` en los claims— en vez de aflojar
 * la función: probar una versión más permisiva que la de producción no prueba
 * nada.
 */
const JEFA = "cccccccc-0000-0000-0000-000000000003";
const comoJefa = (sentencia) =>
  sql(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${JEFA}","role":"authenticated"}';
    ${sentencia}
    commit;
  `);

// ------------------------------------------------------------------ montar

const limpiar = `
  delete from contactos_canal where cliente_id in (select id from clientes where nombre like 'FUSION %');
  delete from mensajes where conversacion_id in
    (select id from conversaciones where telefono in ('50399111111','50399222222'));
  delete from conversaciones where telefono in ('50399111111','50399222222');
  delete from oportunidades where cliente_id in (select id from clientes where nombre like 'FUSION %');
  delete from clientes where nombre like 'FUSION %';
`;
sql(limpiar);

sql(`
  -- La vieja: entró por Instagram, tiene correo, no tiene teléfono cargado.
  insert into clientes (nombre, correo) values ('FUSION vieja', 'katy@ejemplo.com');
  -- La nueva: entró por WhatsApp, tiene teléfono, no tiene correo.
  insert into clientes (nombre, telefono) values ('FUSION nueva', '${TEL}');

  insert into oportunidades (codigo, cliente_id, canal_id, fecha_registro)
  select 'FUS-1', id, 1, '2026-07-12' from clientes where nombre='FUSION vieja';
  insert into oportunidades (codigo, cliente_id, canal_id, fecha_registro)
  select 'FUS-2', id, 3, '2026-07-21' from clientes where nombre='FUSION nueva';

  insert into conversaciones (telefono, cliente_id, ultimo_mensaje_en)
  select '50399222222', id, now() from clientes where nombre='FUSION nueva';
`);

const idViejo = sql("select id from clientes where nombre='FUSION vieja';");
const idNuevo = sql("select id from clientes where nombre='FUSION nueva';");

// Los canales, con las fechas que tienen que sobrevivir.
sql(`
  select anotar_canal(${idViejo}, 1, 'katy.g',   '2026-07-12 14:30-06');
  select anotar_canal(${idNuevo}, 3, '${TEL}',   '2026-07-21 09:03-06');
  select anotar_canal(${idNuevo}, 3, '${TEL}',   '2026-07-25 16:10-06');
`);

console.log("── antes de fusionar ──");
es("son dos fichas", sql(`select count(*) from clientes where nombre like 'FUSION %';`), "2");
es("con un lead cada una", sql(`select count(*) from oportunidades where codigo in ('FUS-1','FUS-2');`), "2");

// ----------------------------------------------------------------- fusionar

console.log("\n── se conserva la vieja, que es la que tiene más historia ──");
{
  const salida = comoJefa(`select fusionar_contactos(${idViejo}, array[${idNuevo}]::bigint[]);`);
  console.log(`   (${salida.split("\n").filter(Boolean).pop()?.slice(0, 100)})`);
}

es("queda una sola ficha", sql(`select count(*) from clientes where nombre like 'FUSION %';`), "1");
es("y es la vieja", sql(`select nombre from clientes where nombre like 'FUSION %';`), "FUSION vieja");

console.log("\n── NO SE PERDIÓ NINGÚN LEAD ──");
es("los dos leads siguen existiendo", sql(`select count(*) from oportunidades where codigo in ('FUS-1','FUS-2');`), "2");
es(
  "y los dos apuntan a la ficha que quedó",
  sql(`select count(*) from oportunidades where codigo in ('FUS-1','FUS-2') and cliente_id=${idViejo};`),
  "2",
);
es(
  "la conversación también se mudó",
  sql(`select count(*) from conversaciones where telefono='50399222222' and cliente_id=${idViejo};`),
  "1",
);

console.log("\n── LOS DOS CANALES, CON SUS FECHAS ──");
{
  const filas = sql(`
    select ca.nombre || '|' ||
           to_char(cc.primera_vez at time zone 'America/El_Salvador','DD/MM HH24:MI') || '|' ||
           to_char(cc.ultima_vez  at time zone 'America/El_Salvador','DD/MM HH24:MI')
      from contactos_canal cc join canales ca on ca.id=cc.canal_id
     where cc.cliente_id=${idViejo} order by cc.primera_vez;
  `);
  console.log(filas.split("\n").map((l) => "   " + l).join("\n"));
  const lista = filas.split("\n").filter(Boolean);
  es("quedaron los dos canales", lista.length, 2);
  es("Instagram primero", lista[0].split("|")[0], "Instagram");
  es("ENTRÓ EL 12/07 A LAS 14:30, NO SE PISÓ", lista[0].split("|")[1], "12/07 14:30");
  es("Whatsapp después", lista[1].split("|")[0], "Whatsapp");
  es("con su primera vez el 21/07", lista[1].split("|")[1], "21/07 09:03");
  es("Y SU ÚLTIMA EL 25/07", lista[1].split("|")[2], "25/07 16:10");
}

console.log("\n── se completó sin pisar ──");
es("tomó el teléfono que le faltaba", sql(`select telefono from clientes where id=${idViejo};`), TEL);
es(
  "Y CONSERVÓ SU CORREO",
  sql(`select correo from clientes where id=${idViejo};`),
  "katy@ejemplo.com",
);

console.log("\n── lo que no tiene que poder ──");
{
  const salida = comoJefa(`select fusionar_contactos(${idViejo}, array[${idViejo}]::bigint[]);`);
  es("fusionar una ficha consigo misma no hace nada", /No había nada que fusionar/.test(salida), true);
  es("y la ficha sigue ahí", sql(`select count(*) from clientes where id=${idViejo};`), "1");
  es("con sus leads", sql(`select count(*) from oportunidades where cliente_id=${idViejo};`), "2");
}

sql(limpiar);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
