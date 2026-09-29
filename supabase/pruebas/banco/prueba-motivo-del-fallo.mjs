/**
 * Por qué no llegó: el motivo se guarda, y el que se perdió se rescata.
 *
 *     node supabase/pruebas/banco/prueba-motivo-del-fallo.mjs
 *
 * ============================================================================
 * LO QUE VIO LA ESCUELA
 * ============================================================================
 *
 *     24 no llegaron — esto contestó Meta
 *     24×  Meta no dijo por qué. Es un envío anterior a que el CRM lo guardara.
 *
 * Y la explicación era falsa: el motivo de un fallo AL MANDAR se guarda desde
 * el primer día de los envíos masivos. Lo que pasaba era otra cosa.
 *
 * Son dos familias de fallo y sólo una pasaba por el envío:
 *
 *   AL MANDAR   Meta rechaza en el momento. `mandarTanda` recibe el error y lo
 *               guarda. Ése nunca se perdió.
 *
 *   DESPUÉS     Meta ACEPTA el mensaje —el destinatario queda «enviado», con su
 *               identificador— y más tarde avisa por el webhook de estados que
 *               no se pudo entregar. `acusarEnvio` guardaba el estado nuevo y
 *               tiraba el motivo.
 *
 * Es justo la familia que más pesa en una campaña grande: escribirle a una base
 * vieja significa escribirle a números que ya no existen, y eso Meta no lo sabe
 * hasta que lo intenta.
 *
 * ============================================================================
 * Y LO QUE YA PASÓ
 * ============================================================================
 *
 * No se perdió del todo. El mismo acuse escribe `mensajes.error`, y la copia
 * que el envío deja en el hilo de cada persona lleva el MISMO identificador, así
 * que el motivo está en la base a un cruce de distancia. La pantalla lo rescata
 * al leer: sin correr nada en Supabase y sin apretar ningún botón.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";
const TEL_A = "50377" + String(Date.now()).slice(-6);
const TEL_B = "50366" + String(Date.now()).slice(-6);

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-motivo-${process.pid}-${Math.random()}.sql`);
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
    delete from public.envio_destinatarios where envio_id in
      (select id from public.envios where nombre like 'PRUEBA motivo%');
    delete from public.envios where nombre like 'PRUEBA motivo%';
    delete from public.mensajes where wa_id like 'wamid.MOTIVO%';
    delete from public.conversaciones where telefono in ('${TEL_A}', '${TEL_B}');
    delete from public.clientes where nombre like 'Motivo %';
  `);
};
limpiar();

/*
 * Una campaña con dos destinatarios, los dos ya aceptados por Meta.
 *
 *   A  va a fallar AHORA, por el webhook. Es el arreglo hacia adelante.
 *   B  ya está fallido y sin motivo, como los 24 de la escuela. Lo único que
 *      tiene es la copia en el hilo con el error escrito. Es el rescate.
 */
const WA_A = "wamid.MOTIVO.A." + Date.now();
const WA_B = "wamid.MOTIVO.B." + Date.now();

sql(`
  insert into public.clientes (nombre, telefono) values
    ('Motivo Uno', '${TEL_A}'), ('Motivo Dos', '${TEL_B}');

  insert into public.envios (nombre, plantilla_nombre, cuerpo, estado, empezado_en)
  values ('PRUEBA motivo del fallo', 'prueba_motivo', 'Hola.', 'terminado', now());

  insert into public.envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado, wa_id, enviado_en)
  select e.id, c.id, c.telefono, c.nombre, 'enviado', '${WA_A}', now()
  from public.envios e, public.clientes c
  where e.nombre = 'PRUEBA motivo del fallo' and c.nombre = 'Motivo Uno';

  insert into public.envio_destinatarios (envio_id, cliente_id, telefono, nombre, estado, wa_id, enviado_en, motivo)
  select e.id, c.id, c.telefono, c.nombre, 'fallido', '${WA_B}', now(), null
  from public.envios e, public.clientes c
  where e.nombre = 'PRUEBA motivo del fallo' and c.nombre = 'Motivo Dos';

  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en) values
    ('${TEL_A}', 'Motivo Uno', now()), ('${TEL_B}', 'Motivo Dos', now());

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado)
  select c.id, '${WA_A}', 'saliente', 'text', 'Hola.', 'enviado'
  from public.conversaciones c where c.telefono = '${TEL_A}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, error)
  select c.id, '${WA_B}', 'saliente', 'text', 'Hola.', 'fallido', 'Message undeliverable'
  from public.conversaciones c where c.telefono = '${TEL_B}';
`);

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. META AVISA QUE NO SE PUDO ENTREGAR, Y EL MOTIVO SE GUARDA ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * El acuse tal como lo manda Meta: el estado y, dentro de `errors`, el título.
 * Ese título es lo único que se puede guardar —el código no viaja acá— y era
 * exactamente lo que se estaba tirando.
 */
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
              metadata: { phone_number_id: "111" },
              statuses: [
                {
                  id: WA_A,
                  status: "failed",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: TEL_A,
                  errors: [
                    {
                      code: 131026,
                      title: "Message undeliverable",
                      error_data: { details: "Receiver is incapable of receiving this message" },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex");
  const r = await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  es("el webhook lo aceptó", r.status, 200);
  await new Promise((s) => setTimeout(s, 900));

  es(
    "el destinatario quedó fallido",
    sql(`select estado from public.envio_destinatarios where wa_id='${WA_A}'`),
    "fallido",
  );
  es(
    "Y CON EL MOTIVO QUE DIJO META",
    sql(`select coalesce(motivo,'(nada)') from public.envio_destinatarios where wa_id='${WA_A}'`),
    "Message undeliverable",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. UN ACUSE POSTERIOR NO BORRA EL MOTIVO ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * Meta manda los acuses desordenados. Si un «entregado» viejo llegara después
 * del fallo y escribiera `motivo = null`, la fila se quedaría otra vez sin
 * explicación, que es el problema entero con otra cara.
 */
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
              metadata: { phone_number_id: "111" },
              statuses: [{ id: WA_A, status: "delivered", recipient_id: TEL_A }],
            },
          },
        ],
      },
    ],
  };
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex");
  await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  await new Promise((s) => setTimeout(s, 900));

  es(
    "el motivo sigue ahí",
    sql(`select coalesce(motivo,'(nada)') from public.envio_destinatarios where wa_id='${WA_A}'`),
    "Message undeliverable",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. Y EN LA PANTALLA SE LEE, EN CASTELLANO ──");
// ══════════════════════════════════════════════════════════════════════════

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};

const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: subDe("jwt-jefa.txt"), email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Envíos"]').click();
await p.waitForTimeout(2200);
await p.getByText("PRUEBA motivo del fallo").first().click();
await p.waitForTimeout(1500);
await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/motivo.png" });

{
  const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

  es("dice que no llegaron los dos", /2 no llegaron/.test(dicho), true);
  es(
    "NO DICE YA «Meta no dijo por qué»",
    /Meta no dijo por qué|anterior a que el CRM lo guardara/.test(dicho),
    false,
  );
  es(
    "LO EXPLICA EN CASTELLANO",
    /Ese número no tiene WhatsApp, o ya no lo tiene/.test(dicho),
    true,
  );
  es("y no en inglés crudo", /Message undeliverable/.test(dicho), false);
  /*
   * Los dos en el mismo renglón: uno tenía el motivo guardado y el otro hubo
   * que rescatarlo del hilo. Si el rescate no funcionara, serían dos renglones
   * —uno de ellos el de «no quedó anotado»— y este número sería 1.
   */
  es("Y LOS DOS CUENTAN JUNTOS, O SEA QUE EL RESCATE ANDUVO", /2×/.test(dicho), true);
}

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.envios where nombre like 'PRUEBA motivo%'`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
