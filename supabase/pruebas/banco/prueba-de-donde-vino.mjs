/**
 * Un lead que entra por una pauta, ¿se ve de qué anuncio vino?
 *
 *     node supabase/pruebas/banco/prueba-de-donde-vino.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Que tenga una visualización lo más similar a WhatsApp, por motivos de ventas
 *  y de marketing, que vean de dónde viene esa información cuando entra el
 *  lead.»
 *
 * ============================================================================
 * DE DÓNDE SALE EL DATO
 * ============================================================================
 *
 * Cuando alguien toca un anuncio de Facebook o Instagram que abre WhatsApp,
 * Meta adjunta al mensaje un bloque `referral` con el titular del anuncio, su
 * texto, la miniatura y la dirección de origen.
 *
 * Eso viene en el webhook desde siempre y se guardaba entero en
 * `mensajes.payload` sin que nadie lo leyera. No hace falta activar ningún
 * permiso: si la pauta lleva a WhatsApp, el bloque viene solo.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 *   SE VE EN EL HILO            La tarjeta con el anuncio, arriba del mensaje,
 *                               como la dibuja WhatsApp.
 *   EL HILO GUARDA EL PRIMERO   Quien vino por Pastelería y después toca una
 *                               pauta de Barismo NO cambia de origen: el mérito
 *                               es de la primera. Si se pisara, los números de
 *                               una campaña vieja se moverían solos.
 *   NO ENSUCIA LO QUE ESCRIBIÓ  El texto del mensaje es lo que la persona dijo;
 *                               el anuncio va aparte.
 *   Y MARKETING PUEDE CONTAR    Agrupar por campaña es la mitad del pedido.
 *
 * Necesita el banco armado (`armar.sh`), la aplicación en 3142 y la migración
 * 20261026120000_de_donde_vino_el_lead.sql.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `origen-${process.pid}-${Math.random()}.sql`);
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

if (
  sql(`select count(*) from information_schema.columns
        where table_name = 'conversaciones' and column_name = 'origen';`) !== "1"
) {
  console.error("Falta la columna. Corré 20261026120000_de_donde_vino_el_lead.sql.");
  process.exit(1);
}

const TEL = "50377600123";
const PASTELERIA = "Diplomado de Pastelería 2026";
const BARISMO = "Curso de Barismo — segunda pauta";
const LO_QUE_ESCRIBIO = "Hola, vi el anuncio y quiero información";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.contactos_canal where cliente_id in
      (select id from public.clientes where telefono = '${TEL}');
    delete from public.oportunidades where cliente_id in
      (select id from public.clientes where telefono = '${TEL}');
    delete from public.clientes where telefono = '${TEL}';
  `);
limpiar();

// ── el webhook, firmado como lo firma Meta ────────────────────────────────
const SECRETO = "secreto-de-prueba";
const mandarAlWebhook = async (mensaje) => {
  const cuerpo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "222",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "000000000000000" },
              contacts: [{ wa_id: TEL, profile: { name: "Vino De Pauta" } }],
              messages: [mensaje],
            },
          },
        ],
      },
    ],
  });
  const firma =
    "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");

  const r = await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body: cuerpo,
  });
  return r.status;
};

const anuncioDe = (titular, id) => ({
  source_url: `https://fb.me/${id}`,
  source_type: "ad",
  source_id: id,
  headline: titular,
  body: "Inscripciones abiertas",
  media_type: "image",
  image_url: "https://example.test/miniatura.jpg",
  ctwa_clid: `clid-${id}`,
});

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. ENTRA EL LEAD DESDE LA PAUTA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const estado = await mandarAlWebhook({
    id: "wamid.PAUTA1",
    from: TEL,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: LO_QUE_ESCRIBIO },
    referral: anuncioDe(PASTELERIA, "6001"),
  });
  es("el webhook lo recibe", estado, 200);
  await new Promise((ok) => setTimeout(ok, 1200));

  es(
    "SE GUARDÓ DE QUÉ ANUNCIO VINO",
    sql(`select origen ->> 'titular' from public.mensajes
          where wa_id = 'wamid.PAUTA1';`),
    PASTELERIA,
  );
  es(
    "con su campaña, que es por lo que agrupa marketing",
    sql(`select origen ->> 'campana' from public.mensajes where wa_id = 'wamid.PAUTA1';`),
    "6001",
  );
  es(
    "Y EL HILO TAMBIÉN LO GUARDA",
    sql(`select origen ->> 'titular' from public.conversaciones where telefono = '${TEL}';`),
    PASTELERIA,
  );
  /*
   * El texto es lo que la persona escribió, y nada más.
   *
   * Pegarle el titular del anuncio seria ponerle en la boca algo que no dijo, y
   * quien abra el hilo mañana no tendria como saber cual de las dos frases fue
   * suya.
   */
  es(
    "y el texto sigue siendo lo que ESCRIBIÓ, sin el anuncio pegado",
    sql(`select texto from public.mensajes where wa_id = 'wamid.PAUTA1';`),
    LO_QUE_ESCRIBIO,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. UNA SEGUNDA PAUTA NO LE ROBA EL MÉRITO A LA PRIMERA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La regla que sostiene los números de marketing. Si el hilo se quedara con el
// ÚLTIMO anuncio, los leads de una campaña de marzo se irían mudando solos a
// las campañas de agosto y ningún reporte se podría leer.
{
  await mandarAlWebhook({
    id: "wamid.PAUTA2",
    from: TEL,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: "Ahora vi el de barismo" },
    referral: anuncioDe(BARISMO, "6002"),
  });
  await new Promise((ok) => setTimeout(ok, 1200));

  es(
    "el mensaje nuevo guarda SU anuncio",
    sql(`select origen ->> 'titular' from public.mensajes where wa_id = 'wamid.PAUTA2';`),
    BARISMO,
  );
  es(
    "PERO EL HILO SIGUE SIENDO DE LA PRIMERA CAMPAÑA",
    sql(`select origen ->> 'titular' from public.conversaciones where telefono = '${TEL}';`),
    PASTELERIA,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. MARKETING PUEDE CONTAR POR CAMPAÑA ──");
// ══════════════════════════════════════════════════════════════════════════
//
// La otra mitad del pedido: no sólo verlo en el hilo, sino poder preguntar
// cuántos leads trajo cada anuncio.
{
  es(
    "se puede agrupar por campaña",
    sql(`select campana || '=' || cuantos from (
           select origen ->> 'campana' as campana, count(*) as cuantos
             from public.conversaciones
            where origen is not null and telefono = '${TEL}'
            group by 1
         ) t;`),
    "6001=1",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y SE VE EN EL HILO, COMO EN WHATSAPP ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const subDe = (a) =>
    JSON.parse(
      Buffer.from(
        fs.readFileSync(`/home/user/lesartsculinaires/supabase/pruebas/banco/${a}`, "utf8")
          .trim()
          .split(".")[1],
        "base64url",
      ).toString(),
    ).sub;
  const jwt = fs
    .readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8")
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
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));

  try {
    await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
    await p.waitForTimeout(3000);
    await p.locator('aside button[data-mod="Inbox"]').click();
    await p.waitForTimeout(3000);
    await p.getByPlaceholder(/Buscar/).first().fill("Vino De Pauta");
    await p.waitForTimeout(1800);
    await p.locator('button.row:has-text("Vino De Pauta")').first().click();
    await p.waitForTimeout(3500);
    await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/origen-hilo.png" });

    // Se lee DENTRO del hilo, no en la pantalla entera: el resumen de la lista
    // también muestra texto y haría pasar esto en verde sin la tarjeta.
    const enElHilo = (await p.locator("[data-hilo]").innerText()).replace(/\s+/g, " ");

    es("LA TARJETA DICE QUE VINO DE UN ANUNCIO", /Vino de un anuncio/i.test(enElHilo), true);
    es("Y CUÁL ERA", enElHilo.includes(PASTELERIA), true);
    es("el segundo anuncio también se ve en su mensaje", enElHilo.includes(BARISMO), true);
    es("y lo que escribió sigue estando", enElHilo.includes(LO_QUE_ESCRIBIO), true);

    // La tarjeta lleva al anuncio, para poder ir a verlo.
    es(
      "la tarjeta enlaza al anuncio",
      await p.locator('[data-hilo] a[href="https://fb.me/6001"]').count(),
      1,
    );

    es("sin errores en la página", errores, []);
  } finally {
    await ctx.close();
    await nav.close();
  }
}

limpiar();
es(
  "no quedó basura",
  sql(`select count(*) from public.conversaciones where telefono = '${TEL}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
