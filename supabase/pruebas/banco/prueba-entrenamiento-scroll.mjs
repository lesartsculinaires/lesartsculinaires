/**
 * En «Entrenamiento Mathieu» cada columna se desplaza por su cuenta.
 *
 *     node supabase/pruebas/banco/prueba-entrenamiento-scroll.mjs
 *
 * Pedido el 28/11/2026: con muchos chats en la lista y un chat largo, había que
 * bajar la página entera para llegar a un chat viejo. Se crean 25 chats con
 * mensajes de Mathieu (uno de ellos con 60 mensajes) y se comprueba que la
 * página no crece más que la ventana, que la lista y el chat se desplazan por
 * dentro, y que al abrir el chat largo se ve el final.
 * Al final se borra todo lo que se metió.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const FOTOS = process.env.FOTOS;
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const ALE = "11111111-0000-0000-0000-000000000001";
const convs = [];
for (let i = 0; i < 25; i++) {
  convs.push(Number(sql(`insert into conversaciones (telefono, canal, nombre_perfil, vendedor_id, ultimo_mensaje_en) values ('5037999${String(i).padStart(4, "0")}', 'whatsapp', 'Prueba Scroll ${i}', 901, now() - interval '${i} minutes') returning id`).split("\n")[0]));
}
const LARGO = convs[0];
for (const [i, c] of convs.entries()) {
  const n = c === LARGO ? 30 : 1;
  for (let k = 0; k < n; k++) {
    sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en) values (${c}, 'entrante', 'text', 'Pregunta ${k} del cliente ${i}', now() - interval '${i * 100 + (n - k) * 2} minutes')`);
    sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, origen, creado_en) values (${c}, 'saliente', 'text', 'Respuesta ${k} de Mathieu', jsonb_build_object('agente_ia', true), now() - interval '${i * 100 + (n - k) * 2 - 1} minutes')`);
  }
}
sql(`insert into agente_entrenadores (usuario_id) values ('${ALE}') on conflict do nothing`);
const limpiar = () => {
  sql(`delete from mensajes where conversacion_id in (${convs.join(",")})`);
  sql(`delete from conversaciones where id in (${convs.join(",")})`);
  sql(`delete from agente_entrenadores where usuario_id='${ALE}'`);
};

const jwt = fs.readFileSync(`${BANCO}/jwt-ale.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: ALE, email: "ale@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
try {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=Inbox`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();
  await p.locator("[data-fila-entrenamiento]").click();
  await p.locator(`[data-chat-mathieu="${LARGO}"]`).waitFor({ timeout: 15000 });
  es("salen los 25 chats", await p.locator("[data-chat-mathieu]").count(), 25);

  await p.locator(`[data-chat-mathieu="${LARGO}"]`).click();
  await p.locator("[data-msg-agente]").first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(600);

  const medidas = await p.evaluate(() => {
    const doc = document.scrollingElement;
    const lista = document.querySelector('[data-chat-mathieu]')?.parentElement;
    const hilo = document.querySelector("[data-hilo-ent]");
    return {
      pagina: doc.scrollHeight - window.innerHeight,
      listaSeDesplaza: !!lista && lista.scrollHeight > lista.clientHeight + 10,
      hiloSeDesplaza: !!hilo && hilo.scrollHeight > hilo.clientHeight + 10,
      hiloAlFinal: !!hilo && hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 40,
    };
  });
  es("la página no crece más que la ventana", medidas.pagina <= 40, true);
  es("la lista de chats se desplaza por dentro", medidas.listaSeDesplaza, true);
  es("el chat se desplaza por dentro", medidas.hiloSeDesplaza, true);
  es("al abrir el chat se ve el final", medidas.hiloAlFinal, true);

  // Llegar al último chat de la lista sin mover la página.
  await p.locator(`[data-chat-mathieu="${convs[24]}"]`).scrollIntoViewIfNeeded();
  const paginaQuieta = await p.evaluate(() => document.scrollingElement.scrollTop);
  es("llegar al chat más viejo no mueve la página", paginaQuieta, 0);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-scroll.png` });
  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
