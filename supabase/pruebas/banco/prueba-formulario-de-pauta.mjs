/**
 * Un lead de pauta llena su ficha solo.
 *
 *     node supabase/pruebas/banco/prueba-formulario-de-pauta.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ PROBANDO
 * ============================================================================
 *
 * Cuando alguien completa el formulario de un anuncio, WhatsApp abre el chat
 * con un mensaje que ya trae el nombre, el correo y el curso por el que
 * pregunta. Todo eso quedaba escrito en el hilo y la ficha se abría vacía:
 * quien atendía copiaba los datos a mano de un mensaje que los tenía. Por cada
 * lead de pauta.
 *
 * Se manda por el webhook DE VERDAD, firmado como lo firma Meta, y después se
 * mira la base. Es la única forma de ejercer este camino: acá no hay nadie con
 * sesión abierta, escribe la llave de servicio, y eso sólo pasa cuando entra un
 * mensaje real.
 *
 * ============================================================================
 * LAS DOS MITADES
 * ============================================================================
 *
 *   QUE COMPLETE     El formulario de la escuela, con sus etiquetas en inglés.
 *   QUE NO PISE      Un segundo formulario con datos distintos no puede tocar
 *                    lo que ya está. Es la regla que permite dejar esto
 *                    andando sin vigilarlo, y la que más fácil se rompe al
 *                    tocar el código.
 *
 * Y una tercera: un mensaje común no puede confundirse con un formulario.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142 con
 * `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const SECRETO = "secreto-de-prueba";
const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const TEL = "50361239876";
const OTRO = "50361239877";

const limpiar = () => {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono in ('${TEL}','${OTRO}'))`);
  sql(`delete from conversaciones where telefono in ('${TEL}','${OTRO}')`);
  sql(`delete from oportunidad_programas where oportunidad_id in (select id from oportunidades where cliente_id in (select id from clientes where telefono in ('${TEL}','${OTRO}')))`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono in ('${TEL}','${OTRO}'))`);
  sql(`delete from clientes where telefono in ('${TEL}','${OTRO}')`);
};
limpiar();

/*
 * Un programa y un territorio con los que se pueda acertar.
 *
 * El del catálogo se llama «Curso corto Pastelería Saludable» y el formulario
 * dice «Pastelería Saludable»: es justo el caso que hay que resolver, y el que
 * una comparación exacta no juntaría.
 */
sql(`insert into productos (nombre) select 'Curso corto Pastelería Saludable' where not exists (select 1 from productos where nombre='Curso corto Pastelería Saludable')`);
sql(`insert into territorios (nombre) select 'Chalatenango' where not exists (select 1 from territorios where nombre='Chalatenango')`);

/** El mensaje tal cual lo manda la pauta de la escuela. */
const EL_FORMULARIO = [
  "¡Hola! Completé el formulario y me gustaría obtener más información sobre el negocio.",
  "Email: magdalenamartinez24@hotmail.com",
  "Full name: Magdalena Martinez",
  "Phone number: 7966 4432",
  "Province: Colon",
  "Curso Corto de tu interés: Pastelería Saludable",
  "City: Chalatenango",
].join("\n");

const carga = (tel, texto, perfil, waId) => ({
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
            contacts: [{ profile: { name: perfil }, wa_id: tel }],
            messages: [
              {
                from: tel,
                id: waId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: texto },
              },
            ],
          },
        },
      ],
    },
  ],
});

const mandar = async (cuerpo) => {
  const crudo = JSON.stringify(cuerpo);
  const firma = crypto.createHmac("sha256", SECRETO).update(crudo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  return r.status;
};

const esperar = (ms) => execSync(`sleep ${ms / 1000}`);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. ENTRA EL FORMULARIO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Sin nombre de perfil, que es el caso normal de un lead de pauta: la ficha
   * nace llamándose como el teléfono, y el nombre del formulario es mejor.
   */
  const estado = await mandar(carga(TEL, EL_FORMULARIO, null, "wamid.FORM" + Date.now()));
  es("el webhook lo acepta", estado, 200);
  esperar(2500);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LA FICHA SE LLENÓ SOLA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "EL NOMBRE, del formulario y no el número",
    sql(`select nombre from clientes where telefono='${TEL}'`),
    "Magdalena Martinez",
  );
  es(
    "EL CORREO, que en WhatsApp no llega de ningún otro lado",
    sql(`select correo from clientes where telefono='${TEL}'`),
    "magdalenamartinez24@hotmail.com",
  );

  /*
   * El teléfono NO se toca: el del hilo es el que Meta confirmó y el del
   * formulario lo escribió la persona a mano. Acá son distintos a propósito
   * —el formulario dice 7966 4432— y tiene que ganar el del hilo.
   */
  es("y el teléfono sigue siendo el del hilo", sql(`select telefono from clientes where telefono='${TEL}'`), TEL);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. Y LA CLASIFICACIÓN TAMBIÉN ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "EL PROGRAMA, aunque el catálogo lo llame distinto",
    sql(
      `select p.nombre from oportunidades o join productos p on p.id=o.producto_id ` +
        `where o.cliente_id=(select id from clientes where telefono='${TEL}')`,
    ),
    "Curso corto Pastelería Saludable",
  );
  es(
    "EL TERRITORIO",
    sql(
      `select t.nombre from oportunidades o join territorios t on t.id=o.territorio_id ` +
        `where o.cliente_id=(select id from clientes where telefono='${TEL}')`,
    ),
    "Chalatenango",
  );
  es(
    "y queda anotado entre los programas por los que preguntó",
    sql(
      `select count(*) from oportunidad_programas op ` +
        `join oportunidades o on o.id=op.oportunidad_id ` +
        `where o.cliente_id=(select id from clientes where telefono='${TEL}')`,
    ),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. UN SEGUNDO FORMULARIO NO PISA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * La regla que permite dejar esto andando sin vigilarlo. Alguien que vuelve
   * a completar la pauta con otro correo —o con un dedazo— no puede borrar lo
   * que ya estaba: un hueco se ve y se completa, un dato pisado no.
   */
  const otro = ["Email: otro@distinto.com", "Full name: Otro Nombre", "Programa: Barismo"].join("\n");
  await mandar(carga(TEL, otro, null, "wamid.FORM2" + Date.now()));
  esperar(2500);

  es(
    "el nombre sigue siendo el primero",
    sql(`select nombre from clientes where telefono='${TEL}'`),
    "Magdalena Martinez",
  );
  es(
    "Y EL CORREO TAMBIÉN",
    sql(`select correo from clientes where telefono='${TEL}'`),
    "magdalenamartinez24@hotmail.com",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. UN MENSAJE COMÚN NO ES UN FORMULARIO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * La otra mitad. Un falso positivo mete datos inventados en una ficha, y a
   * un campo que se llenó solo nadie lo revisa.
   */
  await mandar(
    carga(OTRO, "Hola: quisiera información del curso de pastelería", "Ana Común", "wamid.COMUN" + Date.now()),
  );
  esperar(2500);

  es(
    "la ficha se abre con el nombre del perfil, como siempre",
    sql(`select nombre from clientes where telefono='${OTRO}'`),
    "Ana Común",
  );
  es("y sin correo inventado", sql(`select coalesce(correo,'(vacío)') from clientes where telefono='${OTRO}'`), "(vacío)");
  es(
    "ni programa inventado",
    sql(
      `select coalesce(producto_id::text,'(vacío)') from oportunidades ` +
        `where cliente_id=(select id from clientes where telefono='${OTRO}')`,
    ),
    "(vacío)",
  );
}

limpiar();
es("no quedó basura de la prueba", sql(`select count(*) from clientes where telefono='${TEL}'`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
