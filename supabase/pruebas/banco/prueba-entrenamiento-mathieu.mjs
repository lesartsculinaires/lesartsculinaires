/**
 * «Entrenamiento Mathieu» en el Inbox, y la métrica de Mathieu en el Dashboard.
 *
 *     node supabase/pruebas/banco/prueba-entrenamiento-mathieu.mjs
 *
 * Pedido el 27/11/2026 (LAC). Ale hace de Raquel/Alexandra (está en
 * `agente_entrenadores`), Jefa es administradora, Huri no tiene permiso.
 * Se comprueba:
 *   1. Huri no ve la fila fija, ni el botón «Enseñar a Mathieu», ni el panel
 *      de Mathieu en el Dashboard.
 *   2. Ale elige el chat, sólo puede marcar mensajes de Mathieu, y guarda: se
 *      aplica al momento (entra a agente_casos aprobado y activo), con el
 *      texto exacto del mensaje y del cliente. No hay pestaña de aprobación.
 *   3. Desde el chat, «Enseñar a Mathieu» abre con ese mensaje ya marcado.
 *   4. En «Cambios hechos» se desactiva y se vuelve a activar.
 *   5. Jefa también entra, y en el Dashboard ve el panel de Mathieu con los
 *      mensajes que contestó y el cambio hecho.
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
const CONV = 3319; // Vence En Dos, de Ale
const nuevos = [];
const meter = (dir, texto, origen, haceMin) =>
  nuevos.push(Number(sql(
    `insert into mensajes (conversacion_id, direccion, tipo, texto, origen, creado_en) values ` +
    `(${CONV}, '${dir}', 'text', '${texto}', ${origen ?? "null"}, now() - interval '${haceMin} minutes') returning id`,
  ).split("\n")[0]));
meter("entrante", "Hola, cuanto cuesta el diplomado de cocina", null, 30);
meter("saliente", "El diplomado cuesta [PRECIO]. Te comparto el pensum?", "jsonb_build_object('agente_ia', true)", 29);
meter("saliente", "Hola, soy Ale, te ayudo con la reserva", null, 20);
const [, AGENTE, HUMANO] = nuevos;
sql(`update conversaciones set ultimo_mensaje_en=now() where id=${CONV}`);
const casosAntes = Number(sql("select coalesce(max(id),0) from agente_casos"));
sql("insert into agente_casos (escenario, escenario_nombre, titulo, cliente_ejemplo, respuesta_recomendada, aprobado_gerencia) values (1, 'Pregunta solo por el precio', 'prueba', 'prueba', 'prueba', true), (11, 'Otra situación / escenario libre', 'prueba', 'prueba', 'prueba', true)");
sql(`insert into agente_entrenadores (usuario_id) values ('${ALE}') on conflict do nothing`);
const mes = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 7) + "-01";
const mensajesDelMes = Number(sql(`select count(*) from mensajes where origen ? 'agente_ia' and direccion='saliente' and not privado and (creado_en at time zone 'America/El_Salvador')::date >= '${mes}'`));

const limpiar = () => {
  sql("delete from agente_ejemplos");
  sql(`delete from agente_casos where id > ${casosAntes}`);
  sql(`delete from agente_entrenadores where usuario_id='${ALE}'`);
  sql(`delete from mensajes where id in (${nuevos.join(",")})`);
};

const galleta = (quien) => {
  const jwt = fs.readFileSync(`${BANCO}/jwt-${quien}.txt`, "utf8").trim();
  const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
  return "base64-" + Buffer.from(JSON.stringify({
    access_token: jwt, token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
    user: { id: sub, email: `${quien}@lac.test` },
  })).toString("base64");
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
async function abrir(quien, mod = "Inbox") {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta(quien), domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
  await p.goto(`${APP}/?mod=${encodeURIComponent(mod)}`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();
  if (mod === "Inbox") await p.locator(".bandeja-lista").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  return p;
}

try {
  console.log("── 1. HURI, SIN PERMISO ──");
  let p = await abrir("huri");
  es("no ve la fila fija", await p.locator("[data-fila-entrenamiento]").count(), 0);
  es("ni el atajo en los chats", await p.locator("[data-ensenar-mathieu]").count(), 0);
  await p.context().close();
  p = await abrir("huri", "Dashboard");
  es("ni el panel de Mathieu en el Dashboard", await p.locator("[data-mathieu]").count(), 0);
  await p.context().close();

  console.log("\n── 2. ALE GUARDA UN CAMBIO, SIN APROBACIÓN ──");
  p = await abrir("ale");
  const fila = p.locator("[data-fila-entrenamiento]");
  es("ve la fila «Entrenamiento Mathieu» arriba, con 0 cambios activos", [/Entrenamiento Mathieu/.test(await fila.innerText()), await fila.locator("[data-cambios-activos]").getAttribute("data-cambios-activos")], [true, "0"]);
  await fila.click();
  await p.locator("[data-entrenamiento]").waitFor({ timeout: 10000 });
  es("no hay pestaña de aprobación", await p.locator('[data-pestana-ent="aprobar"]').count(), 0);
  await p.locator(`[data-chat-mathieu="${CONV}"]`).click();
  await p.locator(`[data-msg-agente="${AGENTE}"]`).waitFor({ timeout: 10000 });
  es("sólo el mensaje de Mathieu se puede marcar", [await p.locator(`[data-msg-agente="${AGENTE}"]`).count(), await p.locator(`[data-msg-agente="${HUMANO}"]`).count()], [1, 0]);
  await p.locator(`[data-msg-agente="${AGENTE}"] input`).check();
  await p.locator("[data-respuesta-ideal]").fill("Antes de dar el precio, preguntar qué horario le queda mejor.");
  await p.locator("[data-situacion]").fill("Pregunta por el precio");
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-1-nuevo.png` });
  await p.locator("[data-enviar-ejemplo]").click();
  await p.locator('[data-aviso-ent="ok"]').waitFor({ timeout: 10000 });
  es("el aviso dice que ya se aplica", /Mathieu lo usa desde su próximo mensaje/.test(await p.locator('[data-aviso-ent="ok"]').innerText()), true);
  es("quedó activo, con el texto exacto", sql("select estado||'|'||texto_agente||'|'||coalesce(texto_cliente,'') from agente_ejemplos order by id desc limit 1"),
    "activo|El diplomado cuesta [PRECIO]. Te comparto el pensum?|Hola, cuanto cuesta el diplomado de cocina");
  es("y ya está en agente_casos, aprobado y activo", sql(`select titulo||'|'||respuesta_recomendada||'|'||aprobado_gerencia||'|'||activo from agente_casos where id > ${casosAntes} and titulo <> 'prueba'`),
    "Pregunta por el precio|Antes de dar el precio, preguntar qué horario le queda mejor.|true|true");

  console.log("\n── 3. EL ATAJO DESDE EL CHAT ──");
  await p.locator("[data-volver-inbox]").click();
  await p.getByText("Vence En Dos", { exact: true }).first().click();
  const atajo = p.locator(`[data-ensenar-mathieu="${AGENTE}"]`);
  await atajo.waitFor({ timeout: 15000 });
  es("el mensaje de Ale no tiene el atajo", await p.locator(`[data-ensenar-mathieu="${HUMANO}"]`).count(), 0);
  await atajo.click();
  await p.locator(`[data-msg-agente="${AGENTE}"] input`).waitFor({ timeout: 10000 });
  es("abre el entrenamiento con ese mensaje ya marcado", await p.locator(`[data-msg-agente="${AGENTE}"] input`).isChecked(), true);

  console.log("\n── 4. DESACTIVAR Y VOLVER A ACTIVAR ──");
  await p.locator('[data-pestana-ent="cambios"]').click();
  const tarjeta = p.locator("[data-ejemplo]").first();
  await tarjeta.waitFor({ timeout: 10000 });
  es("en «Cambios hechos» sale activo", await tarjeta.locator("[data-estado-ejemplo]").getAttribute("data-estado-ejemplo"), "activo");
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-2-cambios.png` });
  p.once("dialog", (d) => d.accept());
  await tarjeta.locator('[data-activar="no"]').click();
  await p.waitForFunction(() => document.querySelector("[data-estado-ejemplo]")?.getAttribute("data-estado-ejemplo") === "desactivado", null, { timeout: 10000 });
  es("desactivado: Mathieu ya no lo usa", sql(`select e.estado||'|'||c.activo from agente_ejemplos e join agente_casos c on c.id=e.caso_id`), "desactivado|false");
  await tarjeta.locator('[data-activar="si"]').click();
  await p.waitForFunction(() => document.querySelector("[data-estado-ejemplo]")?.getAttribute("data-estado-ejemplo") === "activo", null, { timeout: 10000 });
  es("activado otra vez", sql(`select e.estado||'|'||c.activo from agente_ejemplos e join agente_casos c on c.id=e.caso_id`), "activo|true");
  await p.context().close();

  console.log("\n── 5. JEFA Y EL DASHBOARD ──");
  p = await abrir("jefa");
  es("la administradora también ve la fila, con 1 cambio activo", await p.locator("[data-fila-entrenamiento] [data-cambios-activos]").getAttribute("data-cambios-activos"), "1");
  await p.context().close();
  p = await abrir("jefa", "Dashboard");
  const panel = p.locator("[data-mathieu]");
  await panel.waitFor({ timeout: 15000 });
  es(`el panel cuenta ${mensajesDelMes} mensajes de Mathieu este mes`, (await panel.locator('[data-dato-mathieu="mensajes"]').innerText()).includes(String(mensajesDelMes)), true);
  es("y 1 cambio de respuesta", (await panel.locator('[data-dato-mathieu="cambios"]').innerText()).includes("1"), true);
  es("con el cambio a la vista: antes y ahora", (await panel.locator("[data-cambio]").first().innerText()).includes("preguntar qué horario"), true);
  if (FOTOS) {
    await panel.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${FOTOS}/entrenamiento-3-dashboard.png`, fullPage: false });
  }
  await p.context().close();
  p = await abrir("ale", "Dashboard");
  es("Ale también ve el panel", await p.locator("[data-mathieu]").count(), 1);
  await p.context().close();

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
