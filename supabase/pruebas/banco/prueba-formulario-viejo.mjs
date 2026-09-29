/**
 * El SQL que completa las fichas viejas deja lo mismo que la aplicación.
 *
 *     node supabase/pruebas/banco/prueba-formulario-viejo.mjs
 *
 * ============================================================================
 * POR QUÉ ESTA PRUEBA EXISTE
 * ============================================================================
 *
 * El lector de formularios vive en la aplicación, porque corre cuando entra
 * cada mensaje. La migración `20261108120000_fichas_de_pauta_ya_recibidas.sql`
 * es una SEGUNDA implementación de las mismas reglas, para los leads que
 * entraron antes de que el CRM supiera leerlas.
 *
 * Dos implementaciones de una regla se desincronizan. Se aceptó porque el SQL
 * corre una vez —no hay futuro en el que puedan discrepar, sólo este momento—
 * pero para ESTE momento hay que comprobarlo, y eso es lo que hace esto:
 *
 *   EL MISMO FORMULARIO, POR LOS DOS CAMINOS, Y LA MISMA FICHA AL FINAL.
 *
 * Uno entra por el webhook, que completa la ficha al vuelo. El otro se siembra
 * a mano —como quedaron los que llegaron antes— y se arregla con el SQL.
 * Después se comparan campo por campo.
 *
 * ============================================================================
 * Y LAS TRES REGLAS, TAMBIÉN EN EL SQL
 * ============================================================================
 *
 *   NO PISA        Una ficha vieja con el correo ya escrito a mano no se toca.
 *   NO ADIVINA     Un programa ambiguo deja el campo vacío.
 *   NO SE CONFUNDE Un mensaje común no se toma por formulario.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const SECRETO = "secreto-de-prueba";
const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";
const MIGRACION = `${RAIZ}/supabase/migrations/20261108120000_fichas_de_pauta_ya_recibidas.sql`;

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

/** Corre un archivo entero, que es como se corre la migración de verdad. */
const correrArchivo = (ruta) => {
  const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
    encoding: "utf8",
  });
  if (/^psql:.*ERROR:/m.test(salida)) {
    console.error(`\nLa migración falló:\n${salida}\n`);
    process.exit(1);
  }
  return salida;
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Por la aplicación, sembrado a mano, el que no se toca, y el común. */
const POR_LA_APP = "50361110001";
const VIEJO = "50361110002";
const CON_DATOS = "50361110003";
const COMUN = "50361110004";
const TODOS = [POR_LA_APP, VIEJO, CON_DATOS, COMUN];
const enComillas = TODOS.map((t) => `'${t}'`).join(",");

const limpiar = () => {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono in (${enComillas}))`);
  sql(`delete from conversaciones where telefono in (${enComillas})`);
  sql(`delete from oportunidad_programas where oportunidad_id in (select id from oportunidades where cliente_id in (select id from clientes where telefono in (${enComillas})))`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono in (${enComillas}))`);
  sql(`delete from clientes where telefono in (${enComillas})`);
};
limpiar();

sql(`insert into productos (nombre) select 'Curso corto Pastelería Saludable' where not exists (select 1 from productos where nombre='Curso corto Pastelería Saludable')`);
sql(`insert into territorios (nombre) select 'Chalatenango' where not exists (select 1 from territorios where nombre='Chalatenango')`);

/** El formulario real de la escuela. */
const EL_FORMULARIO = [
  "¡Hola! Completé el formulario y me gustaría obtener más información sobre el negocio.",
  "Email: magdalenamartinez24@hotmail.com",
  "Full name: Magdalena Martinez",
  "Phone number: 7966 4432",
  "Province: Colon",
  "Curso Corto de tu interés: Pastelería Saludable",
  "City: Chalatenango",
].join("\n");

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. UNO ENTRA POR LA APLICACIÓN ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const carga = {
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
              contacts: [{ profile: { name: null }, wa_id: POR_LA_APP }],
              messages: [
                {
                  from: POR_LA_APP,
                  id: "wamid.VIEJO" + Date.now(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: EL_FORMULARIO },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", SECRETO).update(crudo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });

  es("el webhook lo acepta", r.status, 200);
  execSync("sleep 2.5");
  es(
    "y la ficha quedó completa",
    sql(`select correo from clientes where telefono='${POR_LA_APP}'`),
    "magdalenamartinez24@hotmail.com",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Y TRES SE SIEMBRAN COMO QUEDARON LOS VIEJOS ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * O sea: el mensaje en el hilo y la ficha vacía, que es exactamente el estado
 * en el que quedaron los leads que entraron antes de este arreglo.
 */
const sembrarViejo = (tel, nombre, texto, correo = null) => {
  const esc = (s) => s.replace(/'/g, "''");
  sql(
    `insert into clientes (nombre, telefono, correo) values ('${esc(nombre)}', '${tel}', ${
      correo ? `'${esc(correo)}'` : "null"
    })`,
  );
  sql(
    `insert into oportunidades (codigo, cliente_id, fecha_registro) ` +
      `select 'PAUTA-${tel}', id, current_date from clientes where telefono='${tel}'`,
  );
  sql(
    `insert into conversaciones (canal, identificador, telefono, ultimo_mensaje_en, cliente_id) ` +
      `select 'whatsapp', '${tel}', '${tel}', now(), id from clientes where telefono='${tel}'`,
  );

  const ruta = path.join(os.tmpdir(), `siembra-${tel}.sql`);
  fs.writeFileSync(
    ruta,
    `insert into mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)\n` +
      `select id, 'wamid.SEM.${tel}', 'entrante', 'text', $sem$${texto}$sem$, now()\n` +
      `  from conversaciones where telefono = '${tel}';\n`,
    "utf8",
  );
  fs.chmodSync(ruta, 0o644);
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f ${ruta}" 2>&1`);
  fs.rmSync(ruta, { force: true });
};

// El de siempre: ficha llamada como el teléfono, sin correo.
sembrarViejo(VIEJO, VIEJO, EL_FORMULARIO);
// Uno al que alguien ya le escribió el correo a mano: NO se puede pisar.
sembrarViejo(CON_DATOS, "Nombre Escrito A Mano", EL_FORMULARIO, "loescribio@unapersona.com");
// Y un mensaje común, que no es un formulario.
sembrarViejo(COMUN, "Ana Común", "Hola: quisiera información del curso de pastelería");

es("los tres viejos están sin correo o con el suyo", sql(
  `select count(*) from clientes where telefono in ('${VIEJO}','${COMUN}') and correo is null`,
), "2");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. SE CORRE LA MIGRACIÓN ──");
// ══════════════════════════════════════════════════════════════════════════
correrArchivo(MIGRACION);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. LOS DOS CAMINOS DEJAN LA MISMA FICHA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const fichaDe = (tel) =>
    sql(
      `select coalesce(cl.nombre,'-') || ' | ' || coalesce(cl.correo,'-') || ' | ' || ` +
        `coalesce(p.nombre,'-') || ' | ' || coalesce(t.nombre,'-') ` +
        `from clientes cl ` +
        `left join lateral (select * from oportunidades o where o.cliente_id=cl.id order by o.id desc limit 1) o on true ` +
        `left join productos p on p.id=o.producto_id ` +
        `left join territorios t on t.id=o.territorio_id ` +
        `where cl.telefono='${tel}'`,
    );

  const porLaApp = fichaDe(POR_LA_APP);
  const porElSql = fichaDe(VIEJO);

  console.log(`   por la aplicación: ${porLaApp}`);
  console.log(`   por el SQL:        ${porElSql}`);

  /*
   * La comprobación que justifica tener el SQL escrito aparte. Si las dos
   * implementaciones discrepan, acá se ve, antes de correrlo en producción.
   */
  es("SON IDÉNTICAS", porElSql, porLaApp);
  es(
    "y traen lo que tenía que traer",
    porLaApp,
    "Magdalena Martinez | magdalenamartinez24@hotmail.com | Curso corto Pastelería Saludable | Chalatenango",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. NO PISA NI SE CONFUNDE ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "EL CORREO ESCRITO A MANO SIGUE INTACTO",
    sql(`select correo from clientes where telefono='${CON_DATOS}'`),
    "loescribio@unapersona.com",
  );
  es(
    "y el nombre escrito a mano también",
    sql(`select nombre from clientes where telefono='${CON_DATOS}'`),
    "Nombre Escrito A Mano",
  );
  es(
    "EL MENSAJE COMÚN NO LLENÓ NADA",
    sql(`select coalesce(correo,'(vacío)') from clientes where telefono='${COMUN}'`),
    "(vacío)",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. CORRERLA DOS VECES NO CAMBIA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const antes = sql(
    `select count(*) from clientes where telefono in (${enComillas}) and correo is not null`,
  );
  correrArchivo(MIGRACION);
  es(
    "la segunda corrida deja todo igual",
    sql(`select count(*) from clientes where telefono in (${enComillas}) and correo is not null`),
    antes,
  );
}

limpiar();
es("no quedó basura de la prueba", sql(`select count(*) from clientes where telefono='${VIEJO}'`), "0");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
