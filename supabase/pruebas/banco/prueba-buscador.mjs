/**
 * ¿La caja de búsqueda se puede vaciar con la equis y con Escape?
 *
 *     node supabase/pruebas/banco/prueba-buscador.mjs
 *
 * Las dos maneras importan y prueban cosas distintas: la equis la encuentra
 * quien no sabe que existe, y Escape es lo que la mano hace sola cuando se
 * busca todo el día.
 *
 * Cubre además el caso que se rompe fácil: dentro de una ventana que también
 * escucha Escape, la tecla tiene que limpiar la búsqueda sin cerrar la
 * ventana, y con la caja vacía tiene que dejar cerrarla de una sola vez.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

const NOMBRE = sql("select cliente from vw_pipeline limit 1").split(" ")[0];
const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
  expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
  user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");
const nav = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx = await nav.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));
const p = await ctx.newPage();
const errores=[]; p.on("pageerror",e=>errores.push(e.message));
await p.goto("http://127.0.0.1:3142/?mod=x",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
await p.locator('aside button[data-mod="Clientes"]').click();
await p.waitForTimeout(1800);

const caja = p.locator('main input[placeholder*="Buscar nombre"]');
const equis = p.locator('main button[aria-label="Limpiar la búsqueda"]');
const filas = () => p.locator("main table tbody tr").count();

console.log("── la equis aparece sólo cuando hay algo escrito ──");
{
  es("con la caja vacía no está", await equis.count(), 0);
  await caja.fill(NOMBRE);
  await p.waitForTimeout(700);
  es("al escribir aparece", await equis.count(), 1);
}

console.log("\n── y limpia de verdad ──");
{
  const conFiltro = await filas();
  await equis.click();
  await p.waitForTimeout(700);
  es("la caja quedó vacía", await caja.inputValue(), "");
  es("la equis se fue", await equis.count(), 0);
  es("y volvieron las filas", (await filas()) > conFiltro, true);
  es("EL FOCO SIGUE EN LA CAJA, PARA SEGUIR BUSCANDO",
     await caja.evaluate((el) => el === document.activeElement), true);
}

console.log("\n── Escape hace lo mismo ──");
{
  await caja.fill(NOMBRE);
  await p.waitForTimeout(600);
  await caja.press("Escape");
  await p.waitForTimeout(600);
  es("ESCAPE LA VACÍA", await caja.inputValue(), "");
}

console.log("\n── dentro de una ventana, Escape no la cierra de más ──");
{
  await p.locator('aside button[data-mod="Inbox"]').click();
  await p.waitForTimeout(1800);
  await p.locator('main button:has-text("Nuevo chat")').first().click();
  await p.waitForTimeout(1000);
  const dlg = p.locator('div[role="dialog"][aria-label="Nuevo chat"]');
  es("la ventana está abierta", await dlg.count(), 1);

  const buscar = dlg.locator('input[placeholder*="Nombre"]');
  await buscar.fill("algo");
  await p.waitForTimeout(500);
  await buscar.press("Escape");
  await p.waitForTimeout(700);
  es("con texto: limpia la búsqueda", await buscar.inputValue(), "");
  es("Y NO CIERRA LA VENTANA", await dlg.count(), 1);
}

es("sin errores en la página", errores, []);
await nav.close();
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
