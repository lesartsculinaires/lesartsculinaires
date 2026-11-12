/**
 * El Calendario con forma de Google Calendar (12/11/2026).
 *
 *     node supabase/pruebas/banco/prueba-calendario.mjs
 *
 * Como una asesora: entra en Semana, ve sus dos eventos de hoy lado a lado
 * porque se cruzan, cambia a Mes, Día y Agenda, abre uno y lo marca realizado,
 * y agenda uno nuevo con «Crear» —buscando el lead por nombre— hasta ver la
 * confirmación de que la alerta le va a llegar.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142.
 * Con SP=<carpeta> deja fotos.
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

const jwt = fs.readFileSync(new URL("jwt-ale.txt", import.meta.url), "utf8").trim();
const ALE = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;
const ficha = sql(`select id from public.vendedores where usuario_id = '${ALE}';`);
const lead = sql(`select o.id || '|' || c.nombre from public.oportunidades o join public.clientes c on c.id = o.cliente_id where o.vendedor_id = ${ficha} order by o.id limit 1;`);
const [LEAD, CLIENTE] = lead.split("|");

// Hoy en El Salvador (UTC−6), y dos eventos que se cruzan: 10:00–11:00 y 10:30–11:00.
const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
const aIso = (hora) => new Date(`${HOY}T${hora}:00-06:00`).toISOString();
const MARCA = "prueba-calendario";

const limpiar = () => sql(`delete from public.eventos where resultado = '${MARCA}' or (oportunidad_id = ${LEAD} and inicia_en = '${aIso("15:00")}');`);
limpiar();
const [E1, E2] = sql(`
  insert into public.eventos (oportunidad_id, tipo_id, vendedor_id, inicia_en, duracion_min, canal, estado, resultado)
  values (${LEAD}, 0, ${ficha}, '${aIso("10:00")}', 60, 'Llamada', 'Pendiente', '${MARCA}'),
         (${LEAD}, 4, ${ficha}, '${aIso("10:30")}', 30, 'Llamada', 'Pendiente', '${MARCA}')
  returning id;
`).split("\n");

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const galleta = "base64-" + Buffer.from(JSON.stringify({
  access_token: jwt, token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x",
  user: { id: ALE, email: "ale@lac.test" },
})).toString("base64");
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  { name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" },
  { name: "lac.mod", value: "Calendario", domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript(() => {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  try {
    localStorage.setItem("lac.reservas.visto", hoy);
    localStorage.removeItem("crm.calendario.vista");
  } catch {}
});
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = (n) => process.env.SP && p.screenshot({ path: `${process.env.SP}/calendario-${n}.png` });

try {
  await p.goto("http://127.0.0.1:3142/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ir = p.locator('aside button[data-mod="Calendario"]');
  if (await ir.count()) await ir.click();
  await p.waitForSelector("[data-calendario]");
  await p.waitForTimeout(800);

  console.log("── Semana ──");
  es("abre en Semana", await p.locator('[data-cal-vista="semana"]').count(), 1);
  es("con la columna de hoy", await p.locator(`[data-cal-columna="${HOY}"]`).count(), 1);
  const caja1 = await p.locator(`[data-cal-evento="${E1}"]`).boundingBox();
  const caja2 = await p.locator(`[data-cal-evento="${E2}"]`).boundingBox();
  es("se ven los dos eventos de hoy", Boolean(caja1 && caja2), true);
  es("los que se cruzan van lado a lado", caja1 && caja2 ? caja2.x > caja1.x + caja1.width / 2 : false, true);
  es("el de una hora es el doble de alto", caja1 && caja2 ? Math.round(caja1.height / caja2.height) : 0, 2);
  es("está la línea roja de ahora", await p.locator("[data-cal-ahora]").count(), 1);
  await foto("1-semana");

  console.log("\n── Mes, Día y Agenda ──");
  await p.getByRole("tab", { name: "Mes" }).click();
  es("Mes: la grilla con el día de hoy", await p.locator(`[data-cal-vista="mes"] [data-cal-dia="${HOY}"]`).count(), 1);
  es("Mes: con sus eventos", await p.locator(`[data-cal-dia="${HOY}"] [data-cal-evento]`).count() >= 2, true);
  await foto("2-mes");
  await p.getByRole("tab", { name: "Día" }).click();
  es("Día: una sola columna", await p.locator("[data-cal-columna]").count(), 1);
  await p.getByRole("tab", { name: "Agenda" }).click();
  es("Agenda: la lista con el evento", await p.locator(`[data-cal-vista="agenda"] [data-cal-evento="${E1}"]`).count(), 1);
  await p.getByRole("tab", { name: "Semana" }).click();

  console.log("\n── abrir un evento ──");
  await p.locator(`[data-cal-evento="${E2}"]`).click();
  const detalle = p.locator("[data-cal-detalle]");
  es("se abre el detalle", await detalle.count(), 1);
  es("dice con quién es", (await detalle.innerText()).includes(CLIENTE), true);
  await foto("3-detalle");
  await detalle.getByRole("button", { name: "Marcar realizado" }).click();
  await p.waitForTimeout(1500);
  es("«Marcar realizado» lo guarda", sql(`select estado from public.eventos where id = ${E2};`), "Realizado");

  console.log("\n── Crear ──");
  await p.keyboard.press("Escape");
  await p.locator("[data-cal-crear]").click();
  const nuevo = p.locator("[data-cal-nuevo]");
  es("se abre «Nuevo evento»", await nuevo.count(), 1);
  await nuevo.getByPlaceholder("Busca por nombre, código o teléfono").fill(CLIENTE.slice(0, 6));
  await nuevo.getByRole("button", { name: new RegExp(CLIENTE) }).first().click();
  await nuevo.getByLabel("Fecha").fill(HOY);
  await nuevo.getByLabel("Hora").fill("15:00");
  await foto("4-nuevo");
  await nuevo.getByRole("button", { name: "Guardar" }).click();
  await p.waitForTimeout(1500);
  const ok = p.locator("[data-cal-agendado]");
  es("sale la confirmación «Evento agendado»", await ok.count(), 1);
  es("y dice que la alerta le llega a ella", /alerta emergente a ti 10 minutos antes/.test(await ok.innerText()), true);
  await foto("5-agendado");
  es(
    "quedó guardado a las 15:00 de El Salvador, con su asesora",
    sql(`select count(*) from public.eventos where oportunidad_id = ${LEAD} and inicia_en = '${aIso("15:00")}' and vendedor_id = ${ficha};`),
    "1",
  );
  await ok.getByRole("button", { name: "Aceptar" }).click();
  await p.waitForTimeout(1200);
  es("y aparece en la semana", await p.locator(`[data-cal-columna="${HOY}"] [data-cal-evento]`).count(), 3);

  es("sin errores en la página", errores, []);
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
  await foto("error");
} finally {
  await nav.close();
  limpiar();
}
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
