/**
 * Los reportes del Dashboard y el filtro por día del Inbox, en pantalla.
 *
 *     node supabase/pruebas/banco/prueba-reportes.mjs
 *
 * Pedidos el 14 de octubre de 2026. Se arma un día con movimiento —un lead
 * nuevo, uno ganado, uno perdido con su motivo y su comentario, una etiqueta,
 * una conversación contestada— y se comprueba que el reporte lo cuente igual
 * que la base, que el archivo para Excel se baje, y que el Inbox muestre la
 * conversación contestada ese día.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = `http://127.0.0.1:${process.env.APP_PUERTO ?? 3142}`;
const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
const MES = HOY.slice(0, 7);
const ALE = "11111111-0000-0000-0000-000000000001";

// ------------------------------------------------------------- el día armado
const ids = sql("select string_agg(id::text, ',' order by id) from (select o.id from oportunidades o join estados s on s.id=o.estado_id where not s.es_final order by o.id limit 3) t").split(",");
const respaldo = sql(`select string_agg(id||':'||etapa_id||':'||estado_id||':'||fecha_registro||':'||coalesce(fecha_cierre::text,'')||':'||coalesce(motivo_perdida_id::text,''), ',') from oportunidades where id in (${ids.join(",")})`);
const [nuevo, ganado, perdido] = ids;
sql(`update oportunidades set fecha_registro=current_date where id=${nuevo}`);
sql(`update oportunidades set etapa_id=(select id from etapas where nombre='Ganado'), fecha_cierre=current_date where id=${ganado}`);
sql(`update oportunidades set estado_id=(select id from estados where nombre='Perdido'), motivo_perdida_id=(select id from motivos_perdida where nombre='Problema de horario'), fecha_cierre=current_date where id=${perdido}`);
sql(`insert into oportunidad_notas (oportunidad_id, nota, origen) values (${perdido}, 'Trabaja los sábados; pidió avisarle del horario nocturno.', 'comentario')`);
const etiqueta = sql("insert into etiquetas (nombre, color) values ('Prueba reporte', '#8a5200') returning id").split("\n")[0];
sql(`insert into oportunidad_etiquetas (oportunidad_id, etiqueta_id) values (${nuevo}, ${etiqueta})`);
const cliente = sql(`select cliente_id from oportunidades where id=${nuevo}`);
const conv = sql(`insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en) values ('50379990001', '50379990001', 'whatsapp', ${cliente}, 901, now()) returning id`).split("\n")[0];
sql(`insert into mensajes (conversacion_id, direccion, tipo, texto, enviado_por, creado_en) values (${conv}, 'saliente', 'text', 'Hola, te paso la info', '${ALE}', now()), (${conv}, 'saliente', 'text', 'Quedo atenta', '${ALE}', now())`);

const limpiar = () => {
  sql(`delete from mensajes where conversacion_id=${conv}`);
  sql(`delete from conversaciones where id=${conv}`);
  sql(`delete from oportunidad_etiquetas where etiqueta_id=${etiqueta}`);
  sql(`delete from etiquetas where id=${etiqueta}`);
  sql(`delete from oportunidad_notas where oportunidad_id=${perdido} and nota like 'Trabaja los sábados%'`);
  for (const par of respaldo.split(",")) {
    const [id, et, st, reg, cie, mot] = par.split(":");
    sql(`update oportunidades set etapa_id=${et}, estado_id=${st}, fecha_registro='${reg}', fecha_cierre=${cie ? `'${cie}'` : "null"}, motivo_perdida_id=${mot || "null"} where id=${id}`);
  }
};

// Lo que dice la base, con las mismas reglas.
const base = (desde, hasta) => {
  const [n, g, p] = sql(`select
      (select count(*) from oportunidades where fecha_registro >= '${desde}' and fecha_registro < '${hasta}')
    ||'|'||(select count(*) from oportunidades o join estados s on s.id=o.estado_id where s.nombre='Ganado' and coalesce(o.fecha_cierre,o.fecha_registro) >= '${desde}' and coalesce(o.fecha_cierre,o.fecha_registro) < '${hasta}')
    ||'|'||(select count(*) from oportunidades o join estados s on s.id=o.estado_id where s.nombre='Perdido' and coalesce(o.fecha_cierre,o.fecha_registro) >= '${desde}' and coalesce(o.fecha_cierre,o.fecha_registro) < '${hasta}')`).split("|").map(Number);
  return { nuevos: n, ganados: g, perdidos: p };
};
const manana = new Date(Date.parse(`${HOY}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const [a, m] = MES.split("-").map(Number);
const finMes = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
const delDia = base(HOY, manana);
const delMes = base(`${MES}-01`, finMes);

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" },
})).toString("base64");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errores = [];
async function pagina(mod) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.addCookies([
    { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
    { name: "lac.mod", value: mod, domain: "127.0.0.1", path: "/" },
  ]);
  await ctx.addInitScript((h) => { try { localStorage.setItem("lac.reservas.visto", h); } catch {} }, HOY);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  return p;
}
const valor = async (p, clave) => (await p.locator(`[data-indicador="${clave}"] [data-valor]`).innerText()).trim();

try {
  // ══════════════════════════════════════════════════════════════════════
  console.log("── 1. LOS BOTONES EN EL DASHBOARD ──");
  // ══════════════════════════════════════════════════════════════════════
  const d = await pagina("Dashboard");
  await d.goto(`${APP}/`, { waitUntil: "networkidle" });
  await d.waitForTimeout(2000);
  es("está el botón del reporte del día", await d.locator('[data-reporte="dia"]').getAttribute("href"), `/reporte?dia=${HOY}`);
  es("y el del mes, con el mes que se mira", await d.locator('[data-reporte="mes"]').getAttribute("href"), `/reporte?mes=${MES}`);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 2. EL REPORTE DEL DÍA ──");
  // ══════════════════════════════════════════════════════════════════════
  const r = await pagina("Dashboard");
  await r.goto(`${APP}/reporte?dia=${HOY}`, { waitUntil: "networkidle" });
  console.log(`   (la base: ${JSON.stringify(delDia)})`);
  if (process.env.SP) await r.screenshot({ path: `${process.env.SP}/reporte-dia.png`, fullPage: true });
  es("LEADS NUEVOS como en la base", Number(await valor(r, "nuevos")), delDia.nuevos);
  es("GANADOS como en la base", Number(await valor(r, "ganados")), delDia.ganados);
  es("PERDIDOS como en la base", Number(await valor(r, "perdidos")), delDia.perdidos);
  es("conversaciones contestadas", Number(await valor(r, "conversaciones")), 1);
  es("mensajes enviados", Number(await valor(r, "mensajes")), 2);
  const texto = (await r.locator("main").innerText()).replace(/\s+/g, " ");
  es("POR QUÉ SE PIERDEN: aparece el motivo", await r.locator('[data-motivo="Problema de horario"]').count(), 1);
  es("y el perdido con su comentario", texto.includes("Trabaja los sábados; pidió avisarle del horario nocturno."), true);
  const activos = Number(sql("select count(*) from productos where activo"));
  const filasProgramas = await r.locator("section", { hasText: "Todos los cursos" }).locator("tbody tr").count();
  es("TODOS LOS PROGRAMAS activos, con o sin movimiento", filasProgramas >= activos, true);
  es("la etiqueta puesta aparece", texto.includes("Prueba reporte · 1"), true);
  es("la asesora aparece con lo que contestó", texto.includes("Ale Prueba"), true);
  es("hay conclusiones en palabras", texto.includes("Lo más importante"), true);
  es("y el listado de todos los leads del día", await r.locator("section", { hasText: "Todos los leads del día" }).locator("tbody tr").count() >= 3, true);

  const [descarga] = await Promise.all([r.waitForEvent("download"), r.getByRole("button", { name: "Descargar para Excel" }).click()]);
  const ruta = await descarga.path();
  const csv = fs.readFileSync(ruta, "utf8");
  es("SE BAJA PARA EXCEL", descarga.suggestedFilename(), `reporte-dia-${HOY}.csv`);
  es("con BOM y punto y coma", [csv.charCodeAt(0), csv.includes("Motivo;Leads;%;Programa donde más se repite")], [0xfeff, true]);
  es("y el comentario adentro", csv.includes('"Trabaja los sábados; pidió avisarle del horario nocturno."'), true);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 3. EL REPORTE DEL MES ──");
  // ══════════════════════════════════════════════════════════════════════
  await r.goto(`${APP}/reporte?mes=${MES}`, { waitUntil: "networkidle" });
  console.log(`   (la base: ${JSON.stringify(delMes)})`);
  if (process.env.SP) await r.screenshot({ path: `${process.env.SP}/reporte-mes.png`, fullPage: true });
  es("leads del mes como en la base", Number(await valor(r, "nuevos")), delMes.nuevos);
  es("ganados del mes como en la base", Number(await valor(r, "ganados")), delMes.ganados);
  es("trae las semanas", await r.locator("section", { hasText: "Semana por semana" }).count(), 1);
  es("y NO el listado lead por lead (es más sintetizado)", await r.locator("section", { hasText: "Todos los leads del día" }).count(), 0);

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n── 4. EL INBOX: CONTESTADAS UN DÍA ──");
  // ══════════════════════════════════════════════════════════════════════
  const i = await pagina("Inbox");
  await i.goto(`${APP}/`, { waitUntil: "networkidle" });
  await i.waitForTimeout(2500);
  await i.locator("#inbox-contestadas").fill(HOY);
  await i.waitForTimeout(2500);
  const resumen = (await i.locator("[data-resumen-contestadas]").innerText()).trim();
  if (process.env.SP) await i.screenshot({ path: `${process.env.SP}/inbox-dia.png`, clip: { x: 0, y: 0, width: 900, height: 700 } });
  es("DICE CUÁNTAS SE CONTESTARON", resumen, "1 conversación contestada ese día, con 2 mensajes.");
  const ayer = new Date(Date.parse(`${HOY}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  await i.locator("#inbox-contestadas").fill(ayer);
  await i.waitForTimeout(2500);
  es("otro día sin respuestas dice cero", (await i.locator("[data-resumen-contestadas]").innerText()).trim(), "0 conversaciones contestadas ese día, con 0 mensajes.");
  await i.getByRole("button", { name: "Quitar" }).click();
  es("y se puede quitar", await i.locator("[data-resumen-contestadas]").count(), 0);

  es("sin errores en pantalla", errores, []);
} finally {
  limpiar();
  await nav.close();
}

console.log(f ? `\n${f} fallaron.` : "\nTodo bien.");
process.exit(f ? 1 : 0);
