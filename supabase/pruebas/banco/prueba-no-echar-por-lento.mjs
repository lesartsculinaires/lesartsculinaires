/**
 * Una base lenta NO echa al login a quien está trabajando.
 *
 *     node supabase/pruebas/banco/prueba-no-echar-por-lento.mjs
 *
 * ============================================================================
 * LO QUE SE VIENE A ARREGLAR
 * ============================================================================
 *
 * `getUser()` contesta `null` por dos motivos que no se parecen en nada: que no
 * haya sesión, o que Supabase no haya contestado dentro del tope de tres
 * segundos. La portada los trataba igual —`if (!user) redirect("/login")`— así
 * que una base lenta tiraba al login a gente con la sesión intacta.
 *
 * Y se les pedía la contraseña para volver adonde ya estaban. La prueba de que
 * la sesión seguía viva es que el propio login les decía «ya tenés una sesión
 * abierta como …».
 *
 * Medido en producción: el 6 y el 7 de octubre de 2026, las dos asesoras que
 * más usan el CRM volvieron a entrar veinte y trece veces en un día. Tres de
 * esas veces en dos minutos, con tokens de segundos de vida —o sea que no era
 * vencimiento ni refresco—. Las cuentas de poco uso no lo sufrieron: la
 * lentitud llega con la carga, y ellas son las que cargan.
 *
 * ============================================================================
 * LAS DOS MITADES, Y POR QUÉ NINGUNA SIRVE SOLA
 * ============================================================================
 *
 *   QUE NO ECHE      Con la base lenta y la sesión puesta, no puede terminar en
 *                    el login. Es lo que se vino a arreglar.
 *
 *   QUE SIGA         Y sin sesión SÍ tiene que mandar al login. Si se perdiera
 *   ECHANDO          esa mitad, el arreglo habría abierto el CRM a cualquiera,
 *                    que es muchísimo peor que el problema original.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = "/home/user/lesartsculinaires";
const APP = "http://127.0.0.1:3142";
const PROXY = "http://127.0.0.1:3141";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `lento-${process.pid}-${Math.random()}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    const salida = execSync(
      `su postgres -c "psql -h /tmp -p 5511 -d crm -v ON_ERROR_STOP=1 -A -t -q -f ${ruta}" 2>&1`,
      { encoding: "utf8" },
    ).trim();
    if (/ERROR:/m.test(salida)) {
      console.error(`\nLa base rechazó una sentencia de la prueba:\n${salida}\n`);
      process.exit(1);
    }
    return salida;
  } finally {
    fs.rmSync(ruta, { force: true });
  }
};

/*
 * Un hilo de WhatsApp para poder probar el envío.
 *
 * Se siembra acá y no se da por hecho que el banco tenga alguno: sin hilo, el
 * paso 3 se saltearía, y un paso que se saltea en silencio es un paso que no
 * prueba nada —se descubrió así, en verde y sin haber comprobado lo que decía—.
 */
const TEL = "50370555123";
const QUIEN = "Lento De Prueba";

const limpiar = () =>
  sql(`
    delete from public.mensajes where conversacion_id in
      (select id from public.conversaciones where telefono = '${TEL}');
    delete from public.conversaciones where telefono = '${TEL}';
    delete from public.clientes where nombre = '${QUIEN}';
  `);

const sembrar = () => {
  limpiar();
  sql(`
    insert into public.clientes (nombre, telefono) values ('${QUIEN}', '${TEL}');
    insert into public.conversaciones
      (telefono, identificador, nombre_perfil, canal, cliente_id, ultimo_mensaje_en, ultimo_texto)
    select '${TEL}', '${TEL}', '${QUIEN}', 'whatsapp', c.id, now(), 'Hola, quiero información'
      from public.clientes c where c.nombre = '${QUIEN}';
    insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
    select v.id, 'wamid.LENTO${Date.now()}', 'entrante', 'text', 'Hola, quiero información', now()
      from public.conversaciones v where v.telefono = '${TEL}';
  `);
};

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Pone o quita la lentitud del Supabase de mentira. */
const lentitud = async (ms) => {
  await fetch(`${PROXY}/__lento?ms=${ms}`, { method: "POST" });
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
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

sembrar();

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/** Abre la portada y dice DÓNDE terminó. */
const dondeTermina = async (conSesion) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  if (conSesion) {
    await ctx.addCookies([
      { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    ]);
  }
  await ctx.addInitScript((h) => {
    try {
      localStorage.setItem("lac.reservas.visto", h);
    } catch {}
  }, new Date().toISOString().slice(0, 10));
  const p = await ctx.newPage();
  try {
    /*
     * `domcontentloaded` y no `networkidle`: con la base demorada a propósito
     * la red nunca se queda quieta, y esperar eso mediría la demora en vez de
     * medir a dónde fue a parar la persona.
     */
    await p.goto(`${APP}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(1500);
    const url = p.url();
    const texto = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    return { url, texto };
  } finally {
    await ctx.close();
  }
};

try {
  console.log("── 1. CON LA BASE RÁPIDA, TODO COMO SIEMPRE ──");
  {
    await lentitud(0);
    const { url } = await dondeTermina(true);
    es("con sesión se entra al CRM", url.includes("/login"), false);

    const sin = await dondeTermina(false);
    es("y sin sesión se va al login", sin.url.includes("/login"), true);
  }

  console.log("\n── 2. CON LA BASE LENTA, NO SE ECHA A NADIE ──");
  {
    /*
     * Cinco segundos: más que el tope de tres con el que `getUser()` se rinde,
     * y menos que lo que tarda un proyecto dormido de verdad —se midieron 11,3
     * segundos—. Alcanza para disparar exactamente el caso que echaba gente.
     */
    await lentitud(5000);

    const { url, texto } = await dondeTermina(true);
    es("NO TERMINA EN EL LOGIN", url.includes("/login"), false);

    /*
     * Y si no pudo confirmar, lo dice y ofrece reintentar. Lo que no puede
     * hacer es pedir la contraseña de vuelta.
     */
    const seEntendio =
      /No pudimos confirmar tu sesión/i.test(texto) || /Dashboard|Pipeline|Clientes/i.test(texto);
    es("o entra, o explica que no pudo confirmar", seEntendio, true);
    es("Y NUNCA PIDE LA CONTRASEÑA OTRA VEZ", /Contraseña/i.test(texto), false);
  }

  console.log("\n── 3. Y TAMPOCO SE CAE AL MANDAR UN MENSAJE ──");
  {
    /*
     * La otra puerta, y la que se descubrió tarde. El 8 de octubre de 2026, una
     * hora después de arreglar que la PANTALLA no echara a nadie, una asesora no
     * podía contestar: la acción del servidor se encontraba con el mismo `null`
     * de `getUser()` y devolvía «Sesión no válida. Volvé a iniciar sesión» con la
     * sesión perfectamente viva.
     *
     * Arreglar una mitad y dejar la otra es lo que convierte un problema en dos
     * problemas que parecen el mismo.
     */
    await lentitud(5000);

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
    try {
      await p.goto(`${APP}/?mod=Inbox`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(12000);

      const hilo = p.locator("button.row").first();
      if ((await hilo.count()) > 0) {
        await hilo.click();
        await p.waitForTimeout(6000);

        const caja = p.locator("main textarea").first();
        if ((await caja.count()) > 0) {
          await caja.fill("Prueba con la base lenta");
          await p.getByRole("button", { name: /^Enviar$/ }).first().click();
          await p.waitForTimeout(14000);

          const texto = (await p.locator("body").innerText()).replace(/\s+/g, " ");
          es("NO DICE QUE LA SESIÓN NO VALE", /Sesión no válida/i.test(texto), false);
          /*
           * Y sobre todo: que no mande a volver a entrar. Ése es el texto que
           * hacía que la gente cerrara sesión y perdiera lo que escribía.
           */
          es(
            "Y NO MANDA A VOLVER A INICIAR SESIÓN COMO PRIMERA OPCIÓN",
            /^.*Volvé a iniciar sesión/.test(texto) && !/Probá de nuevo/.test(texto),
            false,
          );
        } else {
          f++;
          console.log("✗ no apareció la caja de escribir: el envío no se pudo probar");
        }
      } else {
        f++;
        console.log("✗ no apareció el hilo sembrado: el envío no se pudo probar");
      }
    } finally {
      await ctx.close();
    }
  }

  console.log("\n── 4. PERO SIN SESIÓN SIGUE ECHANDO ──");
  {
    /*
     * La otra mitad. Si el arreglo se hubiera llevado esto puesto, el CRM
     * quedaría abierto a cualquiera cada vez que la base va lenta: mucho peor
     * que el problema que se vino a resolver.
     */
    const { url } = await dondeTermina(false);
    es("LENTA Y SIN SESIÓN: AL LOGIN", url.includes("/login"), true);
  }
} catch (e) {
  f++;
  console.log(`✗ la prueba se cortó: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  // Se deja el banco como estaba, pase lo que pase: una lentitud olvidada
  // haría fallar todas las demás pruebas sin decir por qué.
  await lentitud(0).catch(() => {});
  limpiar();
  await nav.close().catch(() => {});
  void os;
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
