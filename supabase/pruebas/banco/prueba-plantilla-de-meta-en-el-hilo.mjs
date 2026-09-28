/**
 * La plantilla con imagen, mandada desde el hilo SIN pedir nada de más.
 *
 *     node supabase/pruebas/banco/prueba-plantilla-de-meta-en-el-hilo.mjs
 *
 * ============================================================================
 * LAS DOS QUEJAS QUE ESTO VIGILA
 * ============================================================================
 *
 * 1. «Vuelve a pedir la imagen que ya está en la plantilla; la idea es sólo
 *    poder enviarla.»
 *
 *    Y tenía razón a medias. Meta SÍ exige el archivo del encabezado en cada
 *    envío —la plantilla guarda el diseño, no la foto—, pero al aprobarla se
 *    queda con la imagen de muestra y la devuelve en `example.header_handle`,
 *    que hoy es una dirección de su propio CDN. O sea que el dato estaba
 *    guardado y el CRM no lo miraba. De ahí salió el «Media upload error» del
 *    hilo: al no tener la imagen a mano se pegó una dirección que Meta no podía
 *    bajar.
 *
 *    Lo único que la plantilla de la escuela personaliza es el NOMBRE, y eso sí
 *    se sigue pidiendo.
 *
 * 2. «Poder mandar plantillas aunque no aparezca el mensaje de 24 horas.»
 *
 *    El selector salía únicamente con la ventana cerrada: era la salida de
 *    emergencia de un callejón sin salida. Pero la invitación al workshop es la
 *    misma esté abierta o cerrada la ventana, y con la ventana abierta no había
 *    forma de mandarla desde el chat.
 *
 * Las dos se prueban sobre el MISMO hilo, y ese hilo tiene un mensaje entrante
 * reciente: o sea, ventana abierta. Es el caso que antes no existía.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3148;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-demeta-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50377410979";
const ID = "prueba_workshop_de_meta_es";

/*
 * La dirección tal como la devuelve Meta: su propio CDN.
 *
 * Se copia la forma —`scontent.whatsapp.net`, con sus parámetros— y no se
 * simplifica a «https://x.test/y.png»: lo que decide si esto se puede reusar es
 * justamente que sea una dirección y no el identificador `4::aW1n…` de la forma
 * vieja, así que la prueba tiene que trabajar sobre algo que se parezca.
 */
const LA_DE_META =
  "http://127.0.0.1:" + PUERTO_META + "/cdn/barra_dubai.png?ccb=1-7&_nc_oc=abc";

const limpiar = () => {
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.plantillas where id = '${ID}';
  `);
};
limpiar();

/*
 * Un hilo CON un mensaje entrante recién llegado: la ventana está ABIERTA.
 *
 * Es el caso nuevo. Con la ventana cerrada el selector ya salía solo, así que
 * probar ahí no diría nada sobre lo que se acaba de agregar.
 */
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en)
  values ('${TEL}', 'Diego De Meta', now());

  insert into public.mensajes (conversacion_id, direccion, tipo, texto, estado, creado_en)
  select id, 'entrante', 'text', 'Hola buenos días', 'recibido', now()
    from public.conversaciones where telefono = '${TEL}';
`);

/* El payload como lo devuelve Meta para la del workshop. */
const payload = JSON.stringify({
  id: ID,
  name: "prueba_workshop_de_meta",
  language: "es",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: [LA_DE_META] } },
    {
      type: "BODY",
      text: "Hola, buen día, {{order_id}} ¡Espero que estés muy bien!",
      example: { body_text_named_params: [{ example: "Diego", param_name: "order_id" }] },
    },
  ],
});

sql(`
  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables, payload)
  values ('${ID}', 'prueba_workshop_de_meta', 'es', 'APPROVED', 'MARKETING',
          'Hola, buen día, {{order_id}} ¡Espero que estés muy bien!', 1,
          '${payload.replace(/'/g, "''")}'::jsonb)
  on conflict (id) do update set payload = excluded.payload, estado = 'APPROVED';
`);

// ── el Meta de mentira, y la aplicación apuntándole ────────────────────────

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

parar(PUERTO_META);
execSync(
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-demeta.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
execSync("sleep 2");

parar(3142);
fs.writeFileSync(
  `${RAIZ}/.env.local`,
  [
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
    `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
    "WHATSAPP_APP_SECRET=secreto-de-prueba",
    "WHATSAPP_VERIFY_TOKEN=verifica-prueba",
    "WHATSAPP_TOKEN=token-de-prueba",
    "WHATSAPP_PHONE_NUMBER_ID=111",
    "WHATSAPP_WABA_ID=222",
    "INSTAGRAM_TOKEN=token-ig-de-prueba",
    "INSTAGRAM_ACCOUNT_ID=999",
    `WHATSAPP_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
  ].join("\n") + "\n",
  "utf8",
);
execSync(
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-demeta.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
{
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    const code = execSync(
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
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

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};
const JEFA = subDe("jwt-jefa.txt");

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
      user: { id: JEFA, email: "jefa@lac.test" },
    }),
  ).toString("base64");

const recibidos = async () =>
  await (await fetch(`http://127.0.0.1:${PUERTO_META}/__recibidos`)).json();
const antes = (await recibidos()).length;

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
const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/de-meta-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

await p.getByText("Diego De Meta", { exact: false }).first().click();
await p.waitForTimeout(1800);
await foto("1-hilo");

console.log("── 1. LA VENTANA ESTÁ ABIERTA ──");
{
  const t = await texto();
  // Si saliera el aviso de ventana cerrada, la prueba estaría midiendo el caso
  // viejo —donde el selector ya salía solo— y no el que se agregó.
  es(
    "no sale el aviso de que se pasó la ventana",
    /Se pasó la ventana|todavía no le escribió/i.test(t),
    false,
  );
  es("y el cuadro de escribir está habilitado", await p.locator("main textarea").last().isDisabled(), false);
}

console.log("\n── 2. Y AUN ASÍ SE PUEDE MANDAR UNA PLANTILLA ──");
const abrir = p.getByRole("button", { name: "Usar una plantilla", exact: true });
const hayBoton = (await abrir.count()) >= 1;
es("APARECE EL BOTÓN «USAR UNA PLANTILLA»", hayBoton, true);

if (!hayBoton) {
  await foto("2-sin-boton");
  await nav.close();
  parar(PUERTO_META);
  limpiar();
  console.log(
    "\nCon la ventana abierta no hay forma de mandar una plantilla desde el chat.\n" +
      "El resto no se puede probar.",
  );
  process.exit(1);
}

await abrir.first().click();
await p.waitForTimeout(800);
await p.locator("main select").last().selectOption(ID);
await p.waitForTimeout(1200);
await foto("3-elegida");

console.log("\n── 3. NO PIDE LA IMAGEN: YA LA TIENE ──");
{
  const t = await texto();
  es("DICE QUE VA CON LA IMAGEN APROBADA EN META", /Va con la imagen aprobada en Meta/.test(t), true);
  es(
    "y el botón ofrece cambiarla, no subirla",
    await p.getByRole("button", { name: "Usar otra imagen", exact: true }).count(),
    1,
  );
  es(
    "ya no hay un botón «Subir imagen» que haga pensar que falta algo",
    await p.getByRole("button", { name: "Subir imagen", exact: true }).count(),
    0,
  );

  // La miniatura: es la confirmación de un vistazo de que la imagen está.
  es(
    "y se ve la imagen que va a ir",
    await p.locator(`main img[src="${LA_DE_META}"]`).count(),
    1,
  );
}

console.log("\n── 4. LO ÚNICO QUE PIDE ES EL NOMBRE ──");
const mandar = p.getByRole("button", { name: "Mandar", exact: true });
es("hasta que no se escriba el nombre, no deja mandar", await mandar.first().isDisabled(), true);

await p.locator('main input[type="text"]').last().fill("Diego");
await p.waitForTimeout(600);
es("con el nombre puesto, YA DEJA MANDAR", await mandar.first().isDisabled(), false);
await foto("4-listo");

await mandar.first().click();
await p.waitForTimeout(3500);

console.log("\n── 5. LO QUE LE LLEGÓ A META ──");
const llegaron = await recibidos();
es("llegó un envío", llegaron.length > antes, true);

/*
 * El ÚLTIMO mensaje, no la última llamada.
 *
 * Antes de mandar, el CRM le sube la imagen a Meta, así que `/media` queda
 * anotado después. Tomando la última entrada a secas se leería la subida y no
 * el envío, y todas las comprobaciones de abajo dirían que falta todo.
 */
const mensajes = llegaron.filter((x) => /\/messages/.test(x.url ?? ""));
const piezas = mensajes[mensajes.length - 1]?.cuerpo?.template?.components ?? [];
const encabezado = piezas.find((c) => c?.type === "header");
const cuerpo = piezas.find((c) => c?.type === "body");

es("VA EL ENCABEZADO", encabezado != null, true);
es("como imagen", encabezado?.parameters?.[0]?.type, "image");

/*
 * La imagen de Meta se BAJÓ y se volvió a SUBIR; no se le pasó su dirección.
 *
 * Suena redondo pasarle a Meta una dirección suya, y no lo es: en producción
 * Meta aceptó el mensaje con esa misma dirección y después no la volvió a
 * bajar. En el hilo de la escuela quedó «No se pudo entregar · Media upload
 * error». Por eso lo que viaja es el identificador.
 */
es(
  "SE SUBIÓ ANTES DE MANDAR",
  llegaron.filter((x) => /\/media/.test(x.url ?? "")).length,
  1,
);
es(
  "Y VA SU IDENTIFICADOR",
  /^media\.FALSO\./.test(encabezado?.parameters?.[0]?.image?.id ?? ""),
  true,
);
es("no la dirección del CDN", encabezado?.parameters?.[0]?.image?.link, undefined);
es("y el cuerpo con el nombre", cuerpo?.parameters?.[0]?.text, "Diego");
es(
  "con el nombre del hueco, que esta plantilla usa",
  cuerpo?.parameters?.[0]?.parameter_name,
  "order_id",
);
es("no quedó ningún error en la pantalla", /131008|Required parameter/i.test(await texto()), false);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 6. Y EN EL HILO SE VE LA IMAGEN ──");
// ══════════════════════════════════════════════════════════════════════════
/*
 * El envío puede salir perfecto y la pantalla seguir mintiendo.
 *
 * Pasó: la plantilla salió, el cliente la recibió con su imagen, y en el CRM la
 * burbuja apareció con el texto solo. Para quien atiende eso se lee como «la
 * imagen no salió», y no hay forma de saber que sí salió sin pedirle al cliente
 * una captura.
 *
 * El identificador que devuelve Meta sirve para mandar y no se puede dibujar,
 * así que el CRM guarda una copia de la imagen en su bucket y es ésa la que se
 * ve acá.
 */
{
  await p.waitForTimeout(1500);

  es(
    "LA BURBUJA GUARDÓ LA IMAGEN",
    sql(`
      select count(*) from public.mensajes
       where conversacion_id = (select id from public.conversaciones where telefono = '${TEL}')
         and direccion = 'saliente'
         and media_ruta like 'saliente/plantillas/%'
         and media_mime like 'image/%';
    `),
    "1",
  );

  // Y se dibuja: una imagen dentro del hilo, con su dirección firmada.
  es(
    "y se dibuja en la conversación",
    await p.locator('main img[src*="/storage/v1/object/"]').count() >= 1,
    true,
  );
}

await foto("5-mandada");

await nav.close();
parar(PUERTO_META);
limpiar();
es(
  "no quedó basura de la prueba",
  sql(`select count(*) from public.conversaciones where telefono = '${TEL}';`),
  "0",
);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
