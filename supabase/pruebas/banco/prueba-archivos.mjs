/**
 * ¿Se ven los archivos del chat, y se confirma antes de mandar uno?
 *
 *     node supabase/pruebas/banco/prueba-archivos.mjs
 *
 * Dos cosas distintas con la misma ventana. Al recibir, mirar el comprobante
 * en grande sin salir del CRM. Al mandar, ver qué se está por mandar: elegir
 * el archivo equivocado y que salga solo es un error que no se puede deshacer,
 * porque del otro lado hay un cliente que ya lo vio.
 *
 * De paso comprueba que las notas de voz se escuchen en el hilo.
 *
 * Necesita el banco armado y la aplicación en 3142. El almacenamiento lo
 * simula el proxy del banco: firma direcciones y devuelve un píxel.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

// Un hilo con una foto y un audio, como los que llegan de verdad.
const TEL = "50355" + String(Date.now()).slice(-6);
async function entra(tipo, mime, nombre) {
  const carga = { object:"whatsapp_business_account", entry:[{id:"222",changes:[{field:"messages",value:{
    messaging_product:"whatsapp", metadata:{phone_number_id:"111"},
    contacts:[{profile:{name:"Con Archivos"},wa_id:TEL}],
    messages:[{from:TEL,id:"wamid."+crypto.randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),
      type:tipo, [tipo]:{id:"media-"+crypto.randomUUID(), mime_type:mime, filename:nombre}}],
  }}]}]};
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256","secreto-de-prueba").update(crudo).digest("hex");
  await fetch("http://127.0.0.1:3142/api/whatsapp/webhook",{method:"POST",
    headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+firma},body:crudo});
  await new Promise(s=>setTimeout(s,700));
}
await entra("image","image/jpeg","comprobante.jpg");
await entra("audio","audio/ogg", null);

const conv = sql(`select id from conversaciones where telefono='${TEL}'`);
// La bajada real falla (no hay Meta), así que se simula el archivo ya guardado.
sql(`update mensajes set media_ruta='x/foto.jpg', media_mime='image/jpeg', media_nombre='comprobante.jpg', media_error=null where conversacion_id=${conv} and tipo='image'`);
sql(`update mensajes set media_ruta='x/nota.ogg', media_mime='audio/ogg', media_nombre=null, media_error=null where conversacion_id=${conv} and tipo='audio'`);

const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
  expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
  user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");
const nav = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx = await nav.newContext({viewport:{width:1500,height:1050}});
await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64");

const p = await ctx.newPage();
const errores=[]; p.on("pageerror",e=>errores.push(e.message));
await p.goto("http://127.0.0.1:3142/",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(1800);
await p.locator('main :text("Con Archivos")').first().click();
await p.waitForTimeout(1800);

console.log("── las notas de audio se escuchan en el hilo ──");
{
  const audios = p.locator("main audio");
  es("HAY UN REPRODUCTOR DE AUDIO", await audios.count(), 1);
  es("y con sus controles", await audios.first().getAttribute("controls") !== null, true);
}

console.log("── la foto recibida abre el visor ──");
{
  const foto = p.locator('main button[title="Ver en grande"] img').first();
  es("la miniatura está en el hilo", await foto.count(), 1);
  await foto.click();
  await p.waitForTimeout(900);
  const visor = p.locator('div[role="dialog"][aria-label*="comprobante"]');
  es("SE ABRE LA VENTANA", await visor.count(), 1);
  es("con el nombre del archivo", (await visor.innerText()).includes("comprobante.jpg"), true);
  es("y la foto en grande adentro", await visor.locator("img").count(), 1);
  await p.screenshot({path: process.env.SP + "/visor-recibido.png"});

  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  es("Escape la cierra", await p.locator('div[role="dialog"][aria-label*="comprobante"]').count(), 0);
}

console.log("\n── mandar una foto pide confirmación ──");
{
  const jpg = "/tmp/prueba-envio.png";
  fs.writeFileSync(jpg, PNG);
  await p.locator('main input[type="file"]').setInputFiles(jpg);
  await p.waitForTimeout(900);

  const visor = p.locator('div[role="dialog"][aria-label*="Se va a enviar"]');
  es("NO SE MANDÓ SOLA: PIDE CONFIRMAR", await visor.count(), 1);
  const t = (await visor.innerText()).replace(/\s+/g," ").trim();
  console.log(`   (${t.slice(0, 90)})`);
  es("dice qué archivo es", /prueba-envio\.png/.test(t), true);
  es("ofrece pie de foto", await visor.locator('input[placeholder*="Pie de foto"]').count(), 1);
  es("y los dos botones", /Cancelar/.test(t) && /Enviar/.test(t), true);
  await p.screenshot({path: process.env.SP + "/visor-envio.png"});

  const antes = sql(`select count(*) from mensajes where conversacion_id=${conv}`);
  await visor.locator('button:text-is("Cancelar")').click();
  await p.waitForTimeout(900);
  es("cancelar la cierra", await p.locator('div[role="dialog"][aria-label*="Se va a enviar"]').count(), 0);
  es("Y NO MANDÓ NADA", sql(`select count(*) from mensajes where conversacion_id=${conv}`), antes);
}

es("sin errores en la página", errores, []);
await nav.close();
sql(`delete from mensajes where conversacion_id=${conv}`);
sql(`delete from conversaciones where id=${conv}`);
sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${TEL}')`);
sql(`delete from clientes where telefono='${TEL}'`);
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
