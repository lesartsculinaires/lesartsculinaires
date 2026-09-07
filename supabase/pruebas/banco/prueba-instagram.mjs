/**
 * ¿Un mensaje directo de Instagram llega hasta la base, y hasta la bandeja?
 *
 *     node supabase/pruebas/banco/prueba-instagram.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Comenzaremos a trabajar en la migración e implementación en el CRM del canal
 * de Instagram y, a su vez, tomaremos los mismos principios, interfaces y
 * lógica que Whatsapp. La idea es que pueda recibir y contestar mensajes de
 * Instagram, utilizar etiquetas, asignar asesores.»
 *
 * ============================================================================
 * QUÉ SE PRUEBA, Y POR QUÉ NO ALCANZA CON MIRAR LA PANTALLA
 * ============================================================================
 *
 * Se manda al webhook una carga igual a la que manda Meta, firmada como Meta la
 * firma, y después se mira la base. Es la única forma de probar este camino sin
 * una cuenta real: acá no hay nadie con sesión abierta, escribe la llave de
 * servicio, y todo eso sólo se ejerce cuando entra un mensaje de verdad.
 *
 * Lo que NO se ve mirando, y es lo que justifica el archivo:
 *
 *   EL IGSID NO SE VUELVE TELÉFONO   Es el riesgo central de todo esto. El CRM
 *                                    reconoce personas por los últimos ocho
 *                                    dígitos del teléfono; si el IGSID cayera
 *                                    en esa columna, tarde o temprano fundiría
 *                                    a dos personas distintas. Acá se prueba
 *                                    con un IGSID cuyos últimos ocho dígitos
 *                                    son iguales a los del celular de otra
 *                                    persona que ya está en la base.
 *
 *   EL HILO ES OTRO, LA FICHA PUEDE  Un mismo número puede existir como
 *   SER LA MISMA                     identificador en los dos canales sin que
 *                                    un hilo pise al otro: la unicidad es por
 *                                    canal.
 *
 *   ENTRA EL LEAD Y SE SORTEA        Es lo que pidió la escuela con «asignar
 *   ASESORA                          asesores»: quien escribe por Instagram
 *                                    tiene que entrar al embudo igual que quien
 *                                    escribe por WhatsApp, con dueño.
 *
 *   UN ECO NO ES UN PENDIENTE        Si alguien contesta desde la aplicación de
 *                                    Instagram en su teléfono, Meta lo manda de
 *                                    vuelta. Tiene que quedar en el hilo como
 *                                    SALIENTE y no subir el contador rojo.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación levantada en 3142 con
 * `WHATSAPP_APP_SECRET=secreto-de-prueba` y la llave de `jwt-servicio.txt`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const URL = "http://127.0.0.1:3142/api/instagram/webhook";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `ig-${process.pid}-${Math.random()}.sql`);
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

/*
 * El IGSID y el teléfono que terminan igual.
 *
 * `17841400000` es el prefijo que Meta usa de verdad para estas cuentas. Los
 * últimos ocho dígitos —«70555999»— son los mismos que los del celular de
 * abajo, y eso es a propósito: es la trampa que la migración viene a evitar.
 */
const IGSID = "1784140077970555999";
const TEL_PARECIDO = "50370555999";
const YA_ESTABA = "Rival Del Igsid PRUEBA";
const CUENTA = "17841400000000001";

const marca = Date.now();
const MID = `aWdfZG1fPRUEBA${marca}`;
const MID_ECO = `aWdfZG1fECO${marca}`;

/*
 * La ficha que crea el webhook no se llama «PRUEBA» nada.
 *
 * Se llama «Contacto de Instagram», porque en el banco no hay un Meta a quien
 * preguntarle el nombre. Borrarla por su nombre sería peligroso —hay una por
 * cada persona real de Instagram sin nombre de perfil— así que se la busca por
 * el IGSID, que sí es de esta prueba.
 *
 * Sin esto, cada corrida dejaba una ficha suelta y la comprobación de que NO se
 * fundieron dos personas empezaba a contar las de las corridas anteriores.
 */
const limpiar = () => {
  sql(`
    create temporary table if not exists _ig_prueba as
      select cliente_id from public.contactos_canal where identificador = '${IGSID}';
    insert into _ig_prueba
      select cliente_id from public.contactos_canal where identificador = '${IGSID}';

    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IGSID}'
          or telefono = '${TEL_PARECIDO}');
    delete from public.conversaciones where identificador = '${IGSID}'
       or telefono = '${TEL_PARECIDO}'
       or cliente_id in (select cliente_id from _ig_prueba);
    delete from public.contactos_canal where identificador = '${IGSID}';
    delete from public.oportunidades where cliente_id in (select cliente_id from _ig_prueba)
       or cliente_id in (select id from public.clientes where nombre like '%PRUEBA%'
          and (nombre like '%Igsid%' or nombre like '%Sofia Instagram%'));
    delete from public.clientes where id in (select cliente_id from _ig_prueba)
       or nombre like '%Igsid%PRUEBA%' or nombre like '%Sofia Instagram%';
    drop table if exists _ig_prueba;
  `);
};
limpiar();

/*
 * La persona que ya estaba, con el teléfono que termina igual que el IGSID.
 *
 * Sin esta ficha la prueba de no-fusión no probaría nada: no habría con quién
 * fundirse. Con ella, si `cliente_de_instagram` buscara por los últimos ocho
 * dígitos como hace la de WhatsApp, encontraría a esta persona y le colgaría la
 * conversación de Instagram de alguien que no es.
 */
sql(`
  insert into public.clientes (nombre, telefono) values ('${YA_ESTABA}', '${TEL_PARECIDO}');
`);

const mandar = async (cuerpo, firmaMala = false) => {
  const crudo = JSON.stringify(cuerpo);
  const firma = crypto
    .createHmac("sha256", firmaMala ? "otro" : SECRETO)
    .update(crudo)
    .digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  return r.status;
};

/** Una carga igual a la que manda Meta cuando alguien escribe por Instagram. */
const cargaDe = (mid, texto, eco = false) => ({
  object: "instagram",
  entry: [
    {
      id: CUENTA,
      time: marca,
      messaging: [
        {
          // En un eco el emisor somos nosotros y la persona es el destinatario.
          sender: { id: eco ? CUENTA : IGSID },
          recipient: { id: eco ? IGSID : CUENTA },
          // MILISEGUNDOS, no segundos. Es la diferencia con WhatsApp que más
          // fácil se pasa por alto, y la que pondría los mensajes en el año
          // 57.000 si el código los multiplicara por mil.
          timestamp: marca,
          message: { mid, text: texto, ...(eco ? { is_echo: true } : {}) },
        },
      ],
    },
  ],
});

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la firma es lo único que separa un mensaje real de uno inventado ──");
// ══════════════════════════════════════════════════════════════════════════
es(
  "una carga sin la firma de Meta se rechaza",
  await mandar(cargaDe("no-deberia-entrar", "hola"), true),
  401,
);
es(
  "y no dejó nada en la base",
  sql(`select count(*) from public.mensajes where wa_id = 'no-deberia-entrar';`),
  "0",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. EL MENSAJE ENTRA Y ABRE EL HILO ──");
// ══════════════════════════════════════════════════════════════════════════
es(
  "el webhook contesta 200",
  await mandar(cargaDe(MID, "Hola, vi su publicación del curso de pastelería")),
  200,
);

es(
  "SE GUARDÓ EL MENSAJE",
  sql(`select texto from public.mensajes where wa_id = '${MID}';`),
  "Hola, vi su publicación del curso de pastelería",
);
es(
  "y entró como entrante",
  sql(`select direccion from public.mensajes where wa_id = '${MID}';`),
  "entrante",
);
es(
  "el hilo quedó marcado como de Instagram",
  sql(`select canal from public.conversaciones where identificador = '${IGSID}';`),
  "instagram",
);
es(
  "con el contador de sin leer en 1",
  sql(`select sin_leer::text from public.conversaciones where identificador = '${IGSID}';`),
  "1",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. EL IGSID NO SE GUARDA COMO TELÉFONO ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Lo central de toda la migración. Ver el encabezado.
es(
  "EL HILO DE INSTAGRAM NO TIENE TELÉFONO",
  sql(`
    select coalesce(telefono, '(sin teléfono)') from public.conversaciones
     where identificador = '${IGSID}';
  `),
  "(sin teléfono)",
);
es(
  "Y NO SE FUNDIÓ CON LA FICHA DEL TELÉFONO PARECIDO",
  sql(`
    select c.nombre from public.clientes c
     join public.conversaciones v on v.cliente_id = c.id
     where v.identificador = '${IGSID}';
  `),
  // Sin nombre ni @usuario —el banco no tiene a Meta a quién preguntarle— la
  // ficha se llama así, que es lo que dice la migración que debe pasar.
  "Contacto de Instagram",
);
es(
  "la ficha de la otra persona sigue intacta, con su teléfono",
  sql(`select telefono from public.clientes where nombre = '${YA_ESTABA}';`),
  TEL_PARECIDO,
);
/*
 * Dos fichas: la que ya estaba y la que abrió Instagram.
 *
 * Se cuentan por identidad y no por nombre. Contar los clientes llamados
 * «Contacto de Instagram» mezclaría a toda la gente real de Instagram que
 * todavía no tiene nombre de perfil, y la prueba pasaría o fallaría según qué
 * más haya en la base.
 */
es(
  "son dos fichas distintas, no una",
  sql(`
    select count(*) from (
      select c.id from public.clientes c where c.nombre = '${YA_ESTABA}'
      union
      select v.cliente_id from public.conversaciones v where v.identificador = '${IGSID}'
    ) t;
  `),
  "2",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. ENTRA AL EMBUDO Y SE LE SORTEA ASESORA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// «Asignar asesores», que es una de las tres cosas que pidió la escuela. Un
// lead de Instagram tiene que entrar igual que uno de WhatsApp: con código, en
// Prospectos, y con dueño.
es(
  "SE LE ABRIÓ UN LEAD",
  sql(`
    select count(*) from public.oportunidades o
     join public.conversaciones v on v.cliente_id = o.cliente_id
     where v.identificador = '${IGSID}';
  `),
  "1",
);
es(
  "con el canal Instagram anotado en el lead",
  sql(`
    select lower(ca.nombre) from public.oportunidades o
     join public.conversaciones v on v.cliente_id = o.cliente_id
     join public.canales ca on ca.id = o.canal_id
     where v.identificador = '${IGSID}';
  `),
  "instagram",
);
es(
  "Y CON ASESORA ASIGNADA",
  sql(`
    select case when o.vendedor_id is null then 'sin dueño' else 'con dueño' end
      from public.oportunidades o
      join public.conversaciones v on v.cliente_id = o.cliente_id
     where v.identificador = '${IGSID}';
  `),
  "con dueño",
);
es(
  "y el hilo quedó de la misma asesora que el lead",
  sql(`
    select case when v.vendedor_id = o.vendedor_id then 'la misma' else 'distinta' end
      from public.conversaciones v
      join public.oportunidades o on o.cliente_id = v.cliente_id
     where v.identificador = '${IGSID}';
  `),
  "la misma",
);
es(
  "quedó anotado por dónde apareció esta persona",
  sql(`
    select count(*) from public.contactos_canal cc
     join public.canales ca on ca.id = cc.canal_id
     where cc.identificador = '${IGSID}' and lower(ca.nombre) = 'instagram';
  `),
  "1",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. el mismo mensaje dos veces es un reintento, no dos mensajes ──");
// ══════════════════════════════════════════════════════════════════════════
await mandar(cargaDe(MID, "Hola, vi su publicación del curso de pastelería"));
es(
  "sigue habiendo uno solo",
  sql(`select count(*) from public.mensajes where wa_id = '${MID}';`),
  "1",
);
es(
  "y no se abrió un segundo lead",
  sql(`
    select count(*) from public.oportunidades o
     join public.conversaciones v on v.cliente_id = o.cliente_id
     where v.identificador = '${IGSID}';
  `),
  "1",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. LO CONTESTADO DESDE EL TELÉFONO NO QUEDA COMO PENDIENTE ──");
// ══════════════════════════════════════════════════════════════════════════
//
// El eco: alguien del equipo contestó desde la aplicación de Instagram. Tiene
// que aparecer en el hilo —para que el CRM muestre la conversación completa— y
// NO subir el número rojo, porque ya está contestado.
es(
  "el eco entra",
  await mandar(cargaDe(MID_ECO, "¡Hola! Con gusto le paso la información 😊", true), false),
  200,
);
es(
  "QUEDÓ EN EL HILO COMO SALIENTE",
  sql(`select direccion from public.mensajes where wa_id = '${MID_ECO}';`),
  "saliente",
);
es(
  "en el hilo de la persona, no en uno de la cuenta de la escuela",
  sql(`
    select v.identificador from public.conversaciones v
     join public.mensajes m on m.conversacion_id = v.id
     where m.wa_id = '${MID_ECO}';
  `),
  IGSID,
);
es(
  "Y EL CONTADOR ROJO NO SUBIÓ",
  sql(`select sin_leer::text from public.conversaciones where identificador = '${IGSID}';`),
  "1",
);
es(
  "pero el hilo sí subió en la lista: su último mensaje es el eco",
  sql(`
    select case when ultimo_texto like '%Con gusto%' then 'el eco' else ultimo_texto end
      from public.conversaciones where identificador = '${IGSID}';
  `),
  "el eco",
);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 7. el mismo número puede ser identidad en los dos canales ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La unicidad es POR CANAL. Sin eso, el hilo de WhatsApp de una persona y el de
// Instagram de otra se pisarían por casualidad de los números.
sql(`
  insert into public.conversaciones (canal, identificador, telefono)
  values ('whatsapp', '${IGSID}', '${IGSID}')
  on conflict do nothing;
`);
es(
  "DOS HILOS CON LA MISMA IDENTIDAD, UNO POR CANAL",
  sql(`select count(*) from public.conversaciones where identificador = '${IGSID}';`),
  "2",
);

sql(`delete from public.conversaciones where canal = 'whatsapp' and identificador = '${IGSID}';`);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 8. y lo de WhatsApp sigue igual ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La migración le tocó la tabla a WhatsApp: `identificador` pasó a ser
// obligatorio y la unicidad dejó de ser por teléfono. Un hilo de WhatsApp nuevo
// tiene que seguir entrando, y con su identidad puesta.
{
  const TEL_WA = "50370111222";
  const WAID = "wamid.IGPRUEBA" + marca;
  sql(`
    delete from public.mensajes where wa_id = '${WAID}';
    delete from public.conversaciones where telefono = '${TEL_WA}';
    delete from public.clientes where nombre = 'Wa Junto A Instagram PRUEBA';
  `);

  const crudo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "222",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "50322334455", phone_number_id: "111" },
              contacts: [{ profile: { name: "Wa Junto A Instagram PRUEBA" }, wa_id: TEL_WA }],
              messages: [
                {
                  from: TEL_WA,
                  id: WAID,
                  timestamp: String(Math.floor(marca / 1000)),
                  type: "text",
                  text: { body: "Sigo entrando por WhatsApp" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const firma = crypto.createHmac("sha256", SECRETO).update(crudo).digest("hex");
  const r = await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });

  es("el webhook de WhatsApp sigue contestando 200", r.status, 200);
  es(
    "EL MENSAJE DE WHATSAPP ENTRÓ IGUAL",
    sql(`select texto from public.mensajes where wa_id = '${WAID}';`),
    "Sigo entrando por WhatsApp",
  );
  es(
    "y su hilo guarda el teléfono como identidad",
    sql(`
      select case when identificador = telefono then 'el teléfono' else identificador end
        from public.conversaciones where telefono = '${TEL_WA}';
    `),
    "el teléfono",
  );

  sql(`
    delete from public.mensajes where wa_id = '${WAID}';
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where nombre = 'Wa Junto A Instagram PRUEBA');
    delete from public.conversaciones where telefono = '${TEL_WA}';
    delete from public.clientes where nombre = 'Wa Junto A Instagram PRUEBA';
  `);
}

limpiar();
sql(`delete from public.clientes where nombre = '${YA_ESTABA}';`);
es(
  "no quedó basura",
  sql(`select count(*) from public.conversaciones where identificador = '${IGSID}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
