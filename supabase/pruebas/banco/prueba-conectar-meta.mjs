/**
 * Conectar una cuenta de Meta desde el CRM, que es lo que pide la revisión.
 *
 *     node supabase/pruebas/banco/prueba-conectar-meta.mjs
 *
 * ============================================================================
 * QUÉ ESTÁ EN JUEGO
 * ============================================================================
 *
 * Para aprobar `instagram_manage_messages`, Meta manda a una persona a probar
 * el producto, y esa persona conecta SU PROPIA cuenta de Instagram desde la
 * aplicación. Si eso no se puede hacer, la revisión se rechaza y los mensajes
 * de Instagram siguen sin entrar: hoy sólo llegan los de quien tiene un rol en
 * la app —de 33.701 seguidores, un hilo—.
 *
 * ============================================================================
 * LO QUE SE PRUEBA, Y POR QUÉ CADA COSA
 * ============================================================================
 *
 *   EL BOTÓN ESTÁ Y VA A META     Un botón que no lleva al diálogo es un
 *                                 rechazo. Se comprueba que la redirección
 *                                 lleve el `config_id`, que es lo que hace que
 *                                 Facebook ofrezca elegir Página y cuenta de
 *                                 Instagram.
 *
 *   EL CAMINO ENTERO              Canjear el código, pedir las Páginas, y
 *                                 SUSCRIBIR la Página al webhook. El tercero es
 *                                 el que todo el mundo olvida: sin él la cuenta
 *                                 queda conectada y no entra ni un mensaje, que
 *                                 es exactamente el síntoma que haría fallar la
 *                                 revisión.
 *
 *   SE GUARDA EL TOKEN DE LA      Meta devuelve dos tokens distintos: el de
 *   PÁGINA, NO EL DE USUARIO      usuario, que no sirve para mensajería, y el
 *                                 de la Página, que sí. Guardar el equivocado
 *                                 se ve igual en pantalla y falla al contestar.
 *
 *   Y SOBRE TODO: QUE SE USE      Es la prueba de verdad. Un hilo que entró por
 *                                 la cuenta del revisor tiene que contestarse
 *                                 con el token DEL REVISOR. Si saliera con el
 *                                 de la escuela, Meta lo rechaza —esa Página no
 *                                 es suya— y la revisión se cae por un detalle
 *                                 que nadie miró.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";
const PUERTO_META = 3148;
const PAGINA_FALSA = "900000000000001";
const IG_FALSO = "17841400000000999";
const TOKEN_DE_PAGINA = "TOKEN-DE-PAGINA-FALSO";
const IGSID = "7700000000000" + String(Date.now()).slice(-3);

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-conectar-${process.pid}-${Math.random()}.sql`);
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
    delete from public.canal_credenciales where page_id = '${PAGINA_FALSA}';
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IGSID}');
    delete from public.conversaciones where identificador = '${IGSID}';
  `);
};
limpiar();

// ── el Meta de mentira y la aplicación apuntándole ─────────────────────────

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
  `cd ${RAIZ} && (setsid node supabase/pruebas/banco/meta-de-mentira.mjs ${PUERTO_META} > /tmp/meta-conectar.log 2>&1 < /dev/null &)`,
  { shell: "/bin/bash" },
);
execSync("sleep 2");

const ENV = `${RAIZ}/.env.local`;
const entornoDeAntes = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : null;

parar(3142);
fs.writeFileSync(
  ENV,
  [
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
    `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
    "WHATSAPP_APP_SECRET=secreto-de-prueba",
    "WHATSAPP_VERIFY_TOKEN=token-de-prueba",
    "WHATSAPP_TOKEN=token-de-prueba",
    "WHATSAPP_PHONE_NUMBER_ID=1210850100000",
    `WHATSAPP_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
    `INSTAGRAM_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
    // El token de la ESCUELA: es el que no tiene que usarse para el hilo del
    // revisor. Que sea distinto del de la Página es lo que hace la prueba.
    "INSTAGRAM_TOKEN=TOKEN-DE-LA-ESCUELA",
    "INSTAGRAM_ACCOUNT_ID=107321267900000",
    `MESSENGER_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
    "MESSENGER_TOKEN=TOKEN-DE-LA-ESCUELA",
    "MESSENGER_PAGE_ID=107321267900000",
    `FACEBOOK_GRAPH_URL=http://127.0.0.1:${PUERTO_META}`,
    "NEXT_PUBLIC_FACEBOOK_APP_ID=111222333",
    "NEXT_PUBLIC_FACEBOOK_CONFIG_ID=444555666",
    "INSTAGRAM_APP_SECRET=secreto-de-prueba",
  ].join("\n") + "\n",
  "utf8",
);

execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-conectar.log 2>&1 < /dev/null &)`, {
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

const subDe = (archivo) => {
  const cuerpo = fs
    .readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8")
    .trim()
    .split(".")[1];
  return JSON.parse(Buffer.from(cuerpo, "base64url").toString()).sub;
};

const galletaDe = (archivo, correo) => {
  const jwt = fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/${archivo}`, "utf8").trim();
  return (
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "x",
        user: { id: subDe(archivo), email: correo },
      }),
    ).toString("base64")
  );
};

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

let falloDuro = null;
try {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
  await ctx.addCookies([
    {
      name: "sb-127-auth-token",
      value: galletaDe("jwt-jefa.txt", "jefa@lac.test"),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));

  const p = await ctx.newPage();
  const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/conectar-${n}.png` });

  // ════════════════════════════════════════════════════════════════════════
  console.log("── 1. LA PANTALLA EXISTE Y TIENE EL BOTÓN ──");
  // ════════════════════════════════════════════════════════════════════════
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Canales"]').click();
  await p.waitForTimeout(2200);
  await foto("1-canales");

  {
    const boton = p.locator('[data-conectar-meta="instagram"]');
    es("APARECE «Conectar Instagram»", await boton.count(), 1);
    es(
      "y lleva al camino de conexión",
      await boton.first().getAttribute("href"),
      "/api/meta/conectar",
    );
    const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("y están los tres canales", /WhatsApp/.test(dicho) && /Instagram/.test(dicho) && /Messenger/.test(dicho), true);
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EL BOTÓN LLEVA AL DIÁLOGO DE META, CON SU CONFIGURACIÓN ──");
  // ════════════════════════════════════════════════════════════════════════
  /*
   * No se sigue la redirección: se mira a dónde apunta. Lo que importa es que
   * lleve el `config_id` —sin él, Facebook no ofrece elegir Página ni cuenta de
   * Instagram, y el revisor no puede completar la prueba— y que la vuelta sea
   * una dirección de este CRM.
   */
  const salida = execSync(
    `curl -s --noproxy '*' -i -o /dev/null -D - -b 'sb-127-auth-token=${galletaDe("jwt-jefa.txt", "jefa@lac.test")}' 'http://127.0.0.1:3142/api/meta/conectar'`,
    { encoding: "utf8", shell: "/bin/bash", maxBuffer: 10 * 1024 * 1024 },
  );
  const destino = /^location:\s*(.+)$/im.exec(salida)?.[1]?.trim() ?? "";
  const galletaState = /^set-cookie:\s*lac_meta_state=([^;]+)/im.exec(salida)?.[1] ?? "";

  console.log(`   va a: ${destino.slice(0, 110)}…`);
  es("redirige al diálogo de Facebook", /\/v[\d.]+\/dialog\/oauth\?/.test(destino), true);
  es("CON EL config_id DE LA CONFIGURACIÓN", /config_id=444555666/.test(destino), true);
  es("con la app de la escuela", /client_id=111222333/.test(destino), true);
  /*
   * La vuelta: lo que importa es el camino, no el nombre de la máquina.
   *
   * El nombre lo pone el proxy que haya delante —en producción, Netlify— y por
   * eso se arma con los encabezados `x-forwarded-*`. Atar la prueba a
   * `127.0.0.1` sería atarla al banco.
   */
  es(
    "y con la vuelta a este CRM",
    /redirect_uri=https?%3A%2F%2F[^&]*%2Fapi%2Fmeta%2Fconectar%2Fvolver/.test(destino),
    true,
  );
  es("y deja el state en una galleta del servidor", galletaState.length > 10, true);

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. UNA VUELTA CON EL state EQUIVOCADO NO CONECTA NADA ──");
  // ════════════════════════════════════════════════════════════════════════
  /*
   * Sin esto, mandarle a alguien con sesión un enlace a `/volver?code=…` con un
   * código propio le dejaría una cuenta ajena conectada en el CRM.
   */
  {
    await p.goto(
      "http://127.0.0.1:3142/api/meta/conectar/volver?code=loquesea&state=inventado",
      { waitUntil: "networkidle" },
    );
    await p.waitForTimeout(1500);
    es(
      "NO SE GUARDÓ NADA",
      sql(`select count(*) from public.canal_credenciales where page_id='${PAGINA_FALSA}'`),
      "0",
    );
    const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("y se dice por qué", /no coincide con la salida/i.test(dicho), true);
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. LA VUELTA BUENA: CANJEA, GUARDA Y SUSCRIBE ──");
  // ════════════════════════════════════════════════════════════════════════
  {
    await ctx.addCookies([
      { name: "lac_meta_state", value: galletaState, domain: "127.0.0.1", path: "/" },
    ]);
    await p.goto(
      `http://127.0.0.1:3142/api/meta/conectar/volver?code=CODIGO-FALSO&state=${encodeURIComponent(galletaState)}`,
      { waitUntil: "networkidle" },
    );
    await p.waitForTimeout(2500);
    await foto("2-conectado");

    const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es("la pantalla dice que se conectó", /Cuenta conectada/i.test(dicho), true);

    es(
      "QUEDÓ GUARDADA LA PÁGINA, PARA LOS DOS CANALES",
      sql(`select count(*) from public.canal_credenciales where page_id='${PAGINA_FALSA}' and activo`),
      "2",
    );
    es(
      "con la cuenta de Instagram ligada",
      sql(
        `select ig_business_account_id from public.canal_credenciales where page_id='${PAGINA_FALSA}' and canal_id=1`,
      ),
      IG_FALSO,
    );
    es(
      "Y CON EL TOKEN DE LA PÁGINA, NO EL DE USUARIO",
      sql(
        `select access_token from public.canal_credenciales where page_id='${PAGINA_FALSA}' limit 1`,
      ),
      TOKEN_DE_PAGINA,
    );

    const pasos = JSON.parse(
      execSync(`curl -s --noproxy '*' http://127.0.0.1:${PUERTO_META}/__conexiones`, {
        encoding: "utf8",
        shell: "/bin/bash",
      }),
    );
    const cuales = pasos.map((x) => x.paso);
    es("se canjeó el código", cuales.includes("canje"), true);
    es("se pidieron las Páginas", cuales.includes("paginas"), true);
    es(
      "Y SE SUSCRIBIÓ LA PÁGINA AL WEBHOOK (lo que todos olvidan)",
      cuales.includes("suscribir"),
      true,
    );
    es(
      "suscrita al campo «messages», que es por donde entran",
      /messages/.test(String(pasos.find((x) => x.paso === "suscribir")?.cuerpo?.subscribed_fields ?? "")),
      true,
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── 5. Y SE CONTESTA CON EL TOKEN DEL REVISOR, NO CON EL DE LA ESCUELA ──");
  // ════════════════════════════════════════════════════════════════════════
  /*
   * ES LA PRUEBA DE VERDAD.
   *
   * Se arma un hilo de Instagram que entró POR LA CUENTA DEL REVISOR —eso lo
   * dice `payload.recipient.id` del mensaje entrante, que el webhook ya venía
   * guardando— y se contesta desde la bandeja. Lo que se mira es con qué token
   * salió la petición a Meta.
   *
   * Sin la resolución por cuenta, saldría con el de la escuela: la conexión se
   * vería perfecta en pantalla y Meta rechazaría cada respuesta del revisor.
   */
  {
    sql(`
      insert into public.conversaciones (canal, identificador, telefono, nombre_perfil, ultimo_mensaje_en)
      values ('instagram', '${IGSID}', null, 'Cliente del Revisor', now());

      insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en, payload)
      select c.id, 'mid.REVISOR.1', 'entrante', 'text', 'hola', 'recibido', now(),
             '{"sender":{"id":"${IGSID}"},"recipient":{"id":"${IG_FALSO}"},"message":{"text":"hola"}}'::jsonb
      from public.conversaciones c where c.identificador = '${IGSID}';
    `);

    const antes = JSON.parse(
      execSync(`curl -s --noproxy '*' http://127.0.0.1:${PUERTO_META}/__recibidos`, {
        encoding: "utf8",
        shell: "/bin/bash",
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).length;

    await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
    await p.waitForTimeout(2600);
    await p.locator('aside button[data-mod="Inbox"]').click();
    await p.waitForTimeout(2400);
    await p.getByText("Cliente del Revisor", { exact: false }).first().click();
    await p.waitForTimeout(1800);

    const caja = p.locator('main textarea, main [contenteditable="true"]').last();
    await caja.click();
    await caja.fill("respuesta del revisor");
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: /^Enviar$/ }).first().click();
    await p.waitForTimeout(3000);
    await foto("3-contestado");

    const todo = JSON.parse(
      execSync(`curl -s --noproxy '*' http://127.0.0.1:${PUERTO_META}/__recibidos`, {
        encoding: "utf8",
        shell: "/bin/bash",
        maxBuffer: 10 * 1024 * 1024,
      }),
    );
    const nuevos = todo.slice(antes).filter((x) => /\/messages/.test(x.url || ""));

    es("salió el mensaje", nuevos.length >= 1, true);
    es(
      "POR LA PÁGINA DEL REVISOR, NO POR LA DE LA ESCUELA",
      String(nuevos[0]?.url ?? "").includes(PAGINA_FALSA),
      true,
    );
    es(
      "Y CON SU TOKEN",
      String(nuevos[0]?.autorizacion ?? "").includes(TOKEN_DE_PAGINA),
      true,
    );
  }
} catch (e) {
  falloDuro = e;
} finally {
  await nav.close();
  limpiar();
  parar(PUERTO_META);
  if (entornoDeAntes != null) {
    fs.writeFileSync(ENV, entornoDeAntes, "utf8");
    parar(3142);
    execSync(
      `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-conectar-vuelta.log 2>&1 < /dev/null &)`,
      { shell: "/bin/bash" },
    );
    for (let i = 0; i < 40; i++) {
      const code = execSync(
        "curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
        { encoding: "utf8", shell: "/bin/bash" },
      ).trim();
      if (code === "200") break;
      execSync("sleep 1");
    }
  }
}

if (falloDuro) throw falloDuro;

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
