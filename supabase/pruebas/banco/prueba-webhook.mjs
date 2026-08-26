/**
 * ¿Un mensaje de WhatsApp llega hasta la base?
 *
 *     node supabase/pruebas/banco/prueba-webhook.mjs
 *
 * Manda al webhook una carga igual a la que manda Meta, firmada como Meta la
 * firma, y después mira la base. Es la única forma de probar este camino sin
 * un número real: acá no hay nadie con sesión abierta, escribe la llave de
 * servicio, y todo eso sólo se ejerce cuando entra un mensaje de verdad.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación levantada en 3142 con
 * `WHATSAPP_APP_SECRET=secreto-de-prueba` y la llave de `jwt-servicio.txt`.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const TEL = "50361234567";
const WAID = "wamid.PRUEBA" + Date.now();

/** Una carga igual a la que manda Meta cuando alguien escribe. */
const carga = {
  object: "whatsapp_business_account",
  entry: [{
    id: "222",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "50322334455", phone_number_id: "111" },
        contacts: [{ profile: { name: "María de Prueba" }, wa_id: TEL }],
        messages: [{
          from: TEL, id: WAID,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "Hola, quiero información del diplomado de pastelería" },
        }],
      },
    }],
  }],
};

const mandar = async (cuerpo, firmaMala = false) => {
  const crudo = JSON.stringify(cuerpo);
  const firma = crypto.createHmac("sha256", firmaMala ? "otro" : SECRETO).update(crudo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  return { estado: r.status, cuerpo: await r.text() };
};

console.log("── la firma se comprueba de verdad ──");
{
  const mala = await mandar(carga, true);
  es("una firma de otro remitente se rechaza", mala.estado, 401);
  es("y no guardó nada", sql(`select count(*) from mensajes where wa_id='${WAID}'`), "0");
}

console.log("\n── un mensaje bien firmado entra ──");
{
  const r = await mandar(carga);
  console.log(`   (${r.estado} · ${r.cuerpo})`);
  es("Meta recibe un 200", r.estado, 200);

  await new Promise((s) => setTimeout(s, 700));

  es("el mensaje quedó guardado", sql(`select count(*) from mensajes where wa_id='${WAID}'`), "1");
  es("con el texto entero",
     sql(`select texto from mensajes where wa_id='${WAID}'`),
     "Hola, quiero información del diplomado de pastelería");
  es("marcado como entrante", sql(`select direccion from mensajes where wa_id='${WAID}'`), "entrante");

  const conv = sql(`select id||'|'||telefono||'|'||coalesce(sin_leer::text,'?') from conversaciones where telefono='${TEL}'`);
  console.log(`   (conversación: ${conv})`);
  es("se abrió la conversación", conv.split("|")[1], TEL);
  es("y quedó marcada como no leída", conv.split("|")[2], "1");

  const cli = sql(`select nombre from clientes where telefono='${TEL}'`);
  console.log(`   (cliente creado: ${cli})`);
  es("EL LEAD SE CREÓ SOLO, CON EL NOMBRE DEL PERFIL", cli, "María de Prueba");
}

console.log("\n── Meta reintenta y no duplica ──");
{
  const r = await mandar(carga);
  await new Promise((s) => setTimeout(s, 700));
  es("contesta 200 igual", r.estado, 200);
  es("pero sigue habiendo uno solo", sql(`select count(*) from mensajes where wa_id='${WAID}'`), "1");
  es("y un solo cliente", sql(`select count(*) from clientes where telefono='${TEL}'`), "1");
}

console.log("\n── los acuses de entrega actualizan el mensaje ──");
{
  const acuse = {
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: "111" },
      statuses: [{ id: WAID, status: "delivered", timestamp: "1", recipient_id: TEL }],
    } }] }],
  };
  const r = await mandar(acuse);
  await new Promise((s) => setTimeout(s, 700));
  es("entra", r.estado, 200);
  es("y el mensaje quedó como entregado", sql(`select estado from mensajes where wa_id='${WAID}'`), "delivered");
}

console.log("\n── una carga rara no tumba el webhook ──");
{
  const r = await mandar({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: "no-es-una-lista" } }] }] });
  es("contesta 200 en vez de romper", r.estado, 200);
}

/*
 * ------------------------------------------------------------------------
 * LA RÁFAGA: TRES GLOBOS SEGUIDOS
 * ------------------------------------------------------------------------
 *
 * Quien escribe no manda una frase: manda «Hola», «buenas tardes» y «quiero
 * información» uno atrás del otro. Meta los entrega en llamadas separadas y
 * llegan pisándose. Es el caso que duplicaba leads en producción.
 *
 * ------------------------------------------------------------------------
 * QUÉ PRUEBA ESTO Y QUÉ NO
 * ------------------------------------------------------------------------
 *
 * PRUEBA que la ráfaga entera funciona de punta a punta: los tres mensajes se
 * guardan, la ficha es una, el lead es uno, y el hilo de la bandeja queda del
 * mismo asesor que el lead.
 *
 * NO prueba que el arreglo del duplicado sirva, y conviene saberlo. Se
 * comprobó: con el código viejo esta misma sección también pasa. En esta
 * máquina la base contesta en fracciones de milisegundo, así que las tres
 * llamadas terminan atendiéndose casi en fila y la ventana no llega a
 * abrirse. En producción cada viaje a Supabase son decenas de milisegundos y
 * ahí sí se pisan.
 *
 * La prueba que sí falla con el código viejo es
 * `prueba-lead-unico.mjs`, que ataca la base directamente y abre la ventana a
 * propósito. Es la que hay que mirar si esto se toca.
 */
console.log("\n── tres mensajes juntos, un solo lead ──");
{
  const RAFAGA = "50361234599";
  const globo = (texto, i) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "50322334455", phone_number_id: "111" },
      contacts: [{ profile: { name: "Alex Spencer" }, wa_id: RAFAGA }],
      messages: [{
        from: RAFAGA,
        id: `${WAID}-rafaga-${i}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: texto },
      }],
    } }] }],
  });

  const respuestas = await Promise.all([
    mandar(globo("Hola", 1)),
    mandar(globo("buenas tardes", 2)),
    mandar(globo("quiero información", 3)),
  ]);

  es("las tres entran", respuestas.map((r) => r.estado), [200, 200, 200]);

  await new Promise((s) => setTimeout(s, 1500));

  es("los tres mensajes se guardaron",
     sql(`select count(*) from mensajes where wa_id like '${WAID}-rafaga-%'`), "3");
  es("UNA sola ficha", sql(`select count(*) from clientes where telefono='${RAFAGA}'`), "1");
  es("UN solo lead",
     sql(`select count(*) from oportunidades o join clientes c on c.id=o.cliente_id where c.telefono='${RAFAGA}'`),
     "1");
  es("y una sola conversación",
     sql(`select count(*) from conversaciones where telefono='${RAFAGA}'`), "1");

  // El hilo de la bandeja y el lead tienen que ser del mismo asesor. Cuando se
  // duplicaba, cada lead salía sorteado aparte y el hilo se quedaba con el de
  // la llamada que ganó la carrera, que no era el del otro lead.
  es("el hilo y el lead son del mismo asesor",
     sql(`select (select vendedor_id from conversaciones where telefono='${RAFAGA}')
                 is not distinct from
                 (select o.vendedor_id from oportunidades o
                    join clientes c on c.id=o.cliente_id where c.telefono='${RAFAGA}')`),
     "t");

  sql(`delete from mensajes where wa_id like '${WAID}-rafaga-%'`);
  sql(`delete from conversaciones where telefono='${RAFAGA}'`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${RAFAGA}')`);
  sql(`delete from contactos_canal where cliente_id in (select id from clientes where telefono='${RAFAGA}')`);
  sql(`delete from clientes where telefono='${RAFAGA}'`);
}

sql(`delete from mensajes where wa_id='${WAID}'`);
sql(`delete from conversaciones where telefono='${TEL}'`);
sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
sql(`delete from contactos_canal where cliente_id in (select id from clientes where telefono='${TEL}')`);
sql(`delete from clientes where telefono='${TEL}'`);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
