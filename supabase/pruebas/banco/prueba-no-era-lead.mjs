/**
 * ¿«No era lead» limpia lo que hizo el robot, sin llevarse trabajo de nadie?
 *
 *     node supabase/pruebas/banco/prueba-no-era-lead.mjs
 *
 * Desde que los leads de WhatsApp se crean solos, este botón es el que limpia
 * los proveedores y los números equivocados. Tiene que borrar el lead intacto
 * y NO tocar uno donde alguien ya anotó algo: equivocarse para el lado de
 * borrar de más es perder trabajo que nadie puede recuperar.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

async function escribe(tel, nombre) {
  const carga = { object:"whatsapp_business_account", entry:[{id:"222",changes:[{field:"messages",value:{
    messaging_product:"whatsapp", metadata:{phone_number_id:"111"},
    contacts:[{profile:{name:nombre},wa_id:tel}],
    messages:[{from:tel,id:"wamid."+crypto.randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:"Hola"}}],
  }}]}]};
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256","secreto-de-prueba").update(crudo).digest("hex");
  await fetch("http://127.0.0.1:3142/api/whatsapp/webhook",{method:"POST",
    headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+firma},body:crudo});
  await new Promise(s=>setTimeout(s,600));
}

const T_LIMPIO = "50399" + String(Date.now()).slice(-6);
const T_TRABAJADO = "50388" + String(Date.now()).slice(-6);
await escribe(T_LIMPIO, "Numero Equivocado");
await escribe(T_TRABAJADO, "Lead De Verdad");

// A este segundo le anotamos plata: es trabajo de una persona.
sql(`update oportunidades set valor_oportunidad = 500 where cliente_id in (select id from clientes where telefono='${T_TRABAJADO}')`);

console.log("── antes ──");
es("los dos entraron como lead", sql(`select count(*) from vw_pipeline where telefono in ('${T_LIMPIO}','${T_TRABAJADO}')`), "2");

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
  expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
  user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");
const nav = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx = await nav.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", e=>errores.push(e.message));
await p.goto("http://127.0.0.1:3142/", {waitUntil:"networkidle"});
await p.waitForTimeout(3000);
await p.locator('aside button:text-is("Inbox")').click();
await p.waitForTimeout(2000);

const abrirHilo = async (nombre) => {
  await p.locator(`main :text("${nombre}")`).first().click();
  await p.waitForTimeout(1200);
};

console.log("\n── «No era lead» sobre el número equivocado ──");
{
  await abrirHilo("Numero Equivocado");
  await p.locator('button:text-is("No era lead")').click();
  await p.waitForTimeout(2500);
  es("SE BORRÓ EL LEAD", sql(`select count(*) from vw_pipeline where telefono='${T_LIMPIO}'`), "0");
  es("y también la ficha del cliente", sql(`select count(*) from clientes where telefono='${T_LIMPIO}'`), "0");
  es("la conversación quedó archivada", sql(`select archivada from conversaciones where telefono='${T_LIMPIO}'`), "t");
}

console.log("\n── «No era lead» sobre uno donde alguien trabajó ──");
{
  await p.reload({waitUntil:"networkidle"});
  await p.waitForTimeout(2500);
  await p.locator('aside button:text-is("Inbox")').click();
  await p.waitForTimeout(1800);
  await abrirHilo("Lead De Verdad");
  await p.locator('button:text-is("No era lead")').click();
  await p.waitForTimeout(2500);
  es("NO SE BORRÓ EL LEAD", sql(`select count(*) from vw_pipeline where telefono='${T_TRABAJADO}'`), "1");
  es("ni la ficha", sql(`select count(*) from clientes where telefono='${T_TRABAJADO}'`), "1");
  es("el monto sigue ahí", sql(`select valor_oportunidad::int from vw_pipeline where telefono='${T_TRABAJADO}'`), "500");
  es("pero la conversación se archivó igual", sql(`select archivada from conversaciones where telefono='${T_TRABAJADO}'`), "t");
}

es("sin errores en la página", errores, []);
await nav.close();
for (const t of [T_LIMPIO, T_TRABAJADO]) {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono='${t}')`);
  sql(`delete from conversaciones where telefono='${t}'`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${t}')`);
  sql(`delete from clientes where telefono='${t}'`);
}
console.log(f===0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f?1:0);
