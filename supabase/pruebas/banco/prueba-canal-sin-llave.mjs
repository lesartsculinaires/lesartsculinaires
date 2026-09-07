/**
 * Un canal implementado pero sin credenciales: ¿dice qué falta?
 *
 *     node supabase/pruebas/banco/prueba-canal-sin-llave.mjs
 *
 * ============================================================================
 * EL HUECO QUE ESTO TAPA
 * ============================================================================
 *
 * Instagram pasó a `disponible: true` el día que se implementó, y esa pestaña
 * se enciende con el DESPLIEGUE. Los tokens, en cambio, los carga una persona
 * en Netlify DESPUÉS —y para eso primero hay que esperar la aprobación de Meta,
 * que tarda días—.
 *
 * En ese medio la pestaña quedaba encendida, filtrando a una lista vacía y sin
 * decir nada. Es exactamente lo que `canales.ts` viene evitando desde que se
 * escribió: «una pestaña que no responde y no dice por qué es peor que no
 * tenerla». Se había arreglado para los canales sin programar y se había vuelto
 * a abrir para el estado nuevo: programado pero sin enchufar.
 *
 * ============================================================================
 * QUÉ SE PRUEBA
 * ============================================================================
 *
 * La aplicación se levanta DOS VECES, con y sin las credenciales de Instagram,
 * porque eso es lo único que cambia entre los dos estados y se decide en el
 * servidor —los tokens no llegan al navegador—.
 *
 *   SIN LLAVE    La pestaña dice «falta la llave», no filtra, y al tocarla
 *                nombra las dos variables que hay que cargar y la dirección del
 *                webhook. Y NO dice «pronto», que es la espera de otra cosa:
 *                «pronto» no depende de la escuela, esto sí.
 *
 *   CON LLAVE    La pestaña filtra como la de WhatsApp y el aviso desaparece.
 *
 * Necesita el banco armado (`armar.sh`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `llave-${process.pid}-${Math.random()}.sql`);
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

const IGSID = "17841400088800111";
const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where identificador = '${IGSID}');
    delete from public.conversaciones where identificador = '${IGSID}';
  `);
limpiar();

// Un hilo de Instagram, para que la pestaña tenga algo que filtrar.
sql(`
  insert into public.conversaciones
    (telefono, identificador, usuario, nombre_perfil, canal, ultimo_mensaje_en, ultimo_texto)
  values (null, '${IGSID}', 'sofi.llave', 'Sofi De La Llave PRUEBA', 'instagram',
          now(), 'Hola, quiero información');
`);

/*
 * Levantar la aplicación con —o sin— las credenciales de Instagram.
 *
 * Es lo único que separa los dos estados, y se decide en el servidor: los
 * tokens no llegan al navegador, así que no hay forma de probarlo cambiando
 * algo en la página.
 */
const base = [
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141",
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/anon.txt`, "utf8").trim()}`,
  `SUPABASE_SERVICE_ROLE_KEY=${fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-servicio.txt`, "utf8").trim()}`,
  "WHATSAPP_APP_SECRET=secreto-de-prueba",
  "WHATSAPP_VERIFY_TOKEN=verifica-prueba",
  "WHATSAPP_TOKEN=token-de-prueba",
  "WHATSAPP_PHONE_NUMBER_ID=111",
];

/*
 * Parar la aplicación, y ASEGURARSE de que paró.
 *
 * Es la parte de la que depende toda la prueba: si el servidor viejo sigue
 * ocupando el 3142, el nuevo no puede tomar el puerto, el navegador sigue
 * hablando con el de antes, y la segunda mitad de la prueba mide el estado de
 * la primera. Pasó: daba «falta la llave» con las credenciales puestas.
 *
 * Se usa `fuser` y no `ss`, que no está en este contenedor. Y se espera a que
 * el puerto quede libre de verdad en vez de dormir un rato fijo, que es la
 * misma carrera con otra cara.
 */
const pararLaApp = () => {
  try {
    execSync("fuser -k 3142/tcp 2>/dev/null || true", { shell: "/bin/bash" });
  } catch {
    // No estaba levantada. No es un problema.
  }

  for (let i = 0; i < 20; i++) {
    try {
      const ocupado = execSync("fuser 3142/tcp 2>/dev/null || true", {
        encoding: "utf8",
        shell: "/bin/bash",
      }).trim();
      if (!ocupado) return;
    } catch {
      return;
    }
    execSync("sleep 1");
  }
  throw new Error("El puerto 3142 quedó ocupado: la prueba mediría el servidor viejo.");
};

const levantar = (conInstagram) => {
  pararLaApp();
  const env = [...base];
  if (conInstagram) {
    env.push("INSTAGRAM_TOKEN=token-ig-de-prueba", "INSTAGRAM_ACCOUNT_ID=999");
  }
  fs.writeFileSync(`${RAIZ}/.env.local`, env.join("\n") + "\n", "utf8");
  execSync(
    `cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-llave.log 2>&1 < /dev/null &)`,
    { shell: "/bin/bash" },
  );

  // Y se espera a que conteste, en vez de a que pasen unos segundos.
  for (let i = 0; i < 30; i++) {
    try {
      const code = execSync(
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3142/login || true",
        { encoding: "utf8", shell: "/bin/bash" },
      ).trim();
      if (code === "200") return;
    } catch {
      // Todavía no levantó.
    }
    execSync("sleep 1");
  }
  throw new Error("La aplicación no levantó en el 3142.");
};

const abrirLaBandeja = async () => {
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
        user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
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
  await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
  await p.waitForTimeout(2800);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2400);
  return { nav, ctx, p };
};

const foto = (p, n) =>
  p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/llave-${n}.png` });
const texto = async (p) =>
  (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

try {
  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. SIN LAS CREDENCIALES: DICE QUÉ FALTA ──");
  // ══════════════════════════════════════════════════════════════════════
  levantar(false);
  {
    const { nav, ctx, p } = await abrirLaBandeja();
    await foto(p, "1-sin-llave");

    const t = await texto(p);
    es("LA PESTAÑA AVISA QUE FALTA LA LLAVE", /falta la llave/.test(t), true);
    /*
     * Y NO dice «pronto».
     *
     * Son dos esperas distintas y quien las resuelve es distinto: «pronto» es
     * trabajo de programación; esto son dos variables que la escuela puede
     * cargar hoy. Decir lo mismo haría que nadie cargue nada.
     */
    es(
      "y no lo confunde con «pronto», que es otra espera",
      await p.locator('main button[title*="Instagram"][title*="pronto"]').count(),
      0,
    );

    await p.locator('main button[title*="Instagram"]').first().click();
    await p.waitForTimeout(700);
    await foto(p, "2-explicacion");

    const t2 = await texto(p);
    es(
      "AL TOCARLA NOMBRA LAS VARIABLES QUE HAY QUE CARGAR",
      /INSTAGRAM_TOKEN y INSTAGRAM_ACCOUNT_ID/.test(t2),
      true,
    );
    es("y la dirección del webhook", /\/api\/instagram\/webhook/.test(t2), true);
    es(
      "aclarando que el CRM ya está listo, para no rehacerlo",
      /ya sabe recibir y contestar/.test(t2),
      true,
    );
    es(
      "NO FILTRA: la lista vacía no diría nada",
      /Sofi De La Llave PRUEBA/.test(await texto(p)),
      true,
    );

    await ctx.close();
    await nav.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. CON LAS CREDENCIALES: FILTRA COMO WHATSAPP ──");
  // ══════════════════════════════════════════════════════════════════════
  levantar(true);
  {
    const { nav, ctx, p } = await abrirLaBandeja();
    await foto(p, "3-con-llave");

    const t = await texto(p);
    es("YA NO AVISA NADA", /falta la llave/.test(t), false);

    await p.locator('main button[title*="Instagram"]').first().click();
    await p.waitForTimeout(1000);
    await foto(p, "4-filtrado");

    /*
     * Filtrar quiere decir que SE VAN los demás, no que esté el de Instagram.
     *
     * La comprobación anterior sólo miraba que «Sofi» estuviera en la lista, y
     * eso es cierto también SIN filtrar —es la lista completa—. Pasaba en
     * verde con la pestaña sin funcionar, que es como se me escapó que la
     * aplicación no se había reiniciado entre las dos mitades.
     */
    const nombres = (await p.locator("main button.row").allInnerTexts()).join(" ");
    es("Y AHORA SÍ FILTRA: queda el de Instagram", /Sofi De La Llave PRUEBA/.test(nombres), true);
    es(
      "Y SE VAN LOS DE WHATSAPP, que es lo que prueba que filtró",
      /Vence En Dos/.test(nombres),
      false,
    );

    await ctx.close();
    await nav.close();
  }
} finally {
  limpiar();
  // El banco queda como lo dejan las demás pruebas: con Instagram configurado.
  levantar(true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f === 0 ? 0 : 1);
