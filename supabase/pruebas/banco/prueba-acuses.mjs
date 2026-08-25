/**
 * ¿Se ven los tildes en el hilo, y dicen lo que corresponde?
 *
 *     node --experimental-strip-types supabase/pruebas/banco/prueba-acuses.mjs
 *
 * La lógica de qué tilde va con qué estado está probada aparte, en
 * `supabase/pruebas/acuses.test.mjs`. Acá se comprueba lo que esa prueba no
 * puede ver: que los tildes lleguen a dibujarse en la burbuja, que el de
 * «leído» se distinga del de «entregado» —si salieran iguales, la función
 * estaría bien y la pantalla igual no serviría—, y que un mensaje del cliente
 * no lleve ninguno, porque de lo que manda el cliente no hay nada que informar
 * sobre su entrega.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const TEL = "50388000001";

const sql = (q) => {
  const ruta = path.join(os.tmpdir(), `prueba-acuses-${process.pid}.sql`);
  fs.writeFileSync(ruta, q, "utf8");
  fs.chmodSync(ruta, 0o644);
  try {
    return execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -f ${ruta}" 2>&1`, {
      encoding: "utf8",
    }).trim();
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

// Un hilo con los cinco casos a la vez. Se limpia antes y no sólo después:
// `clientes.telefono` no es único, así que una corrida cortada dejaría un
// duplicado y la siguiente no podría sembrar.
const sembrado = sql(`
  delete from mensajes where conversacion_id in
    (select id from conversaciones where telefono='${TEL}');
  delete from conversaciones where telefono='${TEL}';
  delete from oportunidades where cliente_id in
    (select id from clientes where telefono='${TEL}');
  delete from clientes where telefono='${TEL}';

  insert into clientes (nombre, telefono) values ('Acuses Prueba','${TEL}');
  insert into conversaciones (telefono, cliente_id, estado, ultimo_texto, ultimo_mensaje_en, sin_leer, archivada)
  select '${TEL}', c.id, 'open', 'Hola', now(), 0, false
    from clientes c where c.telefono='${TEL}';

  insert into mensajes (conversacion_id, direccion, tipo, texto, estado, creado_en)
  select cv.id, d.direccion, 'text', d.texto, d.estado, now() - (d.orden || ' minutes')::interval
    from conversaciones cv,
         (values
           ('entrante', 'Hola, me interesa', null,        50),
           ('saliente', 'Recien salido',     'enviado',   40),
           ('saliente', 'Ya en el telefono', 'delivered', 30),
           ('saliente', 'Ya lo abrio',       'read',      20),
           ('saliente', 'No se pudo',        'failed',    10)
         ) as d(direccion, texto, estado, orden)
   where cv.telefono='${TEL}';
`);

{
  const hilo = sql(`select count(*) from conversaciones where telefono='${TEL}';`);
  if (hilo !== "1") {
    // Con la salida de psql pegada al aviso: fue así como se vio que las
    // secuencias de id del banco quedaban atrasadas, que desde afuera se veía
    // nada más como una lista de conversaciones vacía.
    console.error(`No se pudo sembrar el hilo (hay ${hilo}). Salida de psql:\n${sembrado}`);
    process.exit(1);
  }
}

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
      user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
    }),
  ).toString("base64");

const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
await ctx.addInitScript((h) => {
  try {
    localStorage.setItem("lac.reservas.visto", h);
  } catch {}
}, new Date().toISOString().slice(0, 10));

const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));

await p.goto("http://127.0.0.1:3142/?mod=x", { waitUntil: "networkidle" });
await p.waitForTimeout(2200);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(1800);
await p.locator("main button").filter({ hasText: /Acuses Prueba|50388000001/ }).first().click();
await p.waitForTimeout(1600);

/** La burbuja que contiene ese texto. */
const burbuja = (texto) =>
  p.locator("main div").filter({ hasText: texto }).last();

/** Cuántos tildes dibuja la burbuja de ese mensaje. */
const tildesDe = async (texto) =>
  await burbuja(texto).locator('svg[role="img"] path').count();

/** Lo que diría un lector de pantalla. */
const dicho = async (texto) =>
  await burbuja(texto).locator('svg[role="img"]').getAttribute("aria-label");

console.log("── los tildes están y son los que van ──");
es("«enviado» dibuja UN tilde", await tildesDe("Recien salido"), 1);
es("«delivered» dibuja DOS", await tildesDe("Ya en el telefono"), 2);
es("«read» dibuja DOS", await tildesDe("Ya lo abrio"), 2);
es("«failed» dibuja una cruz (un trazo)", await tildesDe("No se pudo"), 1);

console.log("\n── y se distinguen entre sí ──");
{
  const color = async (texto) =>
    await burbuja(texto).locator('svg[role="img"] path').last().getAttribute("stroke");
  const entregado = await color("Ya en el telefono");
  const leido = await color("Ya lo abrio");
  es("EL LEÍDO NO SE VE IGUAL QUE EL ENTREGADO", entregado !== leido, true);
  console.log(`   (entregado ${entregado} · leído ${leido})`);
}

console.log("\n── se pueden leer en voz alta ──");
es("el de enviado", await dicho("Recien salido"), "Enviado");
es("el de entregado", await dicho("Ya en el telefono"), "Entregado");
es("el de leído", await dicho("Ya lo abrio"), "Leído");
es("el del fallo", await dicho("No se pudo"), "No se pudo entregar");

console.log("\n── la palabra sigue estando, y en castellano ──");
{
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  es("dice «Entregado», no «delivered»", /Entregado/.test(t) && !/delivered/.test(t), true);
  es("dice «Leído», no «read»", /Leído/.test(t) && !/· read/.test(t), true);
}

console.log("\n── lo que manda el cliente no lleva acuse ──");
es("NINGÚN TILDE EN EL MENSAJE ENTRANTE", await tildesDe("Hola, me interesa"), 0);

await p.screenshot({ path: (process.env.SP ?? os.tmpdir()) + "/acuses.png" });
es("sin errores en la página", errores, []);
await nav.close();

sql(`
  delete from mensajes where conversacion_id in
    (select id from conversaciones where telefono='${TEL}');
  delete from conversaciones where telefono='${TEL}';
  delete from oportunidades where cliente_id in
    (select id from clientes where telefono='${TEL}');
  delete from clientes where telefono='${TEL}';
`);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
