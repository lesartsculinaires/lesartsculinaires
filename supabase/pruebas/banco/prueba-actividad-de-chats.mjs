/**
 * Lo que pasa en un chat y en una llamada, ¿queda en el registro?
 *
 *     node supabase/pruebas/banco/prueba-actividad-de-chats.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Poné en las notificaciones cualquier cambio que se haga, como cambio de
 *  asesor y todo, que se refleje en el ícono y en el módulo.»
 *
 * Averiguando resultó que el cambio de asesora YA quedaba —143 veces— porque
 * `vendedor_id` está entre los campos vigilados de `oportunidades`, y reasignar
 * desde la bandeja también reasigna las oportunidades abiertas del cliente.
 *
 * Lo que NO quedaba es todo lo que pasa en un hilo que no tiene lead, o cuyo
 * lead ya está cerrado: ahí no hay oportunidad que actualizar y la reasignación
 * desaparecía. Más archivar, las etiquetas del hilo y las llamadas, que nunca
 * tuvieron registro.
 *
 * Esta prueba ejerce justamente el caso que se perdía: un hilo SIN cliente.
 *
 * ============================================================================
 * Y LO QUE NO TIENE QUE QUEDAR
 * ============================================================================
 *
 * Un hilo nuevo y una llamada entrante no son decisiones de nadie. Anotarlas
 * sumaría cientos de entradas por semana que nadie puede accionar y taparían lo
 * que este cambio viene a hacer visible. Acá se comprueba que NO se anotan, que
 * es tan importante como lo otro.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `act-${process.pid}-${Math.random()}.sql`);
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

const marca = Date.now();
const TEL = `503${String(marca).slice(-8)}`;
const CALL = `wacid.ACT.${marca}`;

const limpiar = () => {
  sql(`
    delete from public.actividad where entidad in ('conversacion','llamada','etiqueta_chat')
      and entidad_id in (
        select id from public.conversaciones where telefono = '${TEL}'
        union all
        select id from public.llamadas where call_id = '${CALL}'
      );
    delete from public.llamadas where call_id = '${CALL}';
    delete from public.conversacion_etiquetas where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
  `);
};
limpiar();

/** Cuántas entradas de registro hay de este hilo, por acción. */
const registro = (entidad) =>
  sql(`
    select coalesce(string_agg(accion || ':' || coalesce(campos::text, '-'), ' | '
                               order by id), 'nada')
      from public.actividad
     where entidad = '${entidad}'
       and entidad_id in (
         select id from public.conversaciones where telefono = '${TEL}'
         union all select id from public.llamadas where call_id = '${CALL}'
       );
  `);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. UN HILO NUEVO NO ES UNA DECISIÓN: no se anota ──");
// ══════════════════════════════════════════════════════════════════════════
{
  // Sin cliente y sin lead: es exactamente el caso que se perdía.
  sql(`
    insert into public.conversaciones (canal, telefono, nombre_perfil, vendedor_id)
    values ('whatsapp', '${TEL}', 'PRUEBA ACTIVIDAD ${marca}', null);
  `);

  es("crear el hilo no dejó registro", registro("conversacion"), "nada");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. REASIGNAR SÍ, Y ES EL CASO QUE SE PERDÍA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`update public.conversaciones set vendedor_id = 901 where telefono = '${TEL}';`);

  const r = registro("conversacion");
  es("quedó una entrada de edición", /^edito:/.test(r), true);
  es("Y DICE A QUIÉN SE REASIGNÓ", /"vendedor_id".*"despues": 901/.test(r), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. ARCHIVAR TAMBIÉN ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`update public.conversaciones set archivada = true where telefono = '${TEL}';`);
  es("quedó anotado el archivado", /"archivada".*"despues": true/.test(registro("conversacion")), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. MARCAR LEÍDO NO: es ruido, no una decisión ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const antes = registro("conversacion");
  sql(`update public.conversaciones set sin_leer = 0, no_leida = false where telefono = '${TEL}';`);
  es("leer un hilo no agregó nada al registro", registro("conversacion"), antes);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. LAS LLAMADAS: quién atendió ──");
// ══════════════════════════════════════════════════════════════════════════
{
  sql(`
    insert into public.llamadas (call_id, conversacion_id, telefono, direccion, estado)
    select '${CALL}', c.id, '${TEL}', 'entrante', 'sonando'
      from public.conversaciones c where c.telefono = '${TEL}';
  `);
  es("una llamada entrando no se anota", registro("llamada"), "nada");

  sql(`update public.llamadas set estado = 'en_curso' where call_id = '${CALL}';`);
  es("PERO ATENDERLA SÍ", /"estado".*"despues": "en_curso"/.test(registro("llamada")), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. LAS ETIQUETAS DEL HILO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const hay = sql(`select count(*) from public.etiquetas;`);
  if (hay === "0") {
    console.log("  (no hay etiquetas en el banco; se saltea)");
  } else {
    sql(`
      insert into public.conversacion_etiquetas (conversacion_id, etiqueta_id)
      select c.id, (select id from public.etiquetas order by id limit 1)
        from public.conversaciones c where c.telefono = '${TEL}';
    `);
    es("poner una etiqueta queda anotado", /^creo:/.test(registro("etiqueta_chat")), true);
  }
}

limpiar();

console.log(
  f === 0
    ? "\nTodo bien: queda lo que alguien decidió, y no lo que simplemente pasó."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f === 0 ? 0 : 1);
