/**
 * ¿Quién puede hacer desaparecer un lead?
 *
 *     node supabase/pruebas/banco/prueba-borrar.mjs
 *
 * La regla es una sola: borrar es de dirección. Pero hay dos caminos para
 * llegar al mismo resultado y el segundo es el que estaba abierto:
 *
 *   · borrar el LEAD, que la política de `oportunidades` ya frenaba;
 *   · borrar el CONTACTO, que se lleva sus leads en cascada. Una cascada no
 *     pasa por RLS, así que la política de `oportunidades` no tenía nada que
 *     decir: una asesora no podía borrar un lead de $5.000, pero sí podía
 *     borrar a su dueño y llevárselo igual.
 *
 * Lo que también se comprueba es lo que NO tiene que romperse: crear, editar y
 * ver siguen siendo de todo el equipo. Cerrar un agujero apretando de más deja
 * a las asesoras sin poder corregir un teléfono, y eso se nota al otro día.
 *
 * ------------------------------------------------------------------------
 * OJO CON LOS USUARIOS DE PRUEBA
 * ------------------------------------------------------------------------
 *
 * Los `sub` tienen que existir en `auth.users`. Con uno inventado, el
 * disparador de auditoría falla al escribir en `actividad` —la clave foránea
 * del actor no encuentra a nadie— y el borrado se cae por eso. Da lo mismo
 * desde afuera: la fila sobrevive. Pero por el motivo equivocado, y una prueba
 * que pasa por el motivo equivocado no está probando nada.
 *
 * Necesita el banco armado. No necesita la aplicación.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-borrar-${process.pid}.sql`);
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

// Salen de la base, no escritos a mano: así la prueba no se apoya en un id
// que puede no existir, que es exactamente lo que la hizo mentir una vez.
const ASESORA = sql(`
  select u.id from auth.users u
    join public.usuarios pu on pu.id = u.id
    join public.roles r on r.id = pu.rol_id
   where r.es_admin = false limit 1;
`);
const DIRECCION = sql(`
  select u.id from auth.users u
    join public.usuarios pu on pu.id = u.id
    join public.roles r on r.id = pu.rol_id
   where r.es_admin = true limit 1;
`);

if (!ASESORA || !DIRECCION) {
  console.error("El banco no tiene una asesora y una dirección con cuenta. Armalo de nuevo.");
  process.exit(1);
}

const como = (quien, sentencia) =>
  sql(`
    set role authenticated;
    set request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';
    ${sentencia}
    reset role;
  `);

const montar = () =>
  sql(`
    delete from oportunidades where codigo='BORRA-1';
    delete from clientes where nombre='BORRAR prueba';
    insert into clientes (nombre, telefono) values ('BORRAR prueba','70933333');
    insert into oportunidades (codigo, cliente_id, fecha_registro, valor_oportunidad)
    select 'BORRA-1', id, '2026-07-12', 5000 from clientes where nombre='BORRAR prueba';
  `);

const hayLead = () => sql("select count(*) from oportunidades where codigo='BORRA-1';");
const hayContacto = () => sql("select count(*) from clientes where nombre='BORRAR prueba';");

console.log(`── la asesora (${ASESORA.slice(0, 8)}…) ──`);
{
  montar();
  const salida = como(ASESORA, "delete from oportunidades where codigo='BORRA-1';");
  es("no hay error de clave foránea del auditor", /actividad|foreign key/.test(salida), false);
  es("NO PUEDE BORRAR EL LEAD", hayLead(), "1");
}
{
  const salida = como(ASESORA, "delete from clientes where nombre='BORRAR prueba';");
  es("no hay error inesperado", /actividad|foreign key/.test(salida), false);
  es("NI POR LA PUERTA DE AL LADO: EL CONTACTO SIGUE", hayContacto(), "1");
  es("Y EL LEAD DE $5.000 TAMBIÉN", hayLead(), "1");
}

console.log("\n── pero sigue trabajando normal ──");
{
  como(ASESORA, "update clientes set telefono='7093-3333' where nombre='BORRAR prueba';");
  es("puede corregir un teléfono", sql("select telefono from clientes where nombre='BORRAR prueba';"), "7093-3333");

  como(ASESORA, `insert into clientes (nombre, telefono) values ('BORRAR nueva','70944444');`);
  es("puede dar de alta un contacto", sql("select count(*) from clientes where nombre='BORRAR nueva';"), "1");

  como(ASESORA, "update oportunidades set valor_oportunidad=6000 where codigo='BORRA-1';");
  es("y puede editar el lead", sql("select valor_oportunidad::int from oportunidades where codigo='BORRA-1';"), "6000");
}

console.log(`\n── dirección (${DIRECCION.slice(0, 8)}…) ──`);
{
  const salida = como(DIRECCION, "delete from oportunidades where codigo='BORRA-1';");
  es("no hay error inesperado", /actividad|foreign key/.test(salida), false);
  es("SÍ PUEDE BORRAR EL LEAD", hayLead(), "0");

  como(DIRECCION, "delete from clientes where nombre in ('BORRAR prueba','BORRAR nueva');");
  es("y el contacto", hayContacto(), "0");
}

sql(`
  delete from oportunidades where codigo='BORRA-1';
  delete from clientes where nombre in ('BORRAR prueba','BORRAR nueva');
`);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
