/**
 * La cita que alguien agenda desde Messenger entra en la agenda del CRM.
 *
 *     node supabase/pruebas/banco/prueba-cita-de-messenger.mjs
 *
 * ============================================================================
 * LO QUE SE VIENE A ARREGLAR
 * ============================================================================
 *
 * Meta manda las citas por el mismo webhook que los mensajes, como un adjunto
 * `appointment_booking`. Llegaban desde siempre y se perdían: el lector de
 * adjuntos se iba con `null` cuando no había `url` —y una cita no trae—, así
 * que el mensaje quedaba con tipo «text» y el texto vacío. El 1 de octubre de
 * 2026 alguien pidió cita para las 3:30 de la tarde y en el CRM no se vio nada.
 *
 * ============================================================================
 * LAS TRES COSAS QUE SE VIGILAN
 * ============================================================================
 *
 *   QUE ENTRE          Un mensaje con su tarjeta en el hilo, y una fila en la
 *                      agenda, Pendiente y sin dueño. Sin dueño a propósito:
 *                      esta cita no la agendó nadie del equipo, y ponerle el
 *                      dueño del lead diría que esa persona ya sabe que la
 *                      tiene.
 *
 *   QUE NO SE          Pedir, confirmar y cancelar son TRES mensajes de LA
 *   DUPLIQUE           MISMA reserva. Si cada uno insertara, el calendario
 *                      tendría tres citas el mismo día a la misma hora y la
 *                      cancelación sería la que menos se nota.
 *
 *   QUE NO LE SAQUE    Y si alguien ya tomó la cita, una confirmación que llega
 *   LA CITA A NADIE    después no se la puede sacar de encima.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const RAIZ = "http://127.0.0.1:3142";
const PAGINA = "107321267900000";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `cita-${process.pid}-${Math.random()}.sql`);
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
const PSID = `9988${String(marca).slice(-10)}`;
const RESERVA = `bk${marca}`;

/*
 * Las horas, en segundos Unix, como las manda Meta.
 *
 * Se eligen a futuro para que la cita caiga adelante en el calendario, que es
 * donde alguien la va a mirar.
 */
const INICIA = Math.floor(Date.now() / 1000) + 3 * 24 * 3600;
const TERMINA = INICIA + 1800;
const MOVIDA = INICIA + 3600;

const limpiar = () => {
  sql(`
    create temporary table if not exists _c as
      select cliente_id from public.contactos_canal where identificador = '${PSID}';
    delete from public.eventos where meta_booking_id like 'bk%'
       or oportunidad_id in (select id from public.oportunidades
                             where cliente_id in (select cliente_id from _c));
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${PSID}');
    delete from public.conversaciones where identificador = '${PSID}'
       or cliente_id in (select cliente_id from _c);
    delete from public.contactos_canal where identificador = '${PSID}';
    delete from public.oportunidades where cliente_id in (select cliente_id from _c);
    delete from public.clientes where id in (select cliente_id from _c);
    drop table if exists _c;
  `);
};
limpiar();

/** Le manda al webhook una carga firmada como la firma Meta. */
const comoMeta = async (carga) => {
  const cuerpo = JSON.stringify(carga);
  const firma = "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await fetch(`${RAIZ}/api/messenger/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

/** Una carga de Messenger con una cita adentro, tal como la manda Meta. */
const unaCita = (mid, estado, inicia, termina) => ({
  object: "page",
  entry: [
    {
      id: PAGINA,
      time: Date.now(),
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGINA },
          timestamp: Date.now(),
          message: {
            mid,
            attachments: [
              {
                type: "appointment_booking",
                payload: {
                  status: estado,
                  booking_id: RESERVA,
                  start_time: inicia,
                  end_time: termina,
                  timezone: "America/El_Salvador",
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

const laAgenda = () =>
  sql(
    `select coalesce(count(*),0) from public.eventos where meta_booking_id = '${RESERVA}'`,
  ).trim();

const elEvento = (columna) =>
  sql(
    `select coalesce(${columna}::text, 'NULO') from public.eventos where meta_booking_id = '${RESERVA}'`,
  ).trim();

console.log("── 1. LA CITA ENTRA, Y ENTRA EN LA AGENDA ──");
{
  const estado = await comoMeta(unaCita(`m_pide${marca}`, "requested", INICIA, TERMINA));
  es("el webhook contesta 200", estado, 200);
  await new Promise((r) => setTimeout(r, 1500));

  const tipo = sql(
    `select tipo from public.mensajes where wa_id = 'm_pide${marca}'`,
  ).trim();
  const texto = sql(
    `select coalesce(texto,'NULO') from public.mensajes where wa_id = 'm_pide${marca}'`,
  ).trim();

  es("el mensaje se guardó como cita, no como texto vacío", tipo, "cita");
  es("Y CON SU LÍNEA ESCRITA", /^Cita solicitada: /.test(texto), true);

  es("HAY UNA FILA EN LA AGENDA", laAgenda(), "1");
  es("del tipo nuevo", elEvento("tipo_id"), "7");
  es("por Messenger", elEvento("canal"), "Messenger");
  es("pendiente", elEvento("estado"), "Pendiente");
  es("Y SIN DUEÑO, QUE ES EL PUNTO", elEvento("vendedor_id"), "NULO");
  es("media hora", elEvento("duracion_min"), "30");

  /*
   * Y a la hora de verdad. Comparar contra el segundo exacto que mandó Meta es
   * lo único que distingue «entró» de «entró bien»: una cita tres horas corrida
   * se ve igual de bien en el calendario hasta que alguien llega tarde.
   */
  const cuando = sql(
    `select extract(epoch from inicia_en)::bigint from public.eventos where meta_booking_id = '${RESERVA}'`,
  ).trim();
  es("A LA HORA QUE MANDÓ META, AL SEGUNDO", cuando, String(INICIA));
}

console.log("\n── 2. CONFIRMARLA LA MUEVE, NO LA DUPLICA ──");
{
  await comoMeta(unaCita(`m_ok${marca}`, "confirmed", MOVIDA, MOVIDA + 1800));
  await new Promise((r) => setTimeout(r, 1500));

  es("SIGUE HABIENDO UNA SOLA", laAgenda(), "1");

  const cuando = sql(
    `select extract(epoch from inicia_en)::bigint from public.eventos where meta_booking_id = '${RESERVA}'`,
  ).trim();
  es("y se movió a la hora nueva", cuando, String(MOVIDA));

  // Y el hilo guarda los dos mensajes: la reserva es una, su historia no.
  const cuantos = sql(
    `select count(*) from public.mensajes where tipo = 'cita' and conversacion_id in
       (select id from public.conversaciones where identificador = '${PSID}')`,
  ).trim();
  es("en el hilo quedan los dos avisos", cuantos, "2");
}

console.log("\n── 3. SI ALGUIEN YA LA TOMÓ, NO SE LA SACAMOS ──");
{
  /*
   * Alguien del equipo agarra la cita desde el CRM. Después llega otro aviso de
   * Meta. El dueño tiene que sobrevivir: si no, la cita se le cae de la agenda
   * a quien se había comprometido a atenderla, y nadie se entera.
   */
  const vendedor = sql(`select id from public.vendedores where activo order by id limit 1`).trim();
  sql(`update public.eventos set vendedor_id = ${vendedor} where meta_booking_id = '${RESERVA}'`);

  await comoMeta(unaCita(`m_ok2${marca}`, "confirmed", MOVIDA, MOVIDA + 1800));
  await new Promise((r) => setTimeout(r, 1500));

  es("EL DUEÑO SIGUE SIENDO EL MISMO", elEvento("vendedor_id"), vendedor);
}

console.log("\n── 4. Y CANCELARLA LA DEJA CANCELADA, NO LA BORRA ──");
{
  await comoMeta(unaCita(`m_no${marca}`, "canceled", MOVIDA, MOVIDA + 1800));
  await new Promise((r) => setTimeout(r, 1500));

  /*
   * No se borra: que hubo una cita y se cayó es justo lo que conviene saber de
   * un lead. Borrar la fila dejaría el hueco sin explicación.
   */
  es("la fila sigue estando", laAgenda(), "1");
  es("CANCELADA", elEvento("estado"), "Cancelado");

  const texto = sql(
    `select coalesce(texto,'NULO') from public.mensajes where wa_id = 'm_no${marca}'`,
  ).trim();
  es("y el hilo lo dice", /^Cita cancelada: /.test(texto), true);
}

limpiar();
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
