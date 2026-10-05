/**
 * Eliminación de datos: borrar lo de Meta, y sólo lo de Meta.
 *
 *     node supabase/pruebas/banco/prueba-eliminar-datos.mjs
 *
 * ============================================================================
 * EL RIESGO ACÁ ES EN LAS DOS DIRECCIONES
 * ============================================================================
 *
 * Este camino SÍ borra, sin vuelta atrás, disparado por un webhook. Así que se
 * puede fallar de dos maneras y las dos son graves:
 *
 *   BORRAR DE MENOS   Alguien pidió que lo borren y queda. Es lo que Meta viene
 *                     a comprobar en la revisión.
 *   BORRAR DE MÁS     Se lleva puesto el historial de otra persona, o la ficha
 *                     comercial de la escuela con datos que no vinieron de
 *                     Meta.
 *
 * Por eso cada caso de abajo tiene las dos mitades: qué desapareció y qué tenía
 * que seguir estando.
 *
 * ============================================================================
 * Y LOS TRES ESTADOS NO SON ADORNO
 * ============================================================================
 *
 *   completada   La ficha que queda llegó también por otro canal: tiene vida
 *                propia y no es dato de Meta.
 *   parcial      Quedó una ficha que existe SÓLO por este contacto. Puede tener
 *                un teléfono, un programa, notas: la decisión de borrarla es de
 *                una persona, no de un webhook.
 *   sin_datos    No había nada. Pasa seguido y no es un error.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const SECRETO = "secreto-de-prueba";

/**
 * Un sufijo distinto en cada corrida, y en TODO lo que se siembra.
 *
 * Los identificadores ya lo tenían; el teléfono y los `wa_id` no, y eran fijos.
 * Una corrida que se interrumpe antes de limpiar dejaba esas filas, y la
 * siguiente chocaba contra el índice único con un error que no habla de nada de
 * esto. Las pruebas tienen que poder repetirse.
 */
const N = String(Date.now()).slice(-7);

const SOLO_IG = "88800000000" + String(Date.now()).slice(-5);
const CON_OTRO_CANAL = "88811111111" + String(Date.now()).slice(-4);
const AJENO = "88822222222" + String(Date.now()).slice(-4);
const PAGO = "88833333333" + String(Date.now()).slice(-4);
const DESCONOCIDO = "88899999999999";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-elim-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

const limpiar = () => {
  sql(`
    delete from public.solicitudes_eliminacion where identificador in
      ('${SOLO_IG}','${CON_OTRO_CANAL}','${AJENO}','${PAGO}','${DESCONOCIDO}');
    delete from public.mensajes where wa_id like 'mid.ELIM.%';
    delete from public.conversaciones where identificador in ('${SOLO_IG}','${CON_OTRO_CANAL}','${AJENO}','${PAGO}');
    delete from public.conversaciones where telefono like '503%${N}';
    delete from public.oportunidades where codigo like 'ELIM-PAGO-%';
    delete from public.clientes where nombre like 'ELIM %';
  `);
};
limpiar();

/*
 * Tres personas, a propósito distintas:
 *
 *   SOLO_IG          Llegó únicamente por Instagram. Su ficha existe por eso.
 *   CON_OTRO_CANAL   Llegó por Instagram Y por WhatsApp. Su ficha tiene vida
 *                    propia, y su hilo de WhatsApp no se puede tocar.
 *   AJENO            No pidió nada. Es el testigo: si algo suyo desaparece, se
 *                    borró de más.
 */
sql(`
  insert into public.clientes (nombre, telefono) values
    ('ELIM Solo Instagram', null),
    ('ELIM Con Dos Canales', '5037${N}'),
    ('ELIM Ajeno', '5038${N}'),
    ('ELIM Pago', null);

  -- quien llegó sólo por Instagram
  insert into public.conversaciones (canal, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'instagram', '${SOLO_IG}', 'Solo IG', c.id, now()
  from public.clientes c where c.nombre='ELIM Solo Instagram';

  insert into public.contactos_canal (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  select c.id, 1, '${SOLO_IG}', now(), now() from public.clientes c where c.nombre='ELIM Solo Instagram';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select v.id, 'mid.ELIM.1${N}', 'entrante', 'text', 'hola, info', 'recibido'
  from public.conversaciones v where v.identificador='${SOLO_IG}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select v.id, 'mid.ELIM.2${N}', 'saliente', 'text', 'te paso precios', 'enviado'
  from public.conversaciones v where v.identificador='${SOLO_IG}';

  -- quien llegó por los dos lados
  insert into public.conversaciones (canal, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'instagram', '${CON_OTRO_CANAL}', 'Dos Canales IG', c.id, now()
  from public.clientes c where c.nombre='ELIM Con Dos Canales';

  insert into public.conversaciones (canal, telefono, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'whatsapp', '5037${N}', '5037${N}', 'Dos Canales WA', c.id, now()
  from public.clientes c where c.nombre='ELIM Con Dos Canales';

  insert into public.contactos_canal (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  select c.id, 1, '${CON_OTRO_CANAL}', now(), now() from public.clientes c where c.nombre='ELIM Con Dos Canales';
  insert into public.contactos_canal (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  select c.id, 3, '5037${N}', now(), now() from public.clientes c where c.nombre='ELIM Con Dos Canales';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select v.id, 'mid.ELIM.WA${N}', 'entrante', 'text', 'esto es de WhatsApp', 'recibido'
  from public.conversaciones v where v.canal='whatsapp' and v.identificador='5037${N}';

  /*
   * Y quien llegó sólo por Instagram PERO PAGÓ.
   *
   * Su ficha es, igual que la de «Solo Instagram», un dato derivado de Meta. La
   * diferencia es que arrastra un registro contable, y eso la escuela lo
   * conserva. Es la única excepción al borrado automático.
   */
  insert into public.conversaciones (canal, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'instagram', '${PAGO}', 'Pago IG', c.id, now()
  from public.clientes c where c.nombre='ELIM Pago';

  insert into public.contactos_canal (cliente_id, canal_id, identificador, primera_vez, ultima_vez)
  select c.id, 1, '${PAGO}', now(), now() from public.clientes c where c.nombre='ELIM Pago';

  insert into public.oportunidades (codigo, cliente_id, venta_cerrada)
  select 'ELIM-PAGO-${N}', c.id, 490.00 from public.clientes c where c.nombre='ELIM Pago';

  -- el testigo
  insert into public.conversaciones (canal, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'instagram', '${AJENO}', 'Ajeno', c.id, now()
  from public.clientes c where c.nombre='ELIM Ajeno';

  /*
   * Y LA COLISIÓN: un hilo de WhatsApp de otra persona cuyo identificador es el
   * MISMO TEXTO que el IGSID que se va a borrar.
   *
   * Es raro y es posible —los dos son números largos y no comparten espacio de
   * nombres— y es exactamente lo que el filtro por canal existe para evitar.
   * Sin este caso la prueba se veía bien y no probaba nada: quitando el filtro
   * seguía pasando.
   */
  insert into public.conversaciones (canal, telefono, identificador, nombre_perfil, cliente_id, ultimo_mensaje_en)
  select 'whatsapp', '${SOLO_IG}', '${SOLO_IG}', 'Homonimo WhatsApp', c.id, now()
  from public.clientes c where c.nombre='ELIM Ajeno';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select v.id, 'mid.ELIM.HOMONIMO${N}', 'entrante', 'text', 'soy otra persona', 'recibido'
  from public.conversaciones v where v.canal='whatsapp' and v.identificador='${SOLO_IG}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select v.id, 'mid.ELIM.AJENO${N}', 'entrante', 'text', 'no pedí nada', 'recibido'
  from public.conversaciones v where v.identificador='${AJENO}';
`);

// ── la aplicación ──────────────────────────────────────────────────────────

const parar = (puerto) => {
  try {
    execSync(`fuser -k ${puerto}/tcp 2>/dev/null || true`, { shell: "/bin/bash" });
  } catch {
    // No estaba levantado.
  }
  for (let i = 0; i < 20; i++) {
    const ocupado = execSync(`fuser ${puerto}/tcp 2>/dev/null || true`, {
      encoding: "utf8",
      shell: "/bin/bash",
    }).trim();
    if (!ocupado) return;
    execSync("sleep 1");
  }
};

parar(3142);
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-elim.log 2>&1 < /dev/null &)`, {
  shell: "/bin/bash",
});
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
    if (code === "200") {
      vivo = true;
      break;
    }
    execSync("sleep 1");
  }
  if (!vivo) throw new Error("La aplicación no levantó en el 3142.");
}

const firmar = (datos, secreto = SECRETO) => {
  const contenido = Buffer.from(JSON.stringify(datos)).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto).update(contenido).digest("base64url");
  return `${firma}.${contenido}`;
};

const pedirBorrado = (igsid, secreto = SECRETO) => {
  const salida = execSync(
    `curl -s --noproxy '*' -w '\\n%{http_code}' -X POST http://127.0.0.1:3142/api/meta/data-deletion ` +
      `-H 'content-type: application/x-www-form-urlencoded' ` +
      `--data-urlencode 'signed_request=${firmar({ user_id: igsid }, secreto)}'`,
    { encoding: "utf8", shell: "/bin/bash", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
  const lineas = salida.split("\n");
  const code = lineas.pop();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(lineas.join("\n"));
  } catch {
    cuerpo = lineas.join("\n");
  }
  return { code, cuerpo };
};

const paginaDe = (codigo) =>
  execSync(
    `curl -s --noproxy '*' 'http://127.0.0.1:3142/eliminacion?codigo=${codigo}'`,
    { encoding: "utf8", shell: "/bin/bash", maxBuffer: 10 * 1024 * 1024 },
  ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. SIN FIRMA VÁLIDA NO SE BORRA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = pedirBorrado(SOLO_IG, "secreto-equivocado");
  es("SE RECHAZA", r.code, "401");
  es(
    "Y LA CONVERSACIÓN SIGUE ENTERA",
    sql(`select count(*) from public.conversaciones
         where canal='instagram' and identificador='${SOLO_IG}'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. META RECIBE LO QUE PIDE: URL Y CÓDIGO ──");
// ══════════════════════════════════════════════════════════════════════════
let codigoSoloIg = null;
{
  const r = pedirBorrado(SOLO_IG);
  es("contesta bien", r.code, "200");
  es("CON CÓDIGO DE CONFIRMACIÓN", typeof r.cuerpo?.confirmation_code === "string", true);
  es(
    "y con una URL que lleva a la página de estado, con ese código",
    String(r.cuerpo?.url ?? "").includes(`/eliminacion?codigo=${r.cuerpo?.confirmation_code}`),
    true,
  );
  codigoSoloIg = r.cuerpo?.confirmation_code ?? null;
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. SE BORRÓ LO DE INSTAGRAM, Y LA FICHA QUEDÓ SEÑALADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "la conversación desapareció",
    sql(`select count(*) from public.conversaciones
         where canal='instagram' and identificador='${SOLO_IG}'`),
    "0",
  );
  es(
    "Y SUS MENSAJES TAMBIÉN, por la cascada",
    sql(`select count(*) from public.mensajes where wa_id in ('mid.ELIM.1${N}','mid.ELIM.2${N}')`),
    "0",
  );
  es(
    "y la anotación de que llegó por Instagram",
    sql(`select count(*) from public.contactos_canal where identificador='${SOLO_IG}'`),
    "0",
  );
  es(
    "Y EL HILO DE WHATSAPP CON EL MISMO IDENTIFICADOR SIGUE INTACTO",
    sql(`select count(*) from public.conversaciones where canal='whatsapp' and identificador='${SOLO_IG}'`),
    "1",
  );
  es(
    "con su mensaje, que es de otra persona",
    sql(`select count(*) from public.mensajes where wa_id='mid.ELIM.HOMONIMO${N}'`),
    "1",
  );
  es(
    "Y LA FICHA TAMBIÉN, porque existía sólo por este contacto",
    sql(`select count(*) from public.clientes where nombre='ELIM Solo Instagram'`),
    "0",
  );
  es(
    "el pedido quedó COMPLETADA: no queda nada que decidir",
    sql(`select estado from public.solicitudes_eliminacion where codigo_confirmacion='${codigoSoloIg}'`),
    "completada",
  );
  es(
    "con la ficha borrada anotada en el detalle",
    sql(`select detalle ? 'fichas_borradas' from public.solicitudes_eliminacion
         where codigo_confirmacion='${codigoSoloIg}'`),
    "t",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. LA PÁGINA DE ESTADO CONTESTA, Y NO CUENTA DE MÁS ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * La abre alguien de afuera con el código que le dio Facebook. Tiene que decir
 * qué pasó y NO tiene que publicar las notas internas, que hablan de números de
 * ficha de nuestro sistema.
 */
{
  const pagina = paginaDe(codigoSoloIg);
  es("dice que se eliminaron sus datos", /tus datos fueron eliminados/i.test(pagina), true);
  es("muestra el código", pagina.includes(codigoSoloIg), true);
  es(
    "Y NO PUBLICA EL NÚMERO DE FICHA INTERNO",
    /fichas_por_decidir|ficha \d+/i.test(pagina),
    false,
  );

  const inventado = paginaDe("AAAAAAAAAAAA");
  es("un código que no existe se dice así", /No encontramos ninguna solicitud/i.test(inventado), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. CON OTRO CANAL: SE BORRA LO DE META Y NADA MÁS ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = pedirBorrado(CON_OTRO_CANAL);
  es("contesta bien", r.code, "200");

  es(
    "el hilo de Instagram se fue",
    sql(`select count(*) from public.conversaciones where identificador='${CON_OTRO_CANAL}'`),
    "0",
  );
  es(
    "EL DE WHATSAPP SIGUE INTACTO, que no es dato de Meta",
    sql(`select count(*) from public.conversaciones where canal='whatsapp' and identificador='5037${N}'`),
    "1",
  );
  es(
    "y su mensaje también",
    sql(`select count(*) from public.mensajes where wa_id='mid.ELIM.WA${N}'`),
    "1",
  );
  es(
    "la anotación de Instagram se fue",
    sql(`select count(*) from public.contactos_canal where identificador='${CON_OTRO_CANAL}'`),
    "0",
  );
  es(
    "PERO LA DE WHATSAPP NO",
    sql(`select count(*) from public.contactos_canal where identificador='5037${N}'`),
    "1",
  );
  es(
    "y el pedido quedó COMPLETADA: la ficha tiene vida propia",
    sql(`select estado from public.solicitudes_eliminacion where identificador='${CON_OTRO_CANAL}'`),
    "completada",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5b. PERO SI PAGÓ, LA FICHA NO SE BORRA SOLA ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Es la única excepción, y existe porque borrar una ficha arrastra veinte
 * tablas —entre ellas los cobros, los cursos cursados y las autorizaciones—.
 * Eso no es dato de Meta: es lo que la escuela tiene que conservar por
 * contabilidad, y un webhook no puede decidir destruirlo.
 */
{
  const r = pedirBorrado(PAGO);
  es("contesta bien", r.code, "200");

  es(
    "lo de Instagram se borró igual",
    sql(`select count(*) from public.conversaciones where canal='instagram' and identificador='${PAGO}'`),
    "0",
  );
  es(
    "PERO LA FICHA SE CONSERVA",
    sql(`select count(*) from public.clientes where nombre='ELIM Pago'`),
    "1",
  );
  es(
    "y su venta cerrada también",
    sql(`select count(*) from public.oportunidades where codigo='ELIM-PAGO-${N}'`),
    "1",
  );
  es(
    "el pedido queda PARCIAL, que es lo que pide una decisión",
    sql(`select estado from public.solicitudes_eliminacion where identificador='${PAGO}'`),
    "parcial",
  );
  es(
    "Y SE DICE POR QUÉ, no queda como un fallo",
    sql(`select notas from public.solicitudes_eliminacion where identificador='${PAGO}'`)
      .includes("rastro comercial"),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. EL TESTIGO: A QUIEN NO PIDIÓ NADA NO SE LE TOCA NADA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "SU CONVERSACIÓN SIGUE AHÍ",
    sql(`select count(*) from public.conversaciones where identificador='${AJENO}'`),
    "1",
  );
  es(
    "y su mensaje",
    sql(`select count(*) from public.mensajes where wa_id='mid.ELIM.AJENO${N}'`),
    "1",
  );
  es(
    "y su ficha",
    sql(`select count(*) from public.clientes where nombre='ELIM Ajeno'`),
    "1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 7. UNO QUE NO CONOCEMOS: «sin_datos», que no es un error ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const r = pedirBorrado(DESCONOCIDO);
  es("contesta bien igual", r.code, "200");
  es("con su código", typeof r.cuerpo?.confirmation_code === "string", true);
  es(
    "Y QUEDA ANOTADO COMO sin_datos",
    sql(`select estado from public.solicitudes_eliminacion where identificador='${DESCONOCIDO}'`),
    "sin_datos",
  );
  es(
    "la página lo dice sin asustar",
    /No teníamos datos tuyos/i.test(paginaDe(r.cuerpo?.confirmation_code)),
    true,
  );
}

limpiar();
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
