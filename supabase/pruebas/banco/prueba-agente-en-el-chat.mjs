/**
 * Los chats que lleva el agente IA se ven en verde, con 🤖, y adentro del chat
 * sale el aviso de que el agente está contestando.
 *
 *     node supabase/pruebas/banco/prueba-agente-en-el-chat.mjs
 *
 * Pedido el 26/11/2026 para LAC y HC. Se prende `agente_activo` en un hilo y
 * se comprueba: la fila en verde con el icono y la pastilla «Agente IA», que
 * las demás filas no cambien, el aviso arriba de donde se escribe, y que al
 * apagarse (como cuando una asesora contesta a mano) el aviso se vaya en vivo.
 * Al final se deja todo como estaba.
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

const CONV = 3319; // Vence En Dos, de Ale
const NOMBRE = "Vence En Dos";
const antes = sql(`select agente_activo||'|'||coalesce(agente_cambiado_en::text,'')||'|'||coalesce(agente_motivo,'') from conversaciones where id=${CONV}`);
const limpiar = () => {
  const [act, en, mot] = antes.split("|");
  sql(`update conversaciones set agente_activo=${act === "t"}, agente_cambiado_en=${en ? `'${en}'` : "null"}, agente_motivo=${mot ? `'${mot}'` : "null"} where id=${CONV}`);
};
sql(`update conversaciones set agente_activo=false where agente_activo`);
sql(`update conversaciones set agente_activo=true, agente_cambiado_en=now(), agente_motivo='prueba', ultimo_mensaje_en=now() where id=${CONV}`);

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

  console.log("── 1. EN LA LISTA ──");
  const filas = p.locator('[data-agente="si"]');
  await filas.first().waitFor({ timeout: 15000 });
  es("una sola fila marcada", await filas.count(), 1);
  const fila = filas.first();
  es("es la del chat que lleva el agente", (await fila.innerText()).includes(NOMBRE), true);
  es("con el 🤖 y la pastilla «Agente IA»", /🤖/.test(await fila.innerText()) && (await fila.locator("[data-pastilla-agente]").count()) === 1, true);
  const fondo = await fila.evaluate((el) => getComputedStyle(el).backgroundColor);
  es("en verde", fondo, "rgb(232, 246, 238)");
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/agente-1-lista.png` });

  console.log("\n── 2. ADENTRO DEL CHAT ──");
  await fila.locator("button.row").click();
  const aviso = p.locator("[data-agente-contestando]");
  await aviso.waitFor({ timeout: 15000 });
  es("el aviso dice que el agente está contestando", /El agente IA está contestando este chat/.test(await aviso.innerText()), true);
  es("y que si escribe ella, el agente se hace a un lado", /se hace a un lado/.test(await aviso.innerText()), true);
  const arribaDelRecuadro = await p.evaluate(() => {
    const a = document.querySelector("[data-agente-contestando]");
    const caja = document.querySelector("textarea");
    return !!a && !!caja && !!(a.compareDocumentPosition(caja) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  es("va arriba de donde se escribe", arribaDelRecuadro, true);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/agente-2-chat.png` });

  console.log("\n── 3. EL AGENTE SUELTA EL CHAT ──");
  sql(`update conversaciones set agente_activo=false, agente_cambiado_en=now(), agente_motivo='un asesor respondió a mano' where id=${CONV}`);
  await p.waitForFunction(() => !document.querySelector("[data-agente-contestando]"), null, { timeout: 20000 })
    .then(() => es("el aviso se va solo, en vivo", true, true))
    .catch(() => es("el aviso se va solo, en vivo", false, true));
  es("y la fila deja de estar en verde", await p.locator('[data-agente="si"]').count(), 0);
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/agente-3-suelta.png` });

  es("sin errores en la página", errores, []);
} finally {
  limpiar();
  await nav.close();
}
console.log(f ? `\n${f} fallaron` : "\nTodo bien");
process.exit(f ? 1 : 0);
