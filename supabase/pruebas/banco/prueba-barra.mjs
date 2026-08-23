/**
 * ¿La barra lateral se lee bien, y el Inbox avisa lo que falta leer?
 *
 *     node supabase/pruebas/banco/prueba-barra.mjs
 *
 * Comprueba que cada módulo tenga su icono y que ninguno se repita —un icono
 * repetido no ayuda a distinguir, estorba—, que el número de mensajes sin leer
 * salga del total real y no del de hilos, y que las pastillas del filtro de la
 * bandeja midan todas lo mismo y entren en una línea.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

// Un hilo con mensajes sin leer, para que el globito tenga qué mostrar. Se
// crea entrando por el webhook, que es como entran de verdad.
import crypto from "node:crypto";
const TEL = "50366" + String(Date.now()).slice(-6);
for (let i = 0; i < 2; i++) {
  const carga = { object:"whatsapp_business_account", entry:[{id:"222",changes:[{field:"messages",value:{
    messaging_product:"whatsapp", metadata:{phone_number_id:"111"},
    contacts:[{profile:{name:"Prueba Iconos"},wa_id:TEL}],
    messages:[{from:TEL,id:"wamid."+crypto.randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:"Hola "+i}}],
  }}]}]};
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256","secreto-de-prueba").update(crudo).digest("hex");
  await fetch("http://127.0.0.1:3142/api/whatsapp/webhook",{method:"POST",
    headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+firma},body:crudo});
  await new Promise(s=>setTimeout(s,600));
}
const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
sql(`update conversaciones set sin_leer = 4 where id = ${conv}`);
const total = sql("select coalesce(sum(sin_leer),0) from conversaciones where not archivada");

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
  expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
  user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");
const nav = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx = await nav.newContext({viewport:{width:1500,height:1050}});
await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));
const p = await ctx.newPage();
const errores=[]; p.on("pageerror",e=>errores.push(e.message));
await p.goto("http://127.0.0.1:3142/",{waitUntil:"networkidle"});
await p.waitForTimeout(3000);

console.log("── un icono por módulo ──");
{
  const botones = p.locator("aside nav button");
  const n = await botones.count();
  const conIcono = await botones.locator("svg").count();
  console.log(`   (${n} módulos, ${conIcono} iconos)`);
  es("todos tienen icono", conIcono, n);
  const distintos = await botones.locator("svg path").evaluateAll(
    (ps) => new Set(ps.map((x) => x.getAttribute("d"))).size);
  es("Y NINGUNO SE REPITE", distintos, n);
  es("el nombre sigue estando",
     (await botones.first().innerText()).trim(), "Dashboard");
}

console.log("\n── el aviso de mensajes sin leer ──");
{
  const inbox = p.locator('aside nav button').filter({hasText:"Inbox"});
  const t = (await inbox.innerText()).replace(/\s+/g," ").trim();
  console.log(`   (${t} · en la base hay ${total})`);
  es("EL NÚMERO ESTÁ", t.includes(total), true);
  es("y lo dice también el rótulo hablado",
     await inbox.getAttribute("aria-label"), `Inbox, ${total} sin leer`);
  es("los demás módulos no tienen número",
     await p.locator('aside nav button').filter({hasText:"Clientes"}).getAttribute("aria-label"), null);
  await p.locator("aside").screenshot({path: process.env.SP + "/barra.png"});
}

console.log("\n── «Sin asignar» en una sola línea ──");
{
  await p.locator('aside nav button').filter({hasText:"Inbox"}).click();
  await p.waitForTimeout(2000);
  const chips = p.locator('main button').filter({hasText:/^(Activas|Sin asignar|Archivadas|Todas)/});
  const altos = await chips.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
  console.log(`   (altos: ${altos.join(" · ")})`);
  es("las cuatro pastillas miden lo mismo", new Set(altos).size, 1);

  const sin = p.locator('main button').filter({hasText:"Sin asignar"}).first();
  const lineas = await sin.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const linea = parseFloat(getComputedStyle(b).fontSize) * 1.6;
    return Math.round(r.height / linea);
  });
  es("Y OCUPA UN SOLO RENGLÓN", lineas <= 1, true);
  await p.locator("main").screenshot({path: process.env.SP + "/chips.png", clip: undefined}).catch(()=>{});
  await p.screenshot({path: process.env.SP + "/inbox.png"});
}

es("sin errores en la página", errores, []);
await nav.close();
sql(`delete from mensajes where conversacion_id = ${conv}`);
sql(`delete from conversaciones where id = ${conv}`);
sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
sql(`delete from clientes where telefono='${TEL}'`);
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
