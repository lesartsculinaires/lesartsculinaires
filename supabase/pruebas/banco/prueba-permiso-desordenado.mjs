/**
 * El permiso de llamada, cuando los dos eventos llegan desordenados.
 *
 *     node supabase/pruebas/banco/prueba-permiso-desordenado.mjs
 *
 * ============================================================================
 * EL CASO REAL QUE LO OBLIGÓ
 * ============================================================================
 *
 * En el hilo de una clienta quedaron los dos eventos, en el mismo minuto:
 *
 *     02:29 p. m.  «No aceptó que lo llamemos por WhatsApp»
 *     02:29 p. m.  «Aceptó que lo llamemos por WhatsApp»
 *
 * El último fue el «sí», y la bandeja igual decía «No aceptó que lo llamemos,
 * así que el CRM no se lo vuelve a pedir», sin botón de llamar.
 *
 * La causa no era la regla —`permisoDeLlamada.ts` dice bien que un permiso
 * vigente gana aunque antes hubiera un rechazo— sino el guardado: escribía a
 * ciegas y ganaba el que escribía último, que con dos funciones corriendo en
 * paralelo no es el que ocurrió último.
 *
 * Esta prueba manda los eventos a propósito en el orden equivocado. Es el único
 * modo de que un arreglo así no se deshaga solo dentro de seis meses: leído, el
 * código nuevo y el viejo se parecen mucho.
 *
 * Necesita el banco armado (`armar.sh`), la aplicación en 3142 y
 * `WHATSAPP_APP_SECRET=secreto-de-prueba`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const SECRETO = "secreto-de-prueba";
const RAIZ = "http://127.0.0.1:3142";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `perm-${process.pid}-${Math.random()}.sql`);
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

const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
  `);
};
limpiar();

// El hilo tiene que existir: `anotarPermiso` busca la conversación por teléfono
// y si no está, no hace nada. Es el estado normal —la persona ya escribió—.
sql(`
  insert into public.conversaciones (canal, telefono, nombre_perfil)
  values ('whatsapp', '${TEL}', 'PRUEBA PERMISO ${marca}');
`);

const comoMeta = async (carga) => {
  const cuerpo = JSON.stringify(carga);
  const firma = "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
  const r = await fetch(`${RAIZ}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

/**
 * Una respuesta al permiso de llamada, como la manda Meta.
 *
 * `segundos` es CUÁNDO ocurrió, que es lo que esta prueba manipula. `vence` va
 * sólo en las aceptaciones: un rechazo no trae plazo.
 */
const respuesta = (acepto, segundos, mid, permanente = false) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "0",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "1", phone_number_id: "1" },
            contacts: [{ wa_id: TEL, profile: { name: `PRUEBA PERMISO ${marca}` } }],
            messages: [
              {
                from: TEL,
                id: mid,
                timestamp: String(segundos),
                type: "interactive",
                interactive: {
                  type: "call_permission_reply",
                  /*
                   * Las dos formas que manda Meta de verdad, copiadas de los
                   * mensajes guardados de la escuela:
                   *
                   *   temporal   is_permanent:false + expiration_timestamp
                   *   permanente is_permanent:true  y NINGUNA fecha
                   *
                   * La segunda es la que dejaba a una clienta sin botón de
                   * llamar: el lector sólo buscaba la fecha.
                   */
                  call_permission_reply: {
                    response: acepto ? "accept" : "reject",
                    ...(acepto ? { is_permanent: permanente } : {}),
                    ...(acepto && !permanente
                      ? { expiration_timestamp: segundos + 7 * 24 * 3600 }
                      : {}),
                  },
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

/** Lo que quedó guardado del permiso. */
const guardado = () =>
  sql(`
    select coalesce(llamada_permiso_respuesta, '-')
        || '|' || (case when llamada_permiso_hasta is null then 'sin-fecha' else 'con-fecha' end)
        || '|' || (case when llamada_permiso_permanente then 'permanente' else 'temporal' end)
      from public.conversaciones where telefono = '${TEL}';
  `);

const AHORA = Math.floor(Date.now() / 1000);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL CASO DE LA ESCUELA: los dos en el mismo segundo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * El orden importa, y va a propósito al revés de lo intuitivo.
   *
   * Se manda primero la ACEPTACIÓN y después el RECHAZO, los dos del mismo
   * segundo. Con el código viejo —que escribía a ciegas— el rechazo llegaba
   * último y borraba el permiso: exactamente lo que le pasó a la clienta.
   *
   * Al revés —rechazo y después aceptación— la prueba pasaría igual con el
   * código viejo y no estaría probando nada.
   */
  es("la aceptación entra", await comoMeta(respuesta(true, AHORA, `m_si_${marca}`)), 200);
  es(
    "y el rechazo del mismo segundo llega DESPUÉS",
    await comoMeta(respuesta(false, AHORA, `m_no_${marca}`)),
    200,
  );

  es("GANA EL «SÍ», que es lo que la clienta contestó", guardado(), "acepto|con-fecha|temporal");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. UN RECHAZO VIEJO QUE LLEGA TARDE NO BORRA EL PERMISO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Es el reintento de Meta, o el lote que se procesó al revés. Antes esto
   * borraba el permiso y escondía el botón de llamar sin que nadie supiera por
   * qué.
   */
  es(
    "el rechazo viejo entra igual (200, para que Meta no reintente)",
    await comoMeta(respuesta(false, AHORA - 3600, `m_viejo_${marca}`)),
    200,
  );
  es("y NO pisó nada: el permiso sigue vigente", guardado(), "acepto|con-fecha|temporal");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. UN RECHAZO NUEVO SÍ MANDA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  // La regla no es «el sí siempre gana»: es «gana el más nuevo». Si la persona
  // se arrepiente después, eso tiene que valer.
  es(
    "el rechazo posterior entra",
    await comoMeta(respuesta(false, AHORA + 60, `m_no2_${marca}`)),
    200,
  );
  es("y ahora sí borra el permiso", guardado(), "rechazo|sin-fecha|temporal");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y SI VUELVE A ACEPTAR, VUELVE A VALER ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "la aceptación más nueva entra",
    await comoMeta(respuesta(true, AHORA + 120, `m_si2_${marca}`)),
    200,
  );
  es("el permiso vuelve", guardado(), "acepto|con-fecha|temporal");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. EL PERMISO PERMANENTE: acepta y NO manda fecha ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * El caso que dejó a una clienta sin botón durante días.
   *
   * Meta manda `is_permanent: true` y NINGUNA fecha de vencimiento, porque no
   * vence. El lector sólo buscaba la fecha, no la encontraba, y guardaba el
   * permiso como si no se supiera nada: la persona que dio el permiso MÁS
   * AMPLIO era justamente a la que el CRM no dejaba llamar.
   */
  es(
    "la aceptación permanente entra",
    await comoMeta(respuesta(true, AHORA + 180, `m_perm_${marca}`, true)),
    200,
  );

  es(
    "SE GUARDA COMO PERMANENTE, aunque no venga fecha",
    guardado(),
    "acepto|sin-fecha|permanente",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. y un rechazo posterior borra también lo permanente ──");
// ══════════════════════════════════════════════════════════════════════════
{
  // La última palabra del cliente vale, incluso contra un permiso sin plazo.
  es(
    "el rechazo entra",
    await comoMeta(respuesta(false, AHORA + 240, `m_no3_${marca}`)),
    200,
  );
  es("y no queda permiso de ninguna clase", guardado(), "rechazo|sin-fecha|temporal");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 7. los mensajes quedaron todos en el hilo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "se ven las cinco respuestas en la conversación",
    sql(`select count(*) from public.mensajes m
           join public.conversaciones c on c.id = m.conversacion_id
          where c.telefono = '${TEL}';`),
    "7",
  );
}

limpiar();

console.log(
  f === 0
    ? "\nTodo bien: manda la fecha del evento, no el orden de llegada."
    : `\n${f} comprobaciones fallaron.`,
);
process.exit(f === 0 ? 0 : 1);
