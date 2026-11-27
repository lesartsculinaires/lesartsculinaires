/**
 * «Entrenamiento Mathieu» en el Inbox: elegir el lead, marcar el mensaje de
 * Mathieu, escribir cómo queremos que conteste, y que Dirección lo apruebe.
 *
 *     node supabase/pruebas/banco/prueba-entrenamiento-mathieu.mjs
 *
 * Pedido el 27/11/2026 (LAC). Ale hace de Raquel/Alexandra (está en
 * `agente_entrenadores`), Jefa es administradora y aprueba, Huri no tiene
 * permiso. Se comprueba:
 *   1. Huri no ve la fila fija ni el botón «Enseñar a Mathieu».
 *   2. Ale ve la fila, elige el chat, sólo puede marcar mensajes de Mathieu,
 *      y envía; en la base queda el texto exacto del mensaje y del cliente.
 *   3. Desde el chat, «Enseñar a Mathieu» abre con ese mensaje ya marcado.
 *   4. Jefa ve «1 por aprobar», edita la respuesta y aprueba: entra a
 *      agente_casos aprobado y activo. Devolver sin comentario no se puede.
 *   5. Ale ve en «Enviados» que se aprobó.
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
async function abrir(quien) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta(quien), domain: "127.0.0.1", path: "/" }]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, hoy);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
  await p.goto(`${APP}/?mod=Inbox`, { waitUntil: "networkidle" });
  const cerrar = p.getByRole("button", { name: /^(Cerrar|Close)$/ });
  if (await cerrar.count()) await cerrar.first().click();
  await p.locator(".bandeja-lista").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  return p;
}

try {
  console.log("── 1. HURI, SIN PERMISO ──");
  let p = await abrir("huri");
  es("no ve la fila fija", await p.locator("[data-fila-entrenamiento]").count(), 0);
  await p.context().close();

  console.log("\n── 2. ALE ENVÍA UN EJEMPLO ──");
  p = await abrir("ale");
  const fila = p.locator("[data-fila-entrenamiento]");
  es("ve la fila «Entrenamiento Mathieu» arriba", /Entrenamiento Mathieu/.test(await fila.innerText()), true);
  await fila.click();
  await p.locator("[data-entrenamiento]").waitFor({ timeout: 10000 });
  await p.locator(`[data-chat-mathieu="${CONV}"]`).waitFor({ timeout: 10000 });
  es("el chat con Mathieu sale en la lista, con 1 mensaje suyo", /1 mensaje de Mathieu/.test(await p.locator(`[data-chat-mathieu="${CONV}"]`).innerText()), true);
  await p.locator(`[data-chat-mathieu="${CONV}"]`).click();
  await p.locator(`[data-msg-agente="${AGENTE}"]`).waitFor({ timeout: 10000 });
  es("sólo el mensaje de Mathieu se puede marcar", [await p.locator(`[data-msg-agente="${AGENTE}"]`).count(), await p.locator(`[data-msg-agente="${HUMANO}"]`).count()], [1, 0]);
  es("y el de Ale se ve como contexto", await p.getByText("Hola, soy Ale, te ayudo con la reserva").count() > 0, true);
  const enviar = p.locator("[data-enviar-ejemplo]");
  es("sin marcar nada no deja enviar", await enviar.isDisabled(), true);
  await p.locator(`[data-msg-agente="${AGENTE}"] input`).check();
  await p.locator("[data-respuesta-ideal]").fill("Antes de dar el precio, preguntar qué horario le queda mejor.");
  await p.locator("[data-situacion]").fill("Pregunta por el precio");
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-1-nuevo.png` });
  await enviar.click();
  await p.locator('[data-aviso-ent="ok"]').waitFor({ timeout: 10000 });
  const fila1 = sql("select estado||'|'||texto_agente||'|'||coalesce(texto_cliente,'')||'|'||situacion from agente_ejemplos order by id desc limit 1");
  es("quedó pendiente, con el texto exacto de Mathieu y del cliente", fila1, "pendiente|El diplomado cuesta [PRECIO]. Te comparto el pensum?|Hola, cuanto cuesta el diplomado de cocina|Pregunta por el precio");
  await p.locator('[data-pestana-ent="enviados"]').click();
  await p.locator("[data-ejemplo]").first().waitFor({ timeout: 10000 });
  es("en «Enviados» sale pendiente", await p.locator("[data-estado-ejemplo]").first().getAttribute("data-estado-ejemplo"), "pendiente");
  es("Ale no tiene la pestaña «Por aprobar»", await p.locator('[data-pestana-ent="aprobar"]').count(), 0);

  console.log("\n── 3. EL ATAJO DESDE EL CHAT ──");
  await p.locator("[data-volver-inbox]").click();
  await p.getByText("Vence En Dos", { exact: true }).first().click();
  const atajo = p.locator(`[data-ensenar-mathieu="${AGENTE}"]`);
  await atajo.waitFor({ timeout: 15000 });
  es("el mensaje de Ale no tiene el atajo", await p.locator(`[data-ensenar-mathieu="${HUMANO}"]`).count(), 0);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-2-atajo.png` });
  await atajo.click();
  await p.locator(`[data-msg-agente="${AGENTE}"] input`).waitFor({ timeout: 10000 });
  es("abre el entrenamiento con ese mensaje ya marcado", await p.locator(`[data-msg-agente="${AGENTE}"] input`).isChecked(), true);
  // Un segundo ejemplo, para devolverlo después.
  await p.locator("[data-respuesta-ideal]").fill("Ofrecer agendar visita.");
  await p.locator("[data-situacion]").fill("Segundo ejemplo");
  await p.locator("[data-enviar-ejemplo]").click();
  await p.locator('[data-aviso-ent="ok"]').waitFor({ timeout: 10000 });
  await p.context().close();

  console.log("\n── 4. JEFA APRUEBA Y DEVUELVE ──");
  p = await abrir("jefa");
  const filaJefa = p.locator("[data-fila-entrenamiento]");
  es("la fila dice 2 por aprobar", await filaJefa.locator("[data-por-aprobar]").getAttribute("data-por-aprobar"), "2");
  await filaJefa.click();
  await p.locator('[data-pestana-ent="aprobar"]').click();
  await p.locator("[data-ejemplo]").first().waitFor({ timeout: 10000 });
  es("ve los dos por aprobar", await p.locator("[data-ejemplo]").count(), 2);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-3-aprobar.png` });
  const idPrimero = sql("select id from agente_ejemplos where situacion='Pregunta por el precio'");
  const idSegundo = sql("select id from agente_ejemplos where situacion='Segundo ejemplo'");
  const t1 = p.locator(`[data-ejemplo="${idPrimero}"]`);
  await t1.locator("[data-editar-respuesta]").fill("Preguntar el horario (mañana, tarde o sábado) antes de dar el precio.");
  await t1.locator("[data-aprobar]").click();
  await p.waitForFunction((id) => !document.querySelector(`[data-ejemplo="${id}"]`), idPrimero, { timeout: 10000 });
  const caso = sql(`select escenario||'|'||titulo||'|'||cliente_ejemplo||'|'||respuesta_real||'|'||respuesta_recomendada||'|'||aprobado_gerencia||'|'||activo from agente_casos where id > ${casosAntes} and titulo <> 'prueba'`);
  es("entró a agente_casos, aprobado y activo, con la respuesta editada", caso, "11|Pregunta por el precio|Hola, cuanto cuesta el diplomado de cocina|El diplomado cuesta [PRECIO]. Te comparto el pensum?|Preguntar el horario (mañana, tarde o sábado) antes de dar el precio.|true|true");
  const t2 = p.locator(`[data-ejemplo="${idSegundo}"]`);
  await t2.locator("[data-devolver]").click();
  await p.locator('[data-aviso-ent="error"]').waitFor({ timeout: 5000 });
  es("devolver sin comentario no se puede", sql(`select estado from agente_ejemplos where id=${idSegundo}`), "pendiente");
  await t2.locator("[data-nota]").fill("Falta decir el día de la visita.");
  await t2.locator("[data-devolver]").click();
  await p.waitForFunction((id) => !document.querySelector(`[data-ejemplo="${id}"]`), idSegundo, { timeout: 10000 });
  es("con comentario queda devuelto", sql(`select estado||'|'||nota_revision from agente_ejemplos where id=${idSegundo}`), "devuelto|Falta decir el día de la visita.");
  await p.context().close();

  console.log("\n── 5. ALE VE CÓMO QUEDARON ──");
  p = await abrir("ale");
  es("la fila avisa 1 devuelto", /1 devueltos/.test(await p.locator("[data-fila-entrenamiento]").innerText()), true);
  await p.locator("[data-fila-entrenamiento]").click();
  await p.locator('[data-pestana-ent="enviados"]').click();
  await p.locator("[data-ejemplo]").first().waitFor({ timeout: 10000 });
  const estados = await p.locator("[data-estado-ejemplo]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-estado-ejemplo")).sort());
  es("uno aprobado y uno devuelto", estados, ["aprobado", "devuelto"]);
  es("con el comentario de Dirección a la vista", await p.getByText("Falta decir el día de la visita.").count() > 0, true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/entrenamiento-4-enviados.png` });
  await p.context().close();

  console.log("\n── 6. HURI NO VE EL ATAJO EN LOS CHATS ──");
  p = await abrir("huri");
  es("ningún «Enseñar a Mathieu»", await p.locator("[data-ensenar-mathieu]").count(), 0);
  await p.context().close();

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
