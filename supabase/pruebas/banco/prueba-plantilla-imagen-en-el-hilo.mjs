/**
 * Mandarle a UNA persona, desde su hilo, una plantilla con imagen.
 *
 *     node supabase/pruebas/banco/prueba-plantilla-imagen-en-el-hilo.mjs
 *
 * ------------------------------------------------------------------------
 * EL PROBLEMA QUE ESTO VIGILA
 * ------------------------------------------------------------------------
 *
 * La escuela quiso mandarle a una clienta la plantilla del workshop —aprobada
 * por Meta, con una imagen de encabezado— y el CRM le contestó:
 *
 *     Esta plantilla lleva una imagen de encabezado, y hay que darle su
 *     dirección para poder mandarla.
 *
 * …sin ofrecer ninguna casilla donde escribir esa dirección. Un callejón sin
 * salida: el aviso era correcto y no había forma de obedecerlo.
 *
 * Eran dos fallas encadenadas, y por eso hace falta probarlo por la pantalla y
 * no sólo por las piezas sueltas:
 *
 *   LA PANTALLA NO LA PEDÍA   El selector del hilo dibujaba únicamente los
 *                             huecos `{{1}}` del cuerpo. Una imagen no es un
 *                             hueco del cuerpo, así que no aparecía casilla.
 *
 *   EL SERVIDOR LA TIRABA     `enviarPlantillaAConversacion` armaba el reparto
 *                             a mano con `encabezado: []`. Aunque la pantalla
 *                             la hubiera mandado, ahí se perdía.
 *
 * El envío MASIVO sí podía mandarlas —usa `pedidosDe` y `repartirValores`—, y
 * eso es lo que hacía difícil de ver el defecto: «a veces sí y a veces no».
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LA PLANTILLA SE LLAMA `..._con_header`
 * ------------------------------------------------------------------------
 *
 * Es la seña que hace que el Meta de mentira EXIJA el componente `header` y
 * conteste 131008 si falta, igual que el de verdad. Sin eso, un envío sin la
 * imagen saldría «bien» en el banco y la prueba quedaría verde con el defecto
 * puesto.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LA PRUEBA SE ARMA SU PROPIO ENTORNO
 * ------------------------------------------------------------------------
 *
 * Levanta su Meta de mentira y reescribe `.env.local` antes de arrancar la
 * aplicación. No es ceremonia: varias pruebas del banco escriben ese archivo y
 * lo dejan como les sirve a ellas. Corriendo después de una de ésas, el CRM se
 * quedaba sin `WHATSAPP_GRAPH_URL`, le hablaba al Meta de verdad y contestaba
 * «el token venció» —un fallo que no tiene nada que ver con lo que se está
 * probando y que cuesta una tarde entender—.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3149;

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-imagen-${process.pid}-${Math.random()}.sql`);
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

const TEL = "50370999044";
const ID = "prueba_workshop_con_header_es";
const LA_IMAGEN = "https://ejemplo.test/barra-dubai.jpg";

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
 * Una conversación sin ningún mensaje entrante: el caso «nunca escribió», que
 * es cuando el CRM sólo deja llegarle con una plantilla. Es exactamente la
 * situación de la escuela.
 */
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en)
  values ('${TEL}', 'Imagen Prueba', now());
`);

/*
 * El payload con la forma que devuelve Meta para la del workshop: encabezado
 * de imagen y un cuerpo SIN huecos. Ese cuerpo sin huecos importa: era el caso
 * en que la pantalla vieja no dibujaba ni una sola casilla.
 */
const payload = JSON.stringify({
  id: ID,
  name: "prueba_workshop_con_header",
  language: "es",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1n"] } },
    { type: "BODY", text: "🍫 WORKSHOP: BARRA DUBAI. Sábado 03 de octubre." },
  ],
});

sql(`
  insert into public.plantillas (id, nombre, idioma, estado, categoria, cuerpo, variables, payload)
  values ('${ID}', 'prueba_workshop_con_header', 'es', 'APPROVED', 'MARKETING',
          '🍫 WORKSHOP: BARRA DUBAI. Sábado 03 de octubre.', 0,
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
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-imagen.log 2>&1 < /dev/null &)`,
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
  `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-imagen.log 2>&1 < /dev/null &)`,
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
const foto = (n) =>
  p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/imagen-hilo-${n}.png` });
const texto = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2600);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2200);

console.log("── 1. EL HILO PIDE LA DIRECCIÓN DE LA IMAGEN ──");
await p.getByText("Imagen Prueba", { exact: false }).first().click();
await p.waitForTimeout(1800);

await p.locator("main select").last().selectOption(ID);
await p.waitForTimeout(900);
await foto("1-elegida");

const casilla = p.locator('main input[type="url"]');
const hayCasilla = (await casilla.count()) === 1;
es("APARECE UNA CASILLA PARA EL ENLACE", await casilla.count(), 1);

/*
 * Si la casilla no está, todo lo que sigue no tiene dónde escribir y Playwright
 * se quedaría treinta segundos esperándola por cada paso, para terminar
 * reventando con un error de espera que no nombra el defecto. Es justo lo que
 * hacía el código viejo. Se corta acá y se dice qué pasó.
 */
if (!hayCasilla) {
  await foto("1-sin-casilla");
  await nav.close();
  parar(PUERTO_META);
  limpiar();
  console.log(
    "\nLa plantilla lleva imagen y la pantalla no pidió su dirección:\n" +
      "sin esa casilla no hay forma de mandarla. El resto no se puede probar.",
  );
  process.exit(1);
}

es(
  "y dice que es el enlace de la imagen",
  /enlace de la imagen/.test((await casilla.first().getAttribute("placeholder")) ?? ""),
  true,
);

const boton = p.getByRole("button", { name: "Mandar", exact: true });
es("el botón está, pero apagado hasta que se llene", await boton.first().isDisabled(), true);

console.log("\n── 2. CON EL ENLACE PUESTO, SALE ──");
await casilla.first().fill(LA_IMAGEN);
await p.waitForTimeout(700);
es("ahora sí deja mandar", await boton.first().isDisabled(), false);

/*
 * La vista previa NO tiene que mostrar el enlace: la imagen va arriba, no
 * metida adentro de la frase. Antes, con el reparto hecho a mano, el enlace
 * se colaba en el primer hueco del cuerpo.
 */
es("el enlace no se metió dentro del texto", /ejemplo\.test/.test(await texto()), false);

await foto("2-con-el-enlace");
await boton.first().click();
await p.waitForTimeout(3000);

console.log("\n── 3. LO QUE LE LLEGÓ A META ──");
const llegaron = await recibidos();
es("llegó un envío", llegaron.length > antes, true);

const piezas = llegaron[llegaron.length - 1]?.cuerpo?.template?.components ?? [];
const encabezado = piezas.find((c) => c?.type === "header");

es("VA EL COMPONENTE DE ENCABEZADO", encabezado != null, true);
es("como imagen", encabezado?.parameters?.[0]?.type, "image");
es("CON LA DIRECCIÓN QUE SE ESCRIBIÓ", encabezado?.parameters?.[0]?.image?.link, LA_IMAGEN);

/*
 * Y el cuerpo no va con un parámetro de más. Esta plantilla no tiene huecos:
 * mandarle uno la haría rebotar con 132000 («number of parameters mismatch»).
 */
const cuerpo = piezas.find((c) => c?.type === "body");
es("el cuerpo no lleva parámetros de más", cuerpo?.parameters?.length ?? 0, 0);

/*
 * Y como la plantilla se llama `..._con_header`, el Meta de mentira habría
 * contestado 131008 si el encabezado no hubiera viajado. Que la pantalla no
 * muestre ese error es la otra mitad de la comprobación.
 */
es("no quedó ningún error en la pantalla", /131008|Required parameter/i.test(await texto()), false);
await foto("3-mandada");

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
