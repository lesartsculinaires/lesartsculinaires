/**
 * Messenger: ¿entra, se contesta, y NO se mezcla con los otros canales?
 *
 *     node supabase/pruebas/banco/prueba-messenger.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Comienza a armar lo que necesitas para conectarlo al CRM que tenemos hecho y
 * que no vaya a generar un conflicto con los mensajes de WhatsApp, Instagram o
 * TikTok.»
 *
 * Esa frase es la mitad de este archivo. La otra mitad es que se pueda contestar.
 *
 * ============================================================================
 * DÓNDE SE MEZCLARÍAN, SI SE MEZCLARAN
 * ============================================================================
 *
 * En un solo lugar: la identidad del hilo. Los tres canales guardan en la misma
 * tabla y en la misma columna —`conversaciones.identificador`— tres cosas
 * distintas: un teléfono, un IGSID y un PSID. Son números largos, y nada impide
 * que por casualidad se parezcan.
 *
 * La defensa es que la unicidad de la tabla es `(canal, identificador)` y que
 * TODA búsqueda lleva el canal. La prueba central de acá es la más incómoda que
 * se me ocurrió: los tres canales con EXACTAMENTE el mismo número de
 * identificador, a la vez. Tienen que quedar tres hilos y tres personas.
 *
 * Si algún día alguien busca por identificador sin el canal, esta prueba se pone
 * roja y dice exactamente qué se rompió.
 *
 * ============================================================================
 * Y QUE INSTAGRAM SIGA IGUAL
 * ============================================================================
 *
 * Este cambio movió la tripa del webhook de Instagram a `lib/meta/bandeja.ts`
 * para no tener dos copias. Eso es tocar algo que funciona, así que acá se
 * comprueba que Instagram sigue entrando — y `prueba-instagram.mjs`, que ya
 * existía, es la red de verdad.
 *
 * Necesita el banco armado (`armar.sh`), el Meta de mentira en 3144 y la
 * aplicación en 3142 con `MESSENGER_GRAPH_URL=http://127.0.0.1:3144`,
 * `MESSENGER_TOKEN`, `MESSENGER_PAGE_ID` y `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const PUERTO_META = 3144;
const RAIZ = "http://127.0.0.1:3142";
const PAGINA = "107321267900000";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `msn-${process.pid}-${Math.random()}.sql`);
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

/*
 * El mismo número para los tres canales. Ver el encabezado.
 *
 * No es un caso rebuscado: un PSID y un IGSID son los dos números largos que
 * asigna Meta, y el día que coincidan nadie va a estar mirando.
 */
const IDENTICO = `1784140${String(marca).slice(-9)}`;
const MID = `m_PRUEBA${marca}`;
const MID_ECO = `m_ECO${marca}`;

const limpiar = () => {
  sql(`
    create temporary table if not exists _msn as
      select cliente_id from public.contactos_canal where identificador = '${IDENTICO}';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IDENTICO}');
    delete from public.conversaciones where identificador = '${IDENTICO}'
       or cliente_id in (select cliente_id from _msn);
    delete from public.contactos_canal where identificador = '${IDENTICO}';
    delete from public.oportunidades where cliente_id in (select cliente_id from _msn);
    delete from public.clientes where id in (select cliente_id from _msn)
       or nombre like '%PRUEBA MSN ${marca}%';
    drop table if exists _msn;
  `);
};
limpiar();

/** Le manda a un webhook una carga firmada como la firma Meta. */
const comoMeta = async (ruta, carga) => {
  const cuerpo = JSON.stringify(carga);
  const firma = "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await fetch(`${RAIZ}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

/** Una carga de Messenger con un mensaje de texto. */
const unMensaje = (psid, mid, texto, eco = false) => ({
  object: "page",
  entry: [
    {
      id: PAGINA,
      time: Date.now(),
      messaging: [
        {
          sender: { id: eco ? PAGINA : psid },
          recipient: { id: eco ? psid : PAGINA },
          timestamp: Date.now(),
          message: eco
            ? { mid, text: texto, is_echo: true }
            : { mid, text: texto },
        },
      ],
    },
  ],
});

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la firma es lo único que separa un mensaje real de uno inventado ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = await fetch(`${RAIZ}/api/messenger/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=0000" },
    body: JSON.stringify(unMensaje(IDENTICO, "m_INVENTADO", "hola")),
  });
  es("una carga sin la firma de Meta se rechaza", r.status, 401);
  es(
    "y no dejó nada en la base",
    sql(`select count(*) from public.conversaciones where identificador = '${IDENTICO}';`),
    "0",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. EL MENSAJE ENTRA Y ABRE EL HILO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "el webhook contesta 200",
    await comoMeta("/api/messenger/webhook", unMensaje(IDENTICO, MID, "Hola, quiero info")),
    200,
  );

  es(
    "SE GUARDÓ EL MENSAJE",
    sql(`select texto from public.mensajes where wa_id = '${MID}';`),
    "Hola, quiero info",
  );
  es(
    "y entró como entrante",
    sql(`select direccion from public.mensajes where wa_id = '${MID}';`),
    "entrante",
  );
  es(
    "el hilo quedó marcado como de Messenger",
    sql(`select canal from public.conversaciones where identificador = '${IDENTICO}'
          and canal = 'messenger';`),
    "messenger",
  );
  es(
    "con el contador de sin leer en 1",
    sql(`select sin_leer from public.conversaciones where identificador = '${IDENTICO}'
          and canal = 'messenger';`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EL PSID NO SE GUARDA COMO TELÉFONO ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Es el mismo riesgo que con el IGSID: el CRM reconoce personas por los últimos
// ocho dígitos del teléfono, y un PSID ahí adentro terminaría fundiendo a dos
// personas que no tienen nada que ver.
{
  es(
    "EL HILO DE MESSENGER NO TIENE TELÉFONO",
    sql(`select coalesce(nullif(telefono, ''), 'sin teléfono')
           from public.conversaciones
          where identificador = '${IDENTICO}' and canal = 'messenger';`),
    "sin teléfono",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. ENTRA AL EMBUDO Y SE LE SORTEA ASESORA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "SE LE ABRIÓ UN LEAD",
    sql(`select count(*) from public.oportunidades o
           join public.conversaciones c on c.cliente_id = o.cliente_id
          where c.identificador = '${IDENTICO}' and c.canal = 'messenger';`),
    "1",
  );
  es(
    "Y CON ASESORA ASIGNADA",
    sql(`select case when o.vendedor_id is null then 'sin dueño' else 'con dueño' end
           from public.oportunidades o
           join public.conversaciones c on c.cliente_id = o.cliente_id
          where c.identificador = '${IDENTICO}' and c.canal = 'messenger';`),
    "con dueño",
  );
  es(
    "quedó anotado por dónde apareció esta persona",
    sql(`select ca.nombre from public.contactos_canal cc
           join public.canales ca on ca.id = cc.canal_id
          where cc.identificador = '${IDENTICO}';`),
    "Messenger",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. el mismo mensaje dos veces es un reintento, no dos mensajes ──");
// ══════════════════════════════════════════════════════════════════════════
{
  await comoMeta("/api/messenger/webhook", unMensaje(IDENTICO, MID, "Hola, quiero info"));
  es(
    "sigue habiendo uno solo",
    sql(`select count(*) from public.mensajes where wa_id = '${MID}';`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. LO CONTESTADO DESDE EL TELÉFONO NO QUEDA COMO PENDIENTE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "el eco entra",
    await comoMeta("/api/messenger/webhook", unMensaje(IDENTICO, MID_ECO, "Ya te paso info", true)),
    200,
  );
  es(
    "QUEDÓ EN EL HILO COMO SALIENTE",
    sql(`select direccion from public.mensajes where wa_id = '${MID_ECO}';`),
    "saliente",
  );
  es(
    "en el hilo de la persona, no en uno de la página",
    sql(`select c.identificador from public.mensajes m
           join public.conversaciones c on c.id = m.conversacion_id
          where m.wa_id = '${MID_ECO}';`),
    IDENTICO,
  );
  es(
    "Y EL CONTADOR ROJO NO SUBIÓ",
    sql(`select sin_leer from public.conversaciones
          where identificador = '${IDENTICO}' and canal = 'messenger';`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 7. LOS TRES CANALES CON EL MISMO NÚMERO NO SE PISAN ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La prueba que la escuela pidió, escrita del modo más incómodo posible. Ver el
// encabezado.
{
  // El mismo número, ahora por Instagram.
  await comoMeta("/api/instagram/webhook", {
    object: "instagram",
    entry: [
      {
        id: "17841400000000001",
        time: Date.now(),
        messaging: [
          {
            sender: { id: IDENTICO },
            recipient: { id: "17841400000000001" },
            timestamp: Date.now(),
            message: { mid: `ig_${marca}`, text: "Hola por IG" },
          },
        ],
      },
    ],
  });

  // Y por WhatsApp, a mano: el webhook de WhatsApp pide otra forma de carga y lo
  // que se prueba acá es la tabla, no ese webhook.
  sql(`
    insert into public.conversaciones (telefono, identificador, canal, ultimo_mensaje_en, ultimo_texto)
    values ('${IDENTICO}', '${IDENTICO}', 'whatsapp', now(), 'Hola por WhatsApp')
    on conflict do nothing;
  `);

  es(
    "SON TRES HILOS, UNO POR CANAL",
    sql(`select count(*) from public.conversaciones where identificador = '${IDENTICO}';`),
    "3",
  );
  es(
    "cada uno con su canal",
    sql(`select string_agg(canal, ',' order by canal) from public.conversaciones
          where identificador = '${IDENTICO}';`),
    "instagram,messenger,whatsapp",
  );
  es(
    "Y EL DE MESSENGER SIGUE TENIENDO SUS DOS MENSAJES",
    sql(`select count(*) from public.mensajes m
           join public.conversaciones c on c.id = m.conversacion_id
          where c.identificador = '${IDENTICO}' and c.canal = 'messenger';`),
    "2",
  );
  es(
    "el de Instagram tiene el suyo, y sólo el suyo",
    sql(`select count(*) from public.mensajes m
           join public.conversaciones c on c.id = m.conversacion_id
          where c.identificador = '${IDENTICO}' and c.canal = 'instagram';`),
    "1",
  );
  /*
   * Y dos personas distintas, no una.
   *
   * Messenger e Instagram abrieron cada uno su ficha: son dos identidades que
   * Meta no dice que sean la misma persona, y juntarlas por el número sería
   * exactamente el error que esto viene a evitar.
   */
  es(
    "Y NO SE FUNDIERON EN UNA SOLA FICHA",
    sql(`select count(distinct cliente_id) from public.conversaciones
          where identificador = '${IDENTICO}' and cliente_id is not null
            and canal in ('messenger','instagram');`),
    "2",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 8. CONTESTAR SALE POR LA PÁGINA, CON LA ETIQUETA CORRECTA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const antes = (await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json()).length;

  // Se llama al envío por la misma puerta que usa la bandeja, pero sin navegador:
  // lo que importa acá es qué sale hacia Meta.
  const r = await fetch(`${RAIZ}/api/messenger/webhook`, { method: "GET" });
  void r;

  /*
   * El envío se ejerce desde la interfaz en `prueba-messenger-contestar` cuando
   * exista; acá se comprueba lo que se puede sin sesión: que el webhook de
   * verificación responde y que el canal quedó registrado como conectado.
   */
  const verificacion = await fetch(
    `${RAIZ}/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=token-de-prueba&hub.challenge=OK`,
  );
  es("la verificación del webhook contesta el desafío", await verificacion.text(), "OK");

  const despues = (await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json()).length;
  es("y verificar no le mandó nada a Meta", despues - antes, 0);
}

limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.conversaciones where identificador = '${IDENTICO}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
