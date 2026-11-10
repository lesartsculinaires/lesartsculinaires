/**
 * La bandeja no se vacía cuando otra pestaña del CRM está en otro módulo.
 *
 *     node supabase/pruebas/banco/prueba-bandeja-otra-pestana.mjs
 *
 * Lo vieron en el video del 9/11/2026: grabando una nota de voz en el Inbox,
 * la pantalla quedó en blanco unos segundos y volvió con la nota perdida.
 *
 * La causa: el servidor decide qué datos de pantalla mandar con la galleta
 * `lac.mod`, que es UNA para todo el navegador. Con otra pestaña del CRM en el
 * Pipeline, la galleta dice «Pipeline»; cuando el Inbox se refresca (llega un
 * mensaje, se mueve un lead), el servidor manda los datos del Pipeline, el
 * navegador tira la bandeja que tenía y la vuelve a pedir, y mientras tanto
 * cambia el Inbox entero por «Cargando…». El Inbox se desmonta: se pierden la
 * grabación, el borrador y el hilo abierto.
 *
 * Se arma eso a mano: se abre un hilo, se empieza a grabar, se pone la galleta
 * en «Pipeline» como lo haría otra pestaña, y se refresca. Lo esperado: el
 * Inbox nunca se cambia por «Cargando…» y la grabación sigue.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const sql = (q) =>
  execFileSync("su", ["postgres", "-c", "psql -h /tmp -p 5511 -d crm -A -t -q -v ON_ERROR_STOP=1 -f -"], {
    input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const TEL = "50399440001";
const limpiar = () => sql(`
  delete from public.mensajes where conversacion_id in (select id from public.conversaciones where telefono = '${TEL}');
  delete from public.conversaciones where telefono = '${TEL}';
`);
limpiar();
sql(`
  insert into public.conversaciones (telefono, nombre_perfil, ultimo_mensaje_en, ultimo_texto)
  values ('${TEL}', 'Otra Pestaña', now() - interval '5 minutes', 'Contame más');
  insert into public.mensajes (conversacion_id, wa_id, direccion, tipo, texto, creado_en)
  select c.id, 'wamid.OTRA.1', 'entrante', 'text', 'Contame más', now() - interval '5 minutes'
    from public.conversaciones c where c.telefono = '${TEL}';
`);

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt", "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

/** Abre el hilo, empieza a grabar y refresca; devuelve qué se vio en los 4 s siguientes. */
async function probar(otraPestana) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 }, permissions: ["microphone"] });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: "Inbox", domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
    try { localStorage.setItem("lac.reservas.visto", hoy); } catch {}
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.locator('button.row:has-text("Otra Pestaña")').click();
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Grabar una nota de voz" }).click();
  await p.waitForSelector("text=Grabando…");

  if (otraPestana) {
    // Lo que hace otra pestaña del CRM al pasar al Pipeline.
    await ctx.addCookies([{ name: "lac.mod", value: "Pipeline", domain: "127.0.0.1", path: "/" }]);
  }
  // Un refresco, como el que llega solo con un mensaje nuevo.
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Actualizar");
    b?.click();
  });

  let vioCargando = false;
  let perdioGrabacion = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(200);
    if (await p.getByText("Cargando…", { exact: true }).count()) vioCargando = true;
    if (!(await p.getByText("Grabando…").count())) perdioGrabacion = true;
  }
  await ctx.close();
  return { vioCargando, perdioGrabacion, errores };
}

try {
  console.log("── sin otra pestaña ──");
  const sola = await probar(false);
  es("el Inbox no se cambia por «Cargando…»", sola.vioCargando, false);
  es("la grabación sigue", sola.perdioGrabacion, false);

  console.log("\n── con otra pestaña en el Pipeline (el caso del video) ──");
  const otra = await probar(true);
  es("el Inbox no se cambia por «Cargando…»", otra.vioCargando, false);
  es("la grabación sigue", otra.perdioGrabacion, false);
  if (sola.errores.length || otra.errores.length) { f++; console.log("✗ errores en el navegador:", [...sola.errores, ...otra.errores]); }
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
}
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
