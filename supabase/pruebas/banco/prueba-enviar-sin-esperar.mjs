/**
 * Al apretar Enviar, ¿se ve el mensaje enseguida, y sale UNA sola vez?
 *
 *     node supabase/pruebas/banco/prueba-enviar-sin-esperar.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * Desde el 11 de septiembre de 2026 hay mensajes duplicados en la bandeja —los
 * mandaron Raquel, Katya y Alexandra, o sea Gerencia, Jefatura y Ventas: no es
 * cosa de un rol—. Dos ejemplos, con `wamid` distinto cada uno, que es la
 * prueba de que WhatsApp aceptó dos envíos y no de que la pantalla dibujó dos
 * veces:
 *
 *     3 de octubre   Alexandra   el mismo texto TRES veces, con 5,3 y 5,7
 *                                segundos entre una y otra
 *     8 de octubre   Alexandra   tres veces, a las 12:21, 12:22 y 12:22
 *
 * Esos intervalos de ~5 segundos son la pista: es alguien apretando Enter cada
 * vez que pasan cinco segundos sin ver que nada cambie. La lentitud es la causa
 * y el duplicado es la consecuencia.
 *
 * ============================================================================
 * DE DÓNDE SALÍAN LOS SEGUNDOS
 * ============================================================================
 *
 * De dos esperas una detrás de otra. Primero la acción del servidor, que le
 * pedía a la base tres cosas SEGUIDAS —buscar el hilo, guardar, actualizar—. Y
 * después el refresco completo que `enviar` pedía al volver, recién tras lo cual
 * aparecía la burbuja. Con la base como la dejó la tarde del 8 de octubre, a
 * 1,1 s por consulta de promedio y 4,4 de p95, son entre cinco y ocho segundos
 * en los que NADA cambia en pantalla: el texto sigue en el recuadro.
 *
 * (Se sospechó de `revalidatePath("/")` y se midió: la respuesta de la acción
 * llega sin la portada armada con esa línea y sin ella. No era lo caro. Esta
 * prueba no la fija por eso: una comprobación que no se puede poner en rojo no
 * comprueba nada.)
 *
 * ============================================================================
 * LO QUE ESTA PRUEBA EXIGE, TODO A LA VEZ
 * ============================================================================
 *
 *   SE VE AL INSTANTE   La burbuja aparece apenas se aprieta Enter, sin esperar
 *                       a ninguna consulta, y el recuadro queda vacío. Mientras
 *                       el servidor no confirma dice «enviando».
 *
 *   SALE UNA VEZ        Tres Enter y un clic seguidos, con la base lenta,
 *                       dejan UN mensaje en la base y UNA burbuja en pantalla.
 *
 *   NO HAY DOBLE BURBUJA La burbuja que se dibujó al instante y la que llega
 *                       del servidor son la misma. Ver dos sería exactamente el
 *                       síntoma que se viene a curar, aunque en la base hubiera
 *                       una sola.
 *
 *   SI FALLA, SE DEVUELVE  Un envío que no sale NO se traga el texto: vuelve al
 *                       recuadro con el motivo, y la burbuja se retira.
 *
 *   PERO SI SALIÓ, NO   Si WhatsApp aceptó el mensaje y lo que falló fue
 *                       anotarlo en la base, el texto NO vuelve: el cliente ya
 *                       lo tiene, y tenerlo a mano es una invitación a mandarlo
 *                       otra vez.
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const PROXY = "http://127.0.0.1:3141";
const LOG = `${BANCO}/pxv.log`;

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, {
    encoding: "utf8",
  })
    .split("\n")
    .find((l) => l.trim() !== "")
    ?.trim() ?? "";

/** SQL con `$$` adentro: va por archivo, porque el shell los reemplaza. */
const sqlArchivo = (contenido) => {
  const ruta = `/tmp/enviar-sin-esperar-${process.pid}.sql`;
  fs.writeFileSync(ruta, contenido);
  fs.chmodSync(ruta, 0o644);
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f ${ruta}"`, { encoding: "utf8" });
  fs.rmSync(ruta, { force: true });
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const lentitud = (ms) => fetch(`${PROXY}/__lento?ms=${ms}`, { method: "POST" });
const marca = () => (fs.existsSync(LOG) ? fs.statSync(LOG).size : 0);
const tablasDesde = (m) =>
  new Set(
    fs
      .readFileSync(LOG, "utf8")
      .slice(m)
      .split("\n")
      .filter((l) => l.startsWith("REST /"))
      .map((l) => l.slice(6).split("?")[0]),
  );

// ── un hilo de WhatsApp al que contestar, entrando por el webhook como entran ──
const TEL = "50377" + String(Date.now()).slice(-6);
const NOMBRE = "Envio Sin Esperar";
const crudo = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "222", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "111" },
    contacts: [{ profile: { name: NOMBRE }, wa_id: TEL }],
    messages: [{ from: TEL, id: "wamid." + crypto.randomUUID(),
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text",
      text: { body: "Hola, quiero informacion" } }],
  } }] }],
});
await fetch(`${APP}/api/whatsapp/webhook`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-signature-256":
      "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex"),
  },
  body: crudo,
});
await new Promise((s) => setTimeout(s, 1000));
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
if (!conv) {
  console.log("✗ no se pudo sembrar el hilo");
  process.exit(1);
}

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: jwt, token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript(
  (h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toISOString().slice(0, 10),
);
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

const caja = () => p.locator("main textarea").first();
const burbujas = (texto) => p.locator(`[data-hilo] >> text=${texto}`);
const enBase = (texto) =>
  Number(sql(`select count(*) from mensajes where conversacion_id=${conv} and direccion='saliente' and texto='${texto}'`));

/** Lo que dice la fila de ese mensaje en el hilo, o null si todavía no está. */
const filaDe = (texto) =>
  p.evaluate((t) => {
    const f = [...document.querySelectorAll("[data-hilo] > div")].find((d) => d.innerText.includes(t));
    return f ? f.innerText.replace(/\s+/g, " ") : null;
  }, texto);

async function abrirElHilo() {
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("button.row", { hasText: NOMBRE }).first().click();
  await p.waitForTimeout(1500);
  await caja().waitFor({ state: "visible", timeout: 15000 });
}

// Una base cargada, como la de las tardes: cada consulta tarda 700 ms.
const LENTA = 700;

try {
  await lentitud(0);
  await abrirElHilo();

  // ══════════════════════════════════════════════════════════════════════════
  console.log(`── 1. SE VE AL INSTANTE, aunque la base tarde ${LENTA} ms por consulta ──`);
  // ══════════════════════════════════════════════════════════════════════════
  {
    const TEXTO = "UNO " + crypto.randomUUID().slice(0, 8);
    await caja().fill(TEXTO);
    await lentitud(LENTA);

    const m0 = marca();
    const t0 = Date.now();
    await caja().press("Enter");

    // El recuadro tiene que vaciarse y la burbuja aparecer SIN esperar a nada.
    await p.waitForFunction(
      (t) => (document.querySelector("main textarea")?.value ?? "x") === "" &&
             document.body.innerText.includes(t),
      TEXTO,
      { timeout: 30000, polling: 20 },
    );
    const tardo = Date.now() - t0;
    const tablasAntes = tablasDesde(m0);
    console.log(`   (burbuja y recuadro vacío a los ${tardo} ms)`);

    /*
     * 0,7 segundos de base por consulta y, con el arreglo, la burbuja sale en
     * lo que tarda el navegador en dibujar: décimas. Se pide menos de lo que
     * tarda UNA consulta lenta, que es el piso de cualquier cosa que dependa de
     * la base. Si dependiera de ella, jamás bajaría de 700.
     */
    es("LA BURBUJA SALE SIN ESPERAR A LA BASE", tardo < LENTA, true);

    /*
     * Y mientras el servidor no confirma, dice «enviando». No es adorno: es lo
     * que le dice a quien atiende que su mensaje está en camino y no se perdió.
     */
    const alPrincipio = await filaDe(TEXTO);
    es("al principio dice «enviando»", /enviando/i.test(alPrincipio ?? ""), true);

    // Y de verdad terminó de enviarse, no es sólo una burbuja de mentira.
    await p.waitForTimeout(LENTA * 6);
    const alFinal = await filaDe(TEXTO);
    es("y al confirmarse dice «Enviado»", /Enviado/.test(alFinal ?? "") && !/enviando/i.test(alFinal ?? ""), true);
    es("y el mensaje quedó en la base, una vez", enBase(TEXTO), 1);
    es("y se ve una sola burbuja", await burbujas(TEXTO).count(), 1);
    void tablasAntes;
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. TRES ENTER Y UN CLIC SEGUIDOS, CON LA BASE LENTA: UN MENSAJE ──");
  // ══════════════════════════════════════════════════════════════════════════
  {
    /*
     * Es lo que hacía Alexandra: apretar Enter otra vez porque no se movía
     * nada. Acá se aprieta cuatro veces en menos de medio segundo, que es peor
     * que cualquier persona.
     */
    await lentitud(LENTA);
    const TEXTO = "TRES " + crypto.randomUUID().slice(0, 8);
    await caja().fill(TEXTO);
    await caja().press("Enter");
    await caja().press("Enter");
    await caja().press("Enter");
    await p.getByRole("button", { name: /^Enviar$/ }).first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(LENTA * 10);

    es("UN SOLO MENSAJE EN LA BASE", enBase(TEXTO), 1);
    es("UNA SOLA BURBUJA EN PANTALLA", await burbujas(TEXTO).count(), 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. SI EL ENVÍO FALLA, EL TEXTO VUELVE Y LA BURBUJA SE RETIRA ──");
  // ══════════════════════════════════════════════════════════════════════════
  {
    /*
     * Un fallo que viene del servidor y no de Meta, para que sea determinista:
     * al hilo se le quita con quién comunicarse DESPUÉS de que la pantalla ya lo
     * cargó, así que la pantalla intenta mandarlo y la acción contesta «Este
     * hilo no tiene con quién comunicarse». Es la misma forma que cualquier
     * rechazo de verdad —token vencido, ventana cerrada—: `ok: false` y un
     * motivo.
     *
     * Lo que se comprueba es lo que NO puede pasar: que el texto desaparezca
     * junto con la burbuja y la persona crea que lo mandó. Con el recuadro
     * vaciándose al instante, el texto TIENE que volver.
     */
    await lentitud(0);
    sql(`update conversaciones set telefono = '', identificador = null where id = ${conv}`);

    const TEXTO = "CUATRO " + crypto.randomUUID().slice(0, 8);
    await caja().fill(TEXTO);
    await caja().press("Enter");
    await p.waitForTimeout(4000);

    es("EL TEXTO VOLVIÓ AL RECUADRO", await caja().inputValue(), TEXTO);
    es("y la burbuja se retiró", await burbujas(TEXTO).count(), 0);
    es("y no quedó nada en la base", enBase(TEXTO), 0);

    const cuerpo = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    es("y dice el motivo", /con quién comunicarse/i.test(cuerpo), true);
  }

  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. SI SALIÓ PERO NO SE PUDO GUARDAR, EL TEXTO NO VUELVE ──");
  // ══════════════════════════════════════════════════════════════════════════
  {
    /*
     * El caso donde «si falla, el texto vuelve» sería un error: Meta aceptó el
     * mensaje —el cliente YA lo tiene— y lo que falló fue anotarlo en la base.
     * Devolverlo al recuadro es tenerlo servido para mandarlo otra vez, o sea
     * fabricar el doble que se está curando.
     *
     * Se simula con un disparador que sólo existe en el banco y rechaza el
     * guardado de los textos que empiezan con la clave de abajo.
     */
    sqlArchivo(`
      create or replace function public.bench_falla_al_guardar() returns trigger
      language plpgsql as $$
      begin
        if new.texto like 'FALLA-AL-GUARDAR%' then
          raise exception 'bench: falla al guardar';
        end if;
        return new;
      end $$;
      drop trigger if exists bench_falla on public.mensajes;
      create trigger bench_falla before insert on public.mensajes
        for each row execute function public.bench_falla_al_guardar();
      update conversaciones set telefono = '${TEL}', identificador = '${TEL}' where id = ${conv};
    `);
    await lentitud(0);

    const TEXTO = "FALLA-AL-GUARDAR " + crypto.randomUUID().slice(0, 8);
    await caja().fill(TEXTO);
    await caja().press("Enter");
    await p.waitForTimeout(4000);

    es("EL TEXTO NO VOLVIÓ AL RECUADRO", await caja().inputValue(), "");
    es("y la burbuja provisoria se retiró", await burbujas(TEXTO).count(), 0);
    const cuerpo = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    es("y dice que SÍ salió", /Se envió, pero no se pudo guardar/i.test(cuerpo), true);

    sqlArchivo("drop trigger if exists bench_falla on public.mensajes; drop function if exists public.bench_falla_al_guardar();");
  }

  console.log("\n── 5. nada reventó por el camino ──");
  es("sin errores de JavaScript", errores, []);
} finally {
  await lentitud(0).catch(() => {});
  await nav.close();
  try {
    sqlArchivo("drop trigger if exists bench_falla on public.mensajes; drop function if exists public.bench_falla_al_guardar();");
  } catch {}

  // Esta prueba deja un hilo, su lead y sus mensajes.
  sql(`delete from mensajes where conversacion_id = ${conv}`);
  sql(`delete from conversaciones where id = ${conv}`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
  sql(`delete from clientes where telefono='${TEL}'`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
