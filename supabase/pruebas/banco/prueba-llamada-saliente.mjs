/**
 * La llamada SALIENTE: de «Llamar» hasta que la respuesta de Meta abre el audio.
 *
 *     node supabase/pruebas/banco/prueba-llamada-saliente.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Analiza si nosotros podemos hacer llamadas a los clientes desde WhatsApp
 * API y que salga el botón de llamar cuando ya haya aceptado el cliente la
 * solicitud de que le podemos llamar. Ya hicimos la prueba de recibir
 * llamadas; el punto es poder hacer llamadas a clientes.»
 *
 * ============================================================================
 * QUÉ SE PRUEBA ACÁ Y QUÉ NO, QUE ES LA MITAD DEL VALOR DE ESTE ARCHIVO
 * ============================================================================
 *
 * El camino de una saliente tiene tres tramos y sólo dos son nuestros:
 *
 *   1. NAVEGADOR → SERVIDOR    Pide el micrófono, arma la oferta, la manda.
 *   2. SERVIDOR  → META        `POST /<numero>/calls` con `action: connect`.
 *   3. META      → WEBHOOK     Devuelve su respuesta, que se pega en la fila
 *                              y viaja al navegador, que abre el audio.
 *
 * El tramo 2 NO se prueba acá: es una llamada de verdad a los servidores de
 * Meta, con el token y el número de la escuela, y termina haciendo sonar el
 * teléfono de una persona. Lo que sí se prueba —y es donde estaba el
 * problema— son los tramos 1 y 3: que la tarjeta aparezca al marcar, que la
 * respuesta que devuelve Meta llegue al navegador por la fila, y que al
 * colgar desaparezca de todas las pantallas.
 *
 * Para eso el tramo 2 se imita escribiendo la fila igual que la escribe
 * `llamarA` después de que Meta contesta, y después mandándole al webhook el
 * aviso que Meta manda. Todo lo demás es el código de producción.
 *
 * ----------------------------------------------------------------------------
 * Y ESTO ES LO QUE ATRAPA EL AGUJERO QUE HABÍA
 * ----------------------------------------------------------------------------
 *
 * `llamarA` escribía la fila y se tragaba el error si fallaba. Sin fila, el
 * `update` del webhook no encuentra nada y la respuesta de Meta se cae en el
 * vacío: al cliente le suena el teléfono y atiende, y del lado del CRM la
 * tarjeta se queda en «llamando…» para siempre, sin audio y sin explicación.
 * El paso 4 comprueba que sin fila la respuesta no se aplica en ningún lado,
 * que es lo que hace que valga la pena que ese error ahora se diga.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142, con las
 * variables de WhatsApp en el `.env.local` del banco: sin ellas el CRM
 * esconde el botón de llamar a propósito.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `sal-${process.pid}-${Math.random()}.sql`);
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

if (sql("select count(*) from information_schema.tables where table_name='llamadas';") !== "1") {
  console.error("Falta la tabla. Corré 20261017120000_llamadas.sql.");
  process.exit(1);
}

const TEL = "50370777123";
const QUIEN = "Saliente Prueba";
const CALL = "wacid.SALIENTE." + Date.now();
const CALL_HUERFANA = "wacid.HUERFANA." + Date.now();

/*
 * Un SDP de mentira, pero con la forma justa.
 *
 * No tiene que servir para abrir audio —no hay nadie del otro lado— pero sí
 * tiene que ser lo que el navegador recibe: el código mira `sdp_tipo` para
 * decidir si es una respuesta a nuestra oferta, y la prueba mira la fila.
 */
const SDP_DE_META = "v=0\\r\\no=- 1 1 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\nm=audio 1 UDP/TLS/RTP/SAVPF 111\\r\\n";

const limpiar = () => {
  sql(`
    delete from public.llamadas where call_id in ('${CALL}', '${CALL_HUERFANA}');
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.oportunidades where codigo = 'SAL-0001';
    delete from public.clientes where nombre = '${QUIEN}';
  `);
};
limpiar();

// La conversación es de Ale, y quien mira la pantalla es Ale: una saliente
// sólo la ve quien la marcó.
sql(`
  insert into public.clientes (nombre, telefono) values ('${QUIEN}', '${TEL}');

  insert into public.oportunidades (codigo, cliente_id, vendedor_id, etapa_id, fecha_registro)
  select 'SAL-0001', c.id, 901, (select id from public.etapas order by orden limit 1), current_date
    from public.clientes c where c.nombre = '${QUIEN}';

  insert into public.conversaciones (telefono, nombre_perfil, cliente_id, vendedor_id, ultimo_mensaje_en)
  select '${TEL}', '${QUIEN}', c.id, 901, now()
    from public.clientes c where c.nombre = '${QUIEN}';

  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select v.id, 'wamid.SAL1', 'entrante', 'text', 'Buenas, me llaman?', now()
    from public.conversaciones v where v.telefono = '${TEL}';
`);

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const ALE = subDe("jwt-ale.txt");
const jwt = fs
  .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-ale.txt", "utf8")
  .trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt,
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: "x",
      user: { id: ALE, email: "ale@lac.test" },
    }),
  ).toString("base64");

/** El aviso que manda Meta cuando contesta a una llamada que empezamos. */
async function metaResponde(callId) {
  const carga = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "222",
        changes: [
          {
            field: "calls",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "111" },
              calls: [
                {
                  id: callId,
                  to: TEL,
                  from: "111",
                  event: "connect",
                  direction: "BUSINESS_INITIATED",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  session: { sdp_type: "answer", sdp: SDP_DE_META },
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
  await new Promise((s) => setTimeout(s, 900));
  return r.status;
}

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const ctx = await nav.newContext({
  viewport: { width: 1500, height: 1050 },
  permissions: ["microphone"],
});
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/saliente-${n}.png` });

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);

const tarjeta = () => p.locator('[aria-label="Llamada de WhatsApp"]');

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. la fila que escribe `llamarA` hace aparecer la tarjeta ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Es el estado en que queda el CRM justo después de que Meta acepta el
// `connect`: fila «sonando», ya asignada a quien marcó, todavía sin respuesta.
sql(`
  insert into public.llamadas
    (call_id, conversacion_id, telefono, vendedor_id, nombre, direccion, estado,
     atendida_por, atendida_en)
  select '${CALL}', v.id, '${TEL}', 901, '${QUIEN}', 'saliente', 'sonando',
         '${ALE}', now()
    from public.conversaciones v where v.telefono = '${TEL}';
`);
await p.waitForTimeout(4500);

es("APARECE SOLA, SIN RECARGAR", await tarjeta().count(), 1);
{
  const t = (await tarjeta().innerText()).replace(/\s+/g, " ");
  /*
   * «Llamando…», no «En llamada».
   *
   * Es la diferencia que estaba mal: la fila nace con `atendidaPor` puesto
   * —quien marcó ya la está atendiendo— y eso la hacía caer en la rama de «ya
   * la agarró alguien», así que la tarjeta decía que ya se estaba hablando
   * mientras al cliente recién le sonaba el teléfono.
   */
  es("DICE QUE ESTÁ LLAMANDO", /Llamando/.test(t), true);
  es("y NO que ya está en llamada", /En llamada/.test(t), false);
  // Y tampoco el aviso de las entrantes sin audio: en una saliente todavía no
  // hay SDP del otro lado y es lo normal.
  es("sin el aviso de «no mandó los datos de audio»", /no mandó los datos de audio/.test(t), false);
  es("con el botón de colgar", /Colgar|Cortar/.test(t), true);
  // La saliente no se «atiende»: la atiende el otro.
  es("y SIN botón de contestar", /Contestar|Atender/.test(t), false);
}
await foto("1-llamando");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LA RESPUESTA DE META LLEGA HASTA LA FILA ──");
// ══════════════════════════════════════════════════════════════════════════
es("el webhook la aceptó", await metaResponde(CALL), 200);

es(
  "EL SDP QUEDÓ PEGADO A LA LLAMADA",
  sql(`select case when sdp_remoto is not null then 'sí' else 'no' end
         from public.llamadas where call_id = '${CALL}';`),
  "sí",
);
es(
  "marcado como respuesta, que es lo que el navegador espera",
  sql(`select coalesce(sdp_tipo,'(vacío)') from public.llamadas where call_id = '${CALL}';`),
  "answer",
);
es(
  "y la llamada pasó a en curso",
  sql(`select estado from public.llamadas where call_id = '${CALL}';`),
  "en_curso",
);

await p.waitForTimeout(4500);
es("la tarjeta sigue en pantalla", await tarjeta().count(), 1);
await foto("2-en-curso");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. al colgar desaparece ──");
// ══════════════════════════════════════════════════════════════════════════
sql(`update public.llamadas set estado = 'terminada' where call_id = '${CALL}';`);
await p.waitForTimeout(4500);
es("SE FUE DE LA PANTALLA", await tarjeta().count(), 0);
await foto("3-colgada");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. sin fila, la respuesta de Meta no se aplica en ningún lado ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Es el agujero que tenía `llamarA` cuando se tragaba el error del insert.
// Meta contesta con toda normalidad —el teléfono del cliente ya sonó— y el
// `update` del webhook no encuentra a quién pegárselo.
es("el webhook contesta igual, sin romperse", await metaResponde(CALL_HUERFANA), 200);
es(
  "PERO NO HAY DÓNDE GUARDAR LA RESPUESTA",
  sql(`select count(*) from public.llamadas where call_id = '${CALL_HUERFANA}';`),
  "0",
);
es("y la pantalla no muestra nada", await tarjeta().count(), 0);

es("sin errores en la página", errores, []);

await nav.close();
limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.llamadas where call_id in ('${CALL}','${CALL_HUERFANA}');`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
