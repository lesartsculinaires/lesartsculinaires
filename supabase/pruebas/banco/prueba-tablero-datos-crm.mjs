/**
 * Lo que el Tablero Comercial saca solo del CRM (9/11/2026).
 *
 *     node supabase/pruebas/banco/prueba-tablero-datos-crm.mjs
 *
 * Arma una semana con casos conocidos —la del 1 de junio de 2026, sin otros
 * movimientos en el banco— y comprueba que `tablero_crm_semanal`,
 * `tablero_crm_actividad` y `tablero_crm_ventas_persona` cuentan cada uno
 * donde corresponde:
 *
 *   L1  WhatsApp, llegó desde un anuncio de Meta, contestado a las 2 h
 *   L2  Feria, con un seguimiento anotado a las 30 h
 *   L3  Instagram sin anuncio, nadie lo contactó
 *   L4  vino de una base importada (no es lead nuevo) y se inscribió a un diplomado
 *   L5  referido viejo que compró un curso corto esta semana
 *   +   una visita realizada, una respuesta a un masivo y el mensaje del masivo
 *
 * Necesita el banco armado (`armar.sh`). No necesita la aplicación.
 */
import { execFileSync } from "node:child_process";

const JEFA = "cccccccc-0000-0000-0000-000000000003";
const ALE = "11111111-0000-0000-0000-000000000001";
const HURI = "44444444-0000-0000-0000-000000000004";

const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -F'|' -v ON_ERROR_STOP=1 -f -"], {
    input: q,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const LUNES = "2026-06-01";
const limpiar = () =>
  sql(`
    delete from public.envios where nombre = 'Prueba tablero CRM';
    delete from public.oportunidades where codigo like 'TABCRM-%';
    delete from public.conversaciones where identificador like 'tabcrm-%';
    delete from public.clientes where correo like 'tabcrm%@prueba.test';
    delete from public.importaciones where archivo = 'prueba-tablero-crm.xlsx';
  `);

limpiar();

const FICHA_ALE = sql(`select id from public.vendedores where usuario_id = '${ALE}'`);
const FICHA_HURI = sql(`select id from public.vendedores where usuario_id = '${HURI}'`);
const GANADO = sql(`select id from public.estados where nombre ilike 'ganad%' limit 1`);
const ACTIVO = sql(`select id from public.estados where nombre = 'Activo' limit 1`);
const DIPLOMADO = sql(`select id from public.productos where categoria = 'Diplomado' order by id limit 1`);
const CURSO = sql(`select id from public.productos where categoria = 'Curso corto' order by id limit 1`);
const canal = (n) => sql(`select id from public.canales where nombre = '${n}'`);
const VISITA = sql(`select id from public.tipos_evento where nombre ilike '%visita%' limit 1`);

sql(`
  insert into public.clientes (nombre, telefono, correo) values
    ('Tab Uno', '50379990001', 'tabcrm1@prueba.test'),
    ('Tab Dos', '50379990002', 'tabcrm2@prueba.test'),
    ('Tab Tres', '50379990003', 'tabcrm3@prueba.test'),
    ('Tab Cuatro', '50379990004', 'tabcrm4@prueba.test'),
    ('Tab Cinco', '50379990005', 'tabcrm5@prueba.test'),
    ('Tab Seis', '50379990006', 'tabcrm6@prueba.test');
  insert into public.importaciones (archivo, filas) values ('prueba-tablero-crm.xlsx', 1);
`);
const cli = (n) => sql(`select id from public.clientes where correo = 'tabcrm${n}@prueba.test'`);
const IMPORTACION = sql(`select id from public.importaciones where archivo = 'prueba-tablero-crm.xlsx'`);

sql(`
  insert into public.oportunidades (codigo, cliente_id, vendedor_id, producto_id, canal_id, estado_id, fecha_registro, fecha_cierre, venta_cerrada, importacion_id, created_at) values
    ('TABCRM-1', ${cli(1)}, ${FICHA_ALE}, ${DIPLOMADO}, ${canal("Whatsapp")}, ${ACTIVO}, '2026-06-02', null, null, null, '2026-06-02 10:00-06'),
    ('TABCRM-2', ${cli(2)}, ${FICHA_ALE}, ${DIPLOMADO}, ${canal("Feria")}, ${ACTIVO}, '2026-06-03', null, null, null, '2026-06-03 09:00-06'),
    ('TABCRM-3', ${cli(3)}, ${FICHA_HURI}, ${DIPLOMADO}, ${canal("Instagram")}, ${ACTIVO}, '2026-06-04', null, null, null, '2026-06-04 11:00-06'),
    ('TABCRM-4', ${cli(4)}, ${FICHA_ALE}, ${DIPLOMADO}, ${canal("Whatsapp")}, ${GANADO}, '2026-06-04', '2026-06-05', 1500, ${IMPORTACION}, '2026-06-04 08:00-06'),
    ('TABCRM-5', ${cli(5)}, ${FICHA_ALE}, ${CURSO}, ${canal("Referido")}, ${GANADO}, '2026-05-10', '2026-06-05', 200, null, '2026-05-10 08:00-06');

  -- L1 llegó por un anuncio y Ale le contestó a las 2 horas.
  insert into public.conversaciones (telefono, canal, cliente_id, identificador, origen)
  values ('50379990001', 'whatsapp', ${cli(1)}, 'tabcrm-1', '{"red": "anuncio"}');
  insert into public.mensajes (conversacion_id, direccion, tipo, texto, creado_en, enviado_por)
  select id, 'entrante', 'text', 'Hola, vi el anuncio', '2026-06-02 09:58-06', null from public.conversaciones where identificador = 'tabcrm-1';
  insert into public.mensajes (conversacion_id, direccion, tipo, texto, creado_en, enviado_por)
  select id, 'saliente', 'text', '¡Hola! Te cuento', '2026-06-02 12:00-06', '${ALE}' from public.conversaciones where identificador = 'tabcrm-1';

  -- L2: el seguimiento se anotó a las 30 horas.
  insert into public.oportunidad_notas (oportunidad_id, nota, origen, autor_id, created_at)
  select id, 'Lo llamé desde la feria', 'comentario', '${ALE}', '2026-06-04 15:00-06' from public.oportunidades where codigo = 'TABCRM-2';

  -- Una visita al campus de L1, agendada el lunes y hecha el miércoles.
  insert into public.eventos (oportunidad_id, tipo_id, vendedor_id, inicia_en, duracion_min, canal, estado, created_at)
  select id, ${VISITA}, ${FICHA_ALE}, '2026-06-03 10:00-06', 60, 'Presencial', 'Realizado', '2026-06-01 16:00-06'
    from public.oportunidades where codigo = 'TABCRM-1';

  -- Un masivo: la cliente 6 contestó el martes. El mensaje del masivo no es seguimiento de Ale.
  insert into public.envios (nombre, estado) values ('Prueba tablero CRM', 'terminado');
  insert into public.envio_destinatarios (envio_id, cliente_id, telefono, estado, wa_id, respondio_en)
  select e.id, ${cli(6)}, '50379990006', 'respondio', 'wamid.tabcrm6', '2026-06-02 18:00-06' from public.envios e where e.nombre = 'Prueba tablero CRM';
  insert into public.conversaciones (telefono, canal, cliente_id, identificador) values ('50379990006', 'whatsapp', ${cli(6)}, 'tabcrm-6');
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en, enviado_por)
  select id, 'wamid.tabcrm6', 'saliente', 'template', 'Masivo', '2026-06-02 08:00-06', '${ALE}' from public.conversaciones where identificador = 'tabcrm-6';
`);

/** Lo que devuelve una función del Tablero con la sesión de Dirección, como objeto. */
const comoJefa = (q) =>
  sql(`set role authenticated; set request.jwt.claims = '{"sub":"${JEFA}","role":"authenticated"}'; ${q};`)
    .split("\n")
    .filter(Boolean);

try {
  console.log("── la semana del 1 de junio ──");
  const semana = Object.fromEntries(
    comoJefa(`select campo, valor from public.tablero_crm_semanal('2026-06-01', '2026-06-07') where semana = '${LUNES}' order by campo`)
      .map((l) => l.split("|"))
      .map(([c, v]) => [c, Number(v)]),
  );
  es("L1 cuenta como pauta de Meta (vino de un anuncio)", semana["mk.leads_meta"], 1);
  es("L2 cuenta en Colegios y ferias", semana["mk.leads_colegios"], 1);
  es("L3 cuenta como orgánico", semana["mk.leads_organico"], 1);
  es("la respuesta al masivo cuenta como recontacto", semana["mk.leads_recontacto"], 1);
  es("el lead importado (L4) NO cuenta como lead nuevo", Object.entries(semana).filter(([c]) => c.startsWith("mk.leads_")).reduce((s, [, v]) => s + v, 0), 4);
  es("contactados: L1 y L2", semana["ventas.contactados"], 2);
  es("en menos de 24 h: sólo L1", semana["ventas.contactados_24h"], 1);
  es("una visita realizada", semana["ventas.citas"], 1);
  es("el inscrito de la base cuenta en recontacto", semana["ventas.inscritos_recontacto"], 1);
  es("un curso corto vendido", semana["ventas.cursos_cortos"], 1);
  es("referencia de lo cobrado en diplomados", semana["ventas.cobrado_nuevos"], 1500);
  es("referencia de cursos cortos", semana["ventas.cursos_cortos_monto"], 200);

  console.log("\n── la actividad de Ale ──");
  const ale = Object.fromEntries(
    comoJefa(`select campo, valor from public.tablero_crm_actividad('2026-06-01', '2026-06-07') where semana = '${LUNES}' and vendedor_id = ${FICHA_ALE}`)
      .map((l) => l.split("|"))
      .map(([c, v]) => [c, Number(v)]),
  );
  es("un mensaje de seguimiento (el del masivo no cuenta)", ale.mensajes, 1);
  es("una cita agendada", ale.citas_agendadas, 1);
  es("una cita realizada", ale.citas_realizadas, 1);
  es("dos ventas cerradas", ale.ventas_cerradas, 2);

  console.log("\n── ventas por persona en junio ──");
  const junio = Object.fromEntries(
    comoJefa(`select campo, valor from public.tablero_crm_ventas_persona('2026-06-01') where vendedor_id = ${FICHA_ALE}`)
      .map((l) => l.split("|"))
      .map(([c, v]) => [c, Number(v)]),
  );
  es("un diplomado y un curso corto", junio, { cursos_cortos: 1, diplomados: 1 });

  console.log("\n── sin permiso no se ve ──");
  let rechazado = false;
  try {
    sql(`set role authenticated; set request.jwt.claims = '{"sub":"${HURI}","role":"authenticated"}'; select count(*) from public.tablero_crm_semanal('2026-06-01', '2026-06-07');`);
  } catch {
    rechazado = true;
  }
  es("Huri (Tablero cerrado para su rol) no puede pedir los datos", rechazado, true);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
