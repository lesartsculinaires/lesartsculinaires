/**
 * Clientes y Pipeline con el volumen de producción: se dibujan de a tandas, y
 * todo lo que cuenta o marca sigue alcanzando a la lista entera.
 *
 *     node supabase/pruebas/banco/prueba-listas-por-tandas.mjs
 *
 * 27/10/2026: con 3.000 leads, entrar a Clientes dejaba el navegador trabado
 * casi cuatro segundos, y otra vez con cada letra del buscador. Ahora se
 * dibujan 200 filas y las siguientes al bajar; en el Pipeline, 60 tarjetas por
 * columna y las siguientes al bajar por la columna. Lo que esta prueba cuida es
 * que el equipo no note otra diferencia:
 *
 *   - los números de arriba y el «Mostrando N de M» cuentan todas;
 *   - «marcar todas» marca la lista filtrada entera (es como se arma un masivo);
 *   - bajar con la rueda o con la flecha trae las que siguen;
 *   - el buscador encuentra una ficha que no estaba dibujada;
 *   - arrastrar una tarjeta a otra columna la mueve, igual que siempre.
 *
 * Siembra `volumen.sql` y lo borra al terminar. Necesita el banco armado
 * (`armar.sh`) y la aplicación en 3142.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BANCO = "/home/user/lesartsculinaires/supabase/pruebas/banco";
const APP = "http://127.0.0.1:3142";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -q -c \\"${q}\\""`, { encoding: "utf8" }).split("\n").find((l) => l.trim() !== "")?.trim() ?? "";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

// Postgres no lee archivos de cualquier carpeta: se copia a /tmp.
fs.copyFileSync(`${BANCO}/volumen.sql`, "/tmp/volumen-banco.sql");
fs.chmodSync("/tmp/volumen-banco.sql", 0o644);
const sembrar = () => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f /tmp/volumen-banco.sql"`, { stdio: "pipe" });
const limpiar = () => {
  sql("delete from mensajes where conversacion_id in (select id from conversaciones where identificador like 'vol-%')");
  sql("delete from conversaciones where identificador like 'vol-%'");
  sql("delete from oportunidades where codigo like 'VOL-%'");
  sql("delete from clientes where correo like '%@volumen.test'");
};

const jwt = fs.readFileSync(`${BANCO}/jwt-jefa.txt`, "utf8").trim();
const galleta = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "x", user: { id: "cccccccc-0000-0000-0000-000000000003", email: "jefa@lac.test" } })).toString("base64");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const abrir = async (mod) => {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: galleta, domain: "127.0.0.1", path: "/" }, { name: "lac.mod", value: mod, domain: "127.0.0.1", path: "/" }]);
  await ctx.addInitScript((h) => {
    try { localStorage.setItem("lac.reservas.visto", h); } catch {}
    window.__largas = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__largas += e.duration; }).observe({ type: "longtask", buffered: true });
  }, new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  await p.locator("main").first().waitFor();
  return { ctx, p, errores };
};
const texto = async (p) => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

try {
  limpiar();
  sembrar();
  const total = Number(sql("select count(*) from oportunidades"));
  console.log(`(${total} leads en el banco)`);
  // Que el falso Realtime anote la siembra antes de abrir: si no, la pestaña
  // recibiría tres mil avisos de golpe apenas entra.
  await new Promise((r) => setTimeout(r, 3000));

  console.log("\n── 1. CLIENTES ──");
  {
    const { ctx, p, errores } = await abrir("Clientes");
    await p.getByText(/^Mostrando \d+ de \d+ oportunidades$/).waitFor({ timeout: 30000 });
    const trabado = await p.evaluate(() => window.__largas);
    console.log(`   (trabado al entrar: ${Math.round(trabado)} ms; antes 3.864)`);
    es("entra sin quedar trabado más de un segundo y medio", trabado < 1500, true);

    const filas = () => p.locator("main tbody tr.row").count();
    const primeras = await filas();
    es("dibuja la primera tanda, no las tres mil", primeras, 200);
    es("pero el pie cuenta todas", (await texto(p)).includes(`Mostrando ${total} de ${total} oportunidades`), true);
    es("y el número de arriba también", (await p.locator("main").first().innerText()).includes(String(total)), true);

    // Bajar con la rueda trae la tanda que sigue, sin botón.
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(1200);
    es("al bajar se agregan las que siguen", (await filas()) > primeras, true);

    // «Marcar todas» es la lista entera: así se arma un masivo de una base.
    await p.getByRole("checkbox", { name: "Marcar todas las de esta lista" }).check();
    await p.waitForTimeout(800);
    es("marcar todas alcanza a las no dibujadas", (await texto(p)).includes(`${total} seleccionadas`), true);
    const trabadoAlMarcar = await p.evaluate(() => { const t = window.__largas; window.__largas = 0; return t; });
    await p.getByRole("checkbox", { name: "Marcar todas las de esta lista" }).uncheck();
    await p.waitForTimeout(800);
    es("y desmarcar las suelta todas", (await texto(p)).includes("seleccionadas"), false);
    void trabadoAlMarcar;

    // La flecha más allá de lo dibujado: el cursor no queda en el aire.
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator("main div[tabindex='0']").first().focus();
    for (let i = 0; i < 205 + 200; i++) await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(500);
    es("bajando con la flecha se dibujan las de abajo", (await filas()) >= 405, true);
    es("y queda una sola marcada, la del cursor", (await texto(p)).includes("1 seleccionada"), true);
    await p.keyboard.press("Escape");

    // El buscador encuentra una ficha del fondo, que no estaba dibujada.
    const ultimo = sql("select codigo from oportunidades where codigo like 'VOL-%' order by codigo desc limit 1");
    await p.evaluate(() => { window.__largas = 0; });
    await p.getByPlaceholder("Buscar nombre, código, teléfono o correo").fill(ultimo);
    await p.waitForTimeout(1200);
    es("el buscador encuentra una del fondo", (await p.locator("main tbody tr.row").first().innerText()).includes(ultimo), true);
    es("y la lista queda en una", await filas(), 1);
    const trabadoAlBuscar = await p.evaluate(() => window.__largas);
    console.log(`   (trabado al escribir la búsqueda: ${Math.round(trabadoAlBuscar)} ms)`);
    await p.getByPlaceholder("Buscar nombre, código, teléfono o correo").fill("");
    await p.waitForTimeout(1200);
    es("al borrar la búsqueda vuelve a la primera tanda", await filas(), 200);

    es("sin errores en la página", errores, []);
    await ctx.close();
  }

  console.log("\n── 2. PIPELINE ──");
  {
    const { ctx, p, errores } = await abrir("Pipeline");
    await p.locator("[data-etapa]").first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(800);
    const trabado = await p.evaluate(() => window.__largas);
    console.log(`   (trabado al entrar: ${Math.round(trabado)} ms; antes 815)`);

    const etapas = await p.locator("[data-etapa]").evaluateAll((els) => els.map((e) => e.getAttribute("data-etapa")));
    const primera = etapas[0];
    const segunda = etapas[1];
    const columna = p.locator(`[data-etapa="${primera}"]`);
    const enLaBase = Number(sql(`select count(*) from oportunidades o join etapas e on e.id = o.etapa_id where e.nombre = '${primera}'`));
    const cartas = () => columna.locator(".card").count();
    es(`«${primera}» dibuja 60 tarjetas`, await cartas(), 60);
    es("y su encabezado cuenta todas", (await columna.innerText()).includes(`${enLaBase} leads`), true);

    // Bajar por la columna, que tiene su propio desplazamiento.
    await columna.locator("> div:last-child").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await p.waitForTimeout(1000);
    es("al bajar por la columna aparecen más", (await cartas()) > 60, true);

    // Arrastrar sigue igual.
    const codigo = await columna.locator(".card").first().getAttribute("data-ficha");
    await p.locator(`[data-ficha="${codigo}"]`).dragTo(p.locator(`[data-etapa="${segunda}"] > div:last-child`));
    await p.waitForTimeout(2500);
    es(`arrastrar ${codigo} a «${segunda}» la mueve en la base`, sql(`select e.nombre from oportunidades o join etapas e on e.id = o.etapa_id where o.codigo = '${codigo}'`), segunda);
    es("y se ve en su columna nueva", await p.locator(`[data-etapa="${segunda}"] [data-ficha="${codigo}"]`).count(), 1);

    es("sin errores en la página", errores, []);
    await ctx.close();
  }
} catch (e) {
  f++;
  console.log("✗ se cortó:", e.message);
} finally {
  await nav.close();
  limpiar();
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
