/**
 * La pestaña «Monitoreo Agente» del Inbox: los chats con una alerta del agente
 * IA que nadie del equipo atendió todavía, con su número.
 *
 *     node supabase/pruebas/banco/prueba-monitoreo-agente.mjs
 *
 * Pedido el 26/11/2026 para LAC y HC. Se dejan alertas del agente (notas
 * internas con `origen.tipo` «alerta») en tres chats de Ale:
 *   · A: nadie le escribió después → cuenta;
 *   · B: una persona le escribió después → ya no cuenta;
 *   · C: después sólo escribió el agente → sigue contando.
 * Se comprueba el número de la pestaña, que la lista muestre A y C con el
 * motivo, y que al escribirle una persona a A se vaya sola, en vivo.
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

const A = 3319, B = 3325, C = 9003; // Vence En Dos, Prueba Iconos, Vivo Abierta 779 (de Ale)
const nuevos = [];
const meter = (conv, dir, privado, texto, origen, haceMin) =>
  nuevos.push(Number(sql(
    `insert into mensajes (conversacion_id, direccion, tipo, texto, privado, origen, creado_en) values ` +
    `(${conv}, '${dir}', 'text', '${texto}', ${privado}, ${origen ?? "null"}, now() - interval '${haceMin} minutes') returning id`,
  ).split("\n")[0]));
const ALERTA = "jsonb_build_object('tipo', 'alerta', 'agente_ia', true)";
const DEL_AGENTE = "jsonb_build_object('agente_ia', true)";
meter(A, "saliente", true, "🤖 Agente IA → el cliente necesita atención\nMotivo: en negociación y dejó de responder", ALERTA, 10);
meter(B, "saliente", true, "🤖 Agente IA → el cliente necesita atención\nMotivo: envió datos personales", ALERTA, 20);
meter(B, "saliente", false, "Hola, soy Ale, ¿te ayudo con la reserva?", null, 15);
meter(C, "saliente", true, "🤖 Agente IA → el cliente necesita atención\nMotivo: agendar visita", ALERTA, 30);
meter(C, "saliente", false, "¿Seguís ahí? Te comparto el pensum.", DEL_AGENTE, 25);
sql(`update conversaciones set ultimo_mensaje_en=now() where id in (${A}, ${B}, ${C})`);

const limpiar = () => sql(`delete from mensajes where id in (${nuevos.join(",")})`);

const jwt = fs.readFileSync(`${BANCO}/jwt-ale.txt`, "utf8").trim();
const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: sub, email: "ale@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
try {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/?mod=Inbox`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();

  console.log("── 1. LA PESTAÑA Y SU NÚMERO ──");
  const pestana = p.locator("[data-pestana-monitoreo]");
  await pestana.waitFor({ timeout: 15000 });
  es("dice «Monitoreo Agente»", /Monitoreo Agente/.test(await pestana.innerText()), true);
  es("con 2 chats sin atender (A y C; B ya lo contestó una persona)", await pestana.locator("[data-alertas]").getAttribute("data-alertas"), "2");
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/monitoreo-1-pestana.png` });

  console.log("\n── 2. LA LISTA ──");
  await pestana.click();
  await p.waitForTimeout(500);
  const filas = p.locator("button.row");
  const textos = await filas.allInnerTexts();
  es("sólo los dos chats con alerta", textos.length, 2);
  es("son Vence En Dos y Vivo Abierta 779", [textos.some((x) => x.includes("Vence En Dos")), textos.some((x) => x.includes("Vivo Abierta 779"))], [true, true]);
  es("cada uno con la pastilla roja «Sin respuesta»", await p.locator("[data-pastilla-alerta]").count(), 2);
  es("y el motivo en lugar del último mensaje", textos.some((x) => /Motivo: en negociación y dejó de responder/.test(x)), true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/monitoreo-2-lista.png` });

  console.log("\n── 3. ALGUIEN LE ESCRIBE A A ──");
  meter(A, "saliente", false, "Hola, aquí Ale. ¿Te quedó alguna duda?", null, 0);
  await p.waitForFunction(() => document.querySelector("[data-alertas]")?.getAttribute("data-alertas") === "1", null, { timeout: 20000 })
    .then(() => es("el número baja a 1, en vivo", true, true))
    .catch(() => es("el número baja a 1, en vivo", false, true));
  es("y A sale de la lista", (await p.locator("button.row").allInnerTexts()).some((x) => x.includes("Vence En Dos")), false);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/monitoreo-3-atendido.png` });

  console.log("\n── 4. LAS DEMÁS PESTAÑAS ──");
  await p.getByRole("button", { name: /^Activas$/ }).click();
  await p.waitForTimeout(400);
  es("al volver a «Activas» se ven todos otra vez", (await p.locator("button.row").count()) > 2, true);
  es("y la pastilla roja sigue en el chat con alerta", await p.locator("[data-pastilla-alerta]").count(), 1);

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
