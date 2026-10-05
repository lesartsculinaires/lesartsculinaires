/**
 * Si la llamada de enviar no contesta, el botón no se queda trabado.
 *
 *     node supabase/pruebas/banco/prueba-envio-sin-respuesta.mjs
 *
 * ============================================================================
 * LO QUE LE PASÓ A VENTAS
 * ============================================================================
 *
 * Una asesora mandó un mensaje y la pantalla se quedó en «Enviando…». Arriba,
 * una barra roja en inglés: «An unexpected response was received from the
 * server.».
 *
 * El mensaje HABÍA SALIDO. Estaba guardado con su identificador de Meta, el
 * cliente lo leyó y contestó seis minutos después. Lo único que falló fue la
 * respuesta de vuelta al navegador.
 *
 * Y ahí está el daño de verdad, que no es el botón: quien atiende ve «Enviando…»
 * para siempre, no tiene forma de saber si salió, y lo manda otra vez. El
 * cliente recibe dos veces lo mismo, que es justo lo que hace que la gente
 * bloquee un número de WhatsApp.
 *
 * ============================================================================
 * CÓMO SE REPRODUCE SIN ROMPER NADA
 * ============================================================================
 *
 * Cortando la llamada desde el navegador. Las acciones del servidor viajan como
 * un POST a la propia página; interceptarlo y abortarlo deja la promesa
 * rechazada, que es exactamente lo que pasa cuando la pestaña quedó abierta
 * desde antes de un despliegue o cuando se venció la sesión.
 *
 * Lo que se comprueba es lo mínimo que hay que hacer cuando no se sabe si salió:
 * soltar el botón, recargar el hilo —que él sí sabe— y decirlo.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación compilada.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = "/home/user/lesartsculinaires";
const TEL = "50366" + String(Date.now()).slice(-6);

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-sinrta-${process.pid}-${Math.random()}.sql`);
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
    delete from mensajes where conversacion_id in
      (select id from conversaciones where telefono='${TEL}');
    delete from conversaciones where telefono='${TEL}';
  `);
};
limpiar();

/*
 * Un hilo con un mensaje entrante RECIENTE: la ventana de 24 horas abierta, que
 * es lo que habilita la caja de escribir sin plantilla.
 */
sql(`
  insert into conversaciones (canal, telefono, identificador, nombre_perfil, ultimo_mensaje_en)
  values ('whatsapp', '${TEL}', '${TEL}', 'Sin Respuesta Prueba', now());

  insert into mensajes (conversacion_id, wa_id, direccion, tipo, texto, estado, creado_en)
  select c.id, 'wamid.SINRTA.${Date.now()}', 'entrante', 'text', 'hola, me interesa', 'recibido', now()
  from conversaciones c where c.telefono='${TEL}';
`);

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

parar(3142);
execSync(`cd ${RAIZ} && (setsid npx next start -p 3142 > /tmp/next-sinrta.log 2>&1 < /dev/null &)`, {
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

const galleta =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: fs.readFileSync(`${RAIZ}/supabase/pruebas/banco/jwt-jefa.txt`, "utf8").trim(),
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

let falloDuro = null;
try {
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
  const foto = (n) => p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + `/sinrta-${n}.png` });

  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(2400);
  await p.getByText("Sin Respuesta Prueba", { exact: false }).first().click();
  await p.waitForTimeout(1800);

  const boton = () => p.getByRole("button", { name: /^(Enviar|Enviando…)$/ }).last();
  es("el hilo está abierto y se puede escribir", await boton().count(), 1);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── SE CORTA LA LLAMADA Y SE MANDA ──");
  // ══════════════════════════════════════════════════════════════════════
  /*
   * Desde acá, las acciones del servidor dejan de contestar. Es el escenario
   * exacto: el servidor hace su trabajo —o no, da igual— y la respuesta nunca
   * vuelve.
   */
  let cortadas = 0;
  await p.route("http://127.0.0.1:3142/**", async (ruta) => {
    if (ruta.request().method() === "POST") {
      cortadas += 1;
      await ruta.abort("connectionfailed");
      return;
    }
    await ruta.continue();
  });

  const caja = p.locator("main textarea").last();
  await caja.click();
  await caja.fill("mensaje que no se sabe si salió");
  await p.waitForTimeout(400);
  await boton().click();

  // Tiempo de sobra: lo que se mide es que NO se quede, no cuánto tarda.
  await p.waitForTimeout(6000);
  await foto("1-despues-del-corte");

  es("se intentó mandar de verdad", cortadas >= 1, true);

  {
    const texto = (await boton().innerText()).trim();
    console.log(`   el botón dice: «${texto}»`);
    es("EL BOTÓN SE SOLTÓ, no quedó en «Enviando…»", texto, "Enviar");
  }

  {
    const dicho = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    es(
      "SE AVISA, en castellano",
      /Fijate en el hilo antes de mandarlo de nuevo/i.test(dicho),
      true,
    );
    es(
      "y se explica qué pasó sin dejar nada en inglés",
      /unexpected response|Failed to fetch/i.test(dicho),
      false,
    );
  }
} catch (e) {
  falloDuro = e;
} finally {
  await nav.close();
  limpiar();
}

if (falloDuro) throw falloDuro;

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
