/**
 * ¿La ventana de chat nuevo ofrece la plantilla, que es lo único que se puede
 * mandar a alguien que no escribió primero?
 *
 *     node supabase/pruebas/banco/prueba-chat-nuevo.mjs
 *
 * WhatsApp no deja escribirle libremente a un contacto frío: sólo acepta una
 * plantilla aprobada por Meta. Esta prueba cubre que se ofrezcan sólo las
 * aprobadas, que los huecos se pidan todos antes de habilitar el envío —Meta
 * rechaza el mensaje si falta uno y no dice cuál—, y que un envío fallido se
 * vea en vez de perderse al cerrarse la ventana.
 *
 * Necesita el banco armado, la aplicación en 3142 y al menos un contacto con
 * teléfono. Las plantillas de prueba las inserta el propio guion.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
/** Para las consultas con comillas simples adentro, que no sobreviven al -c. */
const sqlBruto = (q) => {
  const f = "/tmp/lac-prueba.sql";
  fs.writeFileSync(f, q + ";");
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -q -f ${f}"`, { encoding: "utf8" });
};
// Plantillas de mentira: dos aprobadas y una en revisión, para comprobar que
// la que no está aprobada no se ofrece.
sqlBruto(`insert into plantillas (id,nombre,idioma,estado,categoria,cuerpo,variables) values
  ('t1','bienvenida_lac','es','APPROVED','MARKETING','Hola {{1}}, gracias por tu interés en Les Arts Culinaires. Te escribe {{2}} del equipo de admisiones.',2),
  ('t2','recordatorio_pago','es','APPROVED','UTILITY','Hola, te recordamos el pago de tu reserva.',0),
  ('t3','en_revision','es','PENDING','MARKETING','Esta no debería ofrecerse.',0)
  on conflict (id) do nothing`);

let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

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
const dlg = () => p.locator('div[role="dialog"][aria-label="Nuevo chat"]');
const enDlg = async () => (await dlg().innerText()).replace(/\s+/g," ").trim();

await p.goto("http://127.0.0.1:3142/",{waitUntil:"networkidle"});
await p.waitForTimeout(3000);
await p.locator('aside button[data-mod="Inbox"]').click();
await p.waitForTimeout(2000);
await p.locator('main button:has-text("Nuevo chat")').first().click();
await p.waitForTimeout(1000);

console.log("── antes de elegir a alguien ──");
es("la ventana está abierta", await dlg().count(), 1);
es("todavía no pide plantilla", /Con qué le escribimos/.test(await enDlg()), false);

console.log("\n── al elegir el contacto aparece la plantilla ──");
{
  // La lista sólo aparece al buscar: sin texto no muestra los seiscientos.
  await dlg().locator('input[placeholder*="Nombre"]').fill('Vence');
  await p.waitForTimeout(800);
  await dlg().locator("button.row").first().click();
  await p.waitForTimeout(900);
  const t = await enDlg();
  es("APARECE EL BLOQUE DE PLANTILLA", /Con qué le escribimos/.test(t), true);
  es("y explica por qué", /sólo deja mandarle una plantilla aprobada/.test(t), true);
  es("el botón dice que abre sin enviar", /Abrir chat sin enviar/.test(t), true);
  await p.screenshot({path: process.env.SP + "/nuevo-chat.png"});
}

console.log("\n── sólo se ofrecen las aprobadas ──");
{
  const opciones = await dlg().locator("select option").allInnerTexts();
  console.log(`   (${opciones.map(o=>o.trim()).join(" · ")})`);
  es("están las dos aprobadas", opciones.filter(o=>/bienvenida_lac|recordatorio_pago/.test(o)).length, 2);
  es("Y NO LA QUE ESTÁ EN REVISIÓN", opciones.some(o=>/en_revision/.test(o)), false);
}

console.log("\n── elegir una pide sus huecos y muestra cómo queda ──");
{
  await dlg().locator("select").selectOption({label: "bienvenida_lac (es)"});
  await p.waitForTimeout(600);
  const huecos = dlg().locator('input[placeholder^="Dato"]');
  es("pide los dos datos", await huecos.count(), 2);
  const t = await enDlg();
  es("y muestra la plantilla con los huecos a la vista", /\{\{1\}\}/.test(t), true);
  es("el botón cambió a enviar", /Abrir y enviar la plantilla/.test(t), true);

  const boton = dlg().locator('button:has-text("Abrir y enviar la plantilla")');
  es("PERO ESTÁ APAGADO HASTA LLENARLOS", await boton.isDisabled(), true);

  await huecos.nth(0).fill("María");
  await huecos.nth(1).fill("Katya");
  await p.waitForTimeout(500);
  const t2 = await enDlg();
  console.log(`   (${(t2.match(/Hola María[^]{0,80}/) ?? ["—"])[0]})`);
  es("la vista previa se arma con lo escrito", /Hola María, gracias por tu interés/.test(t2), true);
  es("y ahora sí se puede mandar", await boton.isDisabled(), false);
  await p.screenshot({path: process.env.SP + "/nuevo-chat-lista.png"});
}

console.log("\n── el envío falla (no hay WhatsApp de verdad) y se avisa ──");
{
  await dlg().locator('button:has-text("Abrir y enviar la plantilla")').click();
  await p.waitForTimeout(3500);
  es("la ventana NO se cerró", await dlg().count(), 1);
  const t = await enDlg();
  console.log(`   (${(t.match(/El token de WhatsApp[^]{0,60}/) ?? ["sin aviso"])[0]})`);
  es("SE VE POR QUÉ FALLÓ, EN CASTELLANO",
     /token de WhatsApp venció o es inválido/.test(t), true);
  const fin = await enDlg();

  es("y ofrece entrar igual", /Entrar al chat igual/.test(fin), true);
  es("el hilo quedó creado de todos modos",
     Number(sql("select count(*) from conversaciones")) > 0, true);
}

es("sin errores en la página", errores, []);
await nav.close();
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
