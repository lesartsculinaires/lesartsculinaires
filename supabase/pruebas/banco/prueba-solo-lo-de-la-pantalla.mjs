/**
 * ¿Cada pantalla pide sólo lo suyo?
 *
 *     node supabase/pruebas/banco/prueba-solo-lo-de-la-pantalla.mjs
 *
 * ============================================================================
 * LO QUE ESTO MIDE, Y POR QUÉ NO SE PUEDE MEDIR DE OTRA FORMA
 * ============================================================================
 *
 * La portada cargaba TODO antes de pintar nada: el embudo, la bandeja con sus
 * mensajes, los envíos con sus destinatarios, los formularios con sus
 * preguntas y sus respuestas, las plantillas, las bases. Unas veinticinco
 * consultas, las mirara o no la pantalla que se iba a ver. Y no una vez al
 * entrar: en cada vuelta del refresco, con cada aviso del websocket y al final
 * de CADA acción del servidor.
 *
 * Esas consultas salen del SERVIDOR, así que el navegador no las ve: una
 * prueba que mire la red desde Playwright no se entera de ninguna. La única
 * forma de contarlas es del otro lado, y por eso esta prueba lee el registro
 * del proxy, que anota cada `/rest/v1/…` que entra.
 *
 * ============================================================================
 * LAS TRES COSAS QUE TIENEN QUE SER CIERTAS A LA VEZ
 * ============================================================================
 *
 *   SE PIDE MENOS        El Dashboard no puede estar pidiendo la bandeja.
 *
 *   SE SIGUE VIENDO      Y la bandeja, cuando se abre, tiene que mostrar sus
 *                        hilos igual que antes. Ahorrar rompiendo no es
 *                        ahorrar.
 *
 *   EL GLOBITO SIGUE     El número rojo de mensajes sin leer se ve en TODAS
 *                        las pantallas, y antes salía de tener la bandeja
 *                        entera en memoria. Si se apagó al dejar de cargarla,
 *                        nadie se entera de que entró un mensaje.
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

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

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const LOG = `${BANCO}/pxv.log`;

/** Lo anotado en el registro del proxy desde una marca hasta ahora. */
const desde = (marca) =>
  fs
    .readFileSync(LOG, "utf8")
    .slice(marca)
    .split("\n")
    .filter((l) => l.startsWith("REST /"))
    .map((l) => l.slice("REST /".length).split("?")[0]);

const marca = () => (fs.existsSync(LOG) ? fs.statSync(LOG).size : 0);

// ── un hilo con mensajes sin leer, para que el globito tenga qué decir ──
const TEL = "50366" + String(Date.now()).slice(-6);
const carga = {
  object: "whatsapp_business_account",
  entry: [{ id: "222", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "111" },
    contacts: [{ profile: { name: "Pantalla Sola" }, wa_id: TEL }],
    messages: [{ from: TEL, id: "wamid." + crypto.randomUUID(),
      timestamp: String(Math.floor(Date.now() / 1000)), type: "text",
      text: { body: "Hola, ¿sigue abierto el curso?" } }],
  } }] }],
};
const crudo = JSON.stringify(carga);
await fetch("http://127.0.0.1:3142/api/whatsapp/webhook", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-signature-256":
      "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex"),
  },
  body: crudo,
});
await new Promise((s) => setTimeout(s, 800));
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
sql(`update conversaciones set sin_leer = 7 where id = ${conv}`);

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
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
// El aviso de reservas tapa la pantalla y no es lo que se viene a mirar.
await ctx.addInitScript(
  (h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
  new Date().toISOString().slice(0, 10),
);
// Y la galleta del último módulo, para entrar por el Dashboard a propósito.
await ctx.addCookies([{ name: "lac.mod", value: "Dashboard", domain: "127.0.0.1", path: "/" }]);

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. el Dashboard no carga la bandeja ──");
// ══════════════════════════════════════════════════════════════════════════
let pedidasEnDashboard = [];
{
  const m = marca();
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  pedidasEnDashboard = desde(m);

  const tablas = new Set(pedidasEnDashboard);
  console.log(`   (${pedidasEnDashboard.length} consultas, ${tablas.size} tablas distintas)`);

  /*
   * Lo que NO puede aparecer. Son las seis que ahora van por pantalla, y
   * `mensajes` es la más cara de todas: cuatro mil filas con su texto, sus
   * reacciones y sus archivos, para alguien que está mirando un gráfico.
   */
  es("NO pide los mensajes", tablas.has("mensajes"), false);
  es("NO pide los envíos", tablas.has("envios"), false);
  es("NO pide los destinatarios", tablas.has("envio_destinatarios"), false);
  es("NO pide los formularios", tablas.has("formularios"), false);
  es("NO pide las respuestas de formularios", tablas.has("formulario_respuestas"), false);
  es("NO pide las plantillas", tablas.has("plantillas"), false);
  es("NO pide las bases", tablas.has("importaciones"), false);
  es("NO pide las etiquetas", tablas.has("etiquetas"), false);

  // Y lo que sí tiene que seguir pidiendo, o la pantalla no se dibuja.
  es("sí pide el embudo", tablas.has("vw_pipeline"), true);
  es("sí pide los accesos", tablas.has("usuarios"), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. PERO EL GLOBITO DE SIN LEER SIGUE AHÍ ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * Es la mitad que se podía romper sin que ninguna prueba se diera cuenta:
   * el número salía de tener la bandeja en memoria, y ahora la bandeja no
   * está. Lo cuenta el servidor aparte, con una consulta de una columna.
   */
  /*
   * Se compara contra lo que dice la base, no contra un número escrito acá.
   *
   * El banco se comparte entre pruebas y arrastra lo que dejaron las
   * anteriores, así que «tiene que decir 7» falla por el motivo equivocado en
   * cuanto alguien deja un hilo sin leer. Lo que se viene a comprobar no es un
   * número sino que el globito siga diciendo LO MISMO QUE LA BASE sin cargar
   * la bandeja, y eso se pregunta.
   */
  const esperado = sql(
    "select coalesce(sum(sin_leer),0) from conversaciones " +
      "where sin_leer > 0 and archivada is not true and silenciada is not true",
  );
  const globito = await p
    .locator("aside nav button", { hasText: "Inbox" })
    .locator("span")
    .last()
    .innerText()
    .catch(() => "");
  console.log(`   (la base dice ${esperado})`);
  es("el número rojo dice lo que dice la base", globito.trim(), esperado);
  // Y que de verdad haya algo que contar, o la comprobación de arriba pasaría
  // sola con todo en cero.
  es("y hay algo que contar", Number(esperado) >= 7, true);

  // Y se consiguió SIN traer la bandeja: la cuenta sale de `conversaciones`.
  es("contando, no cargando", new Set(pedidasEnDashboard).has("conversaciones"), true);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. al abrir la bandeja, llega lo suyo y se ve ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const m = marca();
  await p.locator("aside nav button", { hasText: "Inbox" }).click();
  await p.waitForTimeout(3000);
  const tablas = new Set(desde(m));

  es("AHORA SÍ pide los mensajes", tablas.has("mensajes"), true);
  es("y las etiquetas", tablas.has("etiquetas"), true);
  es("y las plantillas", tablas.has("plantillas"), true);
  // Pero sigue sin pedir lo de las otras pantallas.
  es("y sigue sin pedir los envíos", tablas.has("envios"), false);
  es("ni los formularios", tablas.has("formularios"), false);

  // Lo que importa de verdad: que el hilo se vea.
  const hilo = p.locator("text=Pantalla Sola").first();
  es("EL HILO SE VE EN LA BANDEJA", await hilo.isVisible().catch(() => false), true);

  await hilo.click();
  await p.waitForTimeout(1500);
  es(
    "y su mensaje también",
    await p.locator("text=¿sigue abierto el curso?").first().isVisible().catch(() => false),
    true,
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. volver al Dashboard no vuelve a pedir la bandeja ──");
// ══════════════════════════════════════════════════════════════════════════
{
  const m = marca();
  await p.locator("aside nav button", { hasText: "Dashboard" }).click();
  await p.waitForTimeout(2500);
  const tablas = new Set(desde(m));

  /*
   * Cambiar de pantalla es cosa del navegador: no vuelve a entrar al
   * servidor. Así que acá no tendría que pedirse NADA. Si apareciera la
   * bandeja sería que algo la está pidiendo igual, y el ahorro se perdería en
   * cuanto alguien ande cambiando de pantalla.
   */
  es("no se pide la bandeja de nuevo", tablas.has("mensajes"), false);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. cada pantalla, lo suyo ──");
// ══════════════════════════════════════════════════════════════════════════
{
  for (const [pantalla, debeTener, noDebeTener] of [
    ["Envíos", "envios", "mensajes"],
    ["Formularios", "formularios", "mensajes"],
    ["Bases", "importaciones", "mensajes"],
  ]) {
    const m = marca();
    await p.locator("aside nav button", { hasText: pantalla }).click();
    await p.waitForTimeout(2500);
    const tablas = new Set(desde(m));
    es(`${pantalla} pide ${debeTener}`, tablas.has(debeTener), true);
    es(`${pantalla} no pide ${noDebeTener}`, tablas.has(noDebeTener), false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. CON UN `?mod=` DE SOBRA EN LA DIRECCIÓN, UN REFRESCO NO DESARMA LA BANDEJA ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * El defecto que se metió con este mismo cambio, y que sólo se vio con la
   * prueba de la nota interna: la dirección conserva el `?mod=` TODA LA SESIÓN
   * —quien entra «como administrador» o vuelve de conectar Meta—, cada refresco
   * lo vuelve a pedir, y el servidor mandaba los datos de la pantalla NOMBRADA
   * ahí y no de la que se estaba mirando. La bandeja se reemplazaba por
   * «Cargando…»: se perdía el hilo abierto y el texto escrito sin enviar.
   *
   * Se reproduce tal cual: se entra por `/?mod=Canales`, se pasa a la bandeja,
   * se abre un hilo, se deja un borrador y se pide un refresco. El borrador
   * tiene que seguir ahí.
   */
  const ctx2 = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx2.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  await ctx2.addInitScript(
    (h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} },
    new Date().toISOString().slice(0, 10),
  );
  const q = await ctx2.newPage();
  let refrescos = 0;
  q.on("request", (r) => { if (r.url().includes("_rsc")) refrescos += 1; });

  try {
    await q.goto("http://127.0.0.1:3142/?mod=Canales", { waitUntil: "networkidle" });
    await q.waitForTimeout(1500);
    await q.locator("aside nav button", { hasText: "Inbox" }).click();
    await q.waitForTimeout(3000);
    await q.locator("button.row", { hasText: "Pantalla Sola" }).first().click();
    await q.waitForTimeout(1500);

    const BORRADOR = "BORRADOR SIN ENVIAR " + crypto.randomUUID().slice(0, 6);
    await q.locator("main textarea").first().fill(BORRADOR);

    const antes = refrescos;
    await q.getByTitle("Traer los datos ahora mismo").click();
    await q.waitForTimeout(4500);

    // Que de verdad hubo un refresco, o lo de abajo pasaría sin haber probado nada.
    es("hubo un refresco", refrescos > antes, true);
    es(
      "EL BORRADOR SIGUE EN EL RECUADRO",
      await q.locator("main textarea").first().inputValue().catch(() => null),
      BORRADOR,
    );
    es(
      "y no quedó un «Cargando…» en pantalla",
      (await q.locator("body").innerText()).includes("Cargando…"),
      false,
    );
  } finally {
    await ctx2.close();
  }
}

console.log("\n── 7. y nada reventó por el camino ──");
es("sin errores de JavaScript", errores, []);

await p.screenshot({ path: "/tmp/solo-lo-de-la-pantalla.png" });
await nav.close();

// ── limpieza: esta prueba deja un hilo y su lead ──
sql(`delete from mensajes where conversacion_id = ${conv}`);
sql(`delete from conversaciones where id = ${conv}`);
sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
sql(`delete from clientes where telefono='${TEL}'`);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
