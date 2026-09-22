/**
 * El canal lo dice la CARGA, no la URL por la que entró.
 *
 *     node supabase/pruebas/banco/prueba-webhook-cruzado.mjs
 *
 * ============================================================================
 * EL ERROR QUE ESTA PRUEBA EXISTE PARA QUE NO VUELVA
 * ============================================================================
 *
 * El 22 de septiembre de 2026 la escuela avisó que los hilos de Instagram y
 * Messenger entraban titulados con un número en vez del nombre. La causa no era
 * la que parecía. Preguntándole a Meta cómo estaba configurada la aplicación:
 *
 *     GET /{app-id}/subscriptions
 *     → object: "instagram"  callback_url: …/api/instagram/webhook
 *       object: "page"       callback_url: …/api/instagram/webhook
 *
 * Las dos suscripciones apuntaban a la MISMA dirección. Y como el lector de
 * cargas no mira el campo `object` —Meta manda la misma forma para los dos—,
 * todo lo que llegaba de Messenger se guardaba como Instagram: `canal:
 * "instagram"`, ficha resuelta por `cliente_de_instagram`, y el nombre buscado
 * en el Graph de Instagram con un PSID de Facebook. Eso último no puede
 * funcionar nunca, y de ahí los números.
 *
 * Lo grave no es el nombre: es que dos canales se mezclaron en la misma tabla,
 * que es exactamente lo que la escuela pidió que no pasara.
 *
 * Se podía arreglar en Meta, cambiando la suscripción. No alcanza: el día que
 * alguien reconfigure el webhook desde el panel vuelve a pasar y nada avisa. Se
 * arregló del lado que no depende de la configuración —`meta/canales.ts`— y esta
 * prueba es la que lo sostiene.
 *
 * ============================================================================
 * LA SEGUNDA MITAD: EL NOMBRE DE MESSENGER
 * ============================================================================
 *
 * Aun con el canal bien, el nombre de Messenger seguía sin poder leerse. El
 * camino documentado —`GET /{psid}?fields=name`— devuelve, para alguien que le
 * está escribiendo a la Página en ese momento:
 *
 *     (#100, subcódigo 33) Object with ID '…' does not exist, cannot be loaded
 *     due to missing permissions, or does not support this operation
 *
 * Y por la conversación sí se lee. Acá se comprueba que cuando la consulta por
 * persona falla, el CRM pregunta por el hilo y el nombre aparece igual.
 *
 * Necesita el banco armado (`armar.sh`), el Meta de mentira en 3144 y la
 * aplicación en 3142 con `INSTAGRAM_GRAPH_URL=http://127.0.0.1:3144`,
 * `MESSENGER_GRAPH_URL=http://127.0.0.1:3144`, `INSTAGRAM_TOKEN`,
 * `INSTAGRAM_ACCOUNT_ID`, `MESSENGER_TOKEN`, `MESSENGER_PAGE_ID` y
 * `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const META = "http://127.0.0.1:3144";
const RAIZ = "http://127.0.0.1:3142";
const PAGINA = "107321267900000";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `cruz-${process.pid}-${Math.random()}.sql`);
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
 * Dos personas distintas, con sufijo conocido para que el Meta de mentira sepa
 * qué nombre devolver. `…0001` es Ana Beltrán y `…0002` es Rosa Mejía.
 */
const PSID = `9${String(marca).slice(-12)}0001`;
const IGSID = `8${String(marca).slice(-12)}0002`;

const limpiar = () => {
  sql(`
    create temporary table if not exists _cruz as
      select cliente_id from public.contactos_canal
       where identificador in ('${PSID}', '${IGSID}');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador in ('${PSID}', '${IGSID}'));
    delete from public.conversaciones where identificador in ('${PSID}', '${IGSID}')
       or cliente_id in (select cliente_id from _cruz);
    delete from public.contactos_canal where identificador in ('${PSID}', '${IGSID}');
    delete from public.oportunidades where cliente_id in (select cliente_id from _cruz);
    delete from public.clientes where id in (select cliente_id from _cruz);
    drop table if exists _cruz;
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

/** Una carga de Meta con un mensaje de texto. `objeto` es lo que se prueba. */
const unMensaje = (objeto, quien, mid, texto) => ({
  object: objeto,
  entry: [
    {
      id: PAGINA,
      time: Date.now(),
      messaging: [
        {
          sender: { id: quien },
          recipient: { id: PAGINA },
          timestamp: Date.now(),
          message: { mid, text: texto },
        },
      ],
    },
  ],
});

/*
 * La consulta por PERSONA apagada, la de la CONVERSACIÓN encendida.
 *
 * Es el estado real de Messenger hoy, medido, y es lo que obliga al segundo
 * camino. Si se encendiera la primera, el nombre aparecería por la puerta fácil
 * y esta prueba dejaría de probar lo que dice probar.
 */
await fetch(`${META}/__perfiles`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ permite: false, hilos: true }),
});

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. MESSENGER ENTRANDO POR LA PUERTA DE INSTAGRAM ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const mid = `m_PAGE${marca}`;
  es(
    "el webhook de Instagram acepta una carga de Messenger",
    await comoMeta("/api/instagram/webhook", unMensaje("page", PSID, mid, "Hola, quiero info")),
    200,
  );

  es(
    "el mensaje se guardó",
    sql(`select texto from public.mensajes where wa_id = '${mid}';`),
    "Hola, quiero info",
  );

  es(
    "Y EL HILO QUEDÓ COMO MESSENGER, no como Instagram",
    sql(`select canal from public.conversaciones where identificador = '${PSID}';`),
    "messenger",
  );

  es(
    "hay UN solo hilo para esa persona",
    sql(`select count(*) from public.conversaciones where identificador = '${PSID}';`),
    "1",
  );

  es(
    "la ficha se enlazó por el canal Messenger",
    sql(`select c.nombre from public.contactos_canal cc
           join public.canales c on c.id = cc.canal_id
          where cc.identificador = '${PSID}';`),
    "Messenger",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. EL NOMBRE, AUNQUE LA CONSULTA POR PERSONA ESTÉ NEGADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "el hilo se tituló con el nombre y no con el PSID",
    sql(`select nombre_perfil from public.conversaciones where identificador = '${PSID}';`),
    "Ana Beltrán",
  );

  es(
    "y la ficha del cliente también",
    sql(`select cl.nombre from public.clientes cl
           join public.contactos_canal cc on cc.cliente_id = cl.id
          where cc.identificador = '${PSID}';`),
    "Ana Beltrán",
  );

  es(
    "NO se le inventó una arroba: en Facebook no hay @usuario",
    sql(`select coalesce(usuario, 'NULO') from public.conversaciones
          where identificador = '${PSID}';`),
    "NULO",
  );

  const pedidos = await (await fetch(`${META}/__perfiles-pedidos`)).json();
  es(
    "se intentó primero por persona",
    pedidos.some((u) => u.includes(`/${PSID}?fields=`)),
    true,
  );
  es(
    "y al fallar se preguntó por la conversación",
    pedidos.some((u) => u.includes("/conversations?") && u.includes(`user_id=${PSID}`)),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. INSTAGRAM ENTRANDO POR LA PUERTA DE MESSENGER ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const mid = `m_IG${marca}`;
  es(
    "el webhook de Messenger acepta una carga de Instagram",
    await comoMeta("/api/messenger/webhook", unMensaje("instagram", IGSID, mid, "Buenas")),
    200,
  );

  es(
    "EL HILO QUEDÓ COMO INSTAGRAM",
    sql(`select canal from public.conversaciones where identificador = '${IGSID}';`),
    "instagram",
  );

  es(
    "con su @usuario, que Instagram sí entrega",
    sql(`select usuario from public.conversaciones where identificador = '${IGSID}';`),
    "rosamejia",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y LOS DOS SIGUEN SIENDO DOS PERSONAS DISTINTAS ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "dos hilos",
    sql(`select count(*) from public.conversaciones
          where identificador in ('${PSID}', '${IGSID}');`),
    "2",
  );
  es(
    "dos fichas",
    sql(`select count(distinct cliente_id) from public.contactos_canal
          where identificador in ('${PSID}', '${IGSID}');`),
    "2",
  );
}

limpiar();

console.log(
  f === 0
    ? "\nTodo bien: el canal lo decide la carga, y el nombre aparece igual."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f === 0 ? 0 : 1);
