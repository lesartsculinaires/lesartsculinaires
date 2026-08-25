/**
 * ¿Marcar «no interesado» deja el recordatorio de volver a escribirle?
 *
 *     node supabase/pruebas/banco/prueba-reactivacion.mjs
 *
 * Prueba las tres cosas que importan: que la casilla salga sólo con ese
 * motivo —los otros no se arreglan esperando—, que no cree nada hasta que la
 * persona confirme los cambios, y que el aviso quede a tres meses de
 * calendario.
 *
 * Necesita el banco armado y la aplicación en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

sql("delete from seguimientos where tipo='reactivacion'");
const OP = sql("select id from oportunidades order by id limit 1");
const CODIGO = sql(`select codigo from oportunidades where id=${OP}`);
const perdido = sql("select id from estados where nombre='Perdido'");

/** El bloque rojo del motivo, y la casilla que vive adentro. */
const ponerMotivo = (nombre) => {
  const m = sql(`select id from motivos_perdida where nombre='${nombre}'`);
  // Si el motivo cambió de nombre, decirlo acá. Sin esto el id sale vacío y
  // el error que se ve es un «syntax error at or near where» del update, que
  // no se parece en nada al problema real.
  if (!m) throw new Error(`no existe el motivo «${nombre}» en motivos_perdida`);
  sql(`update oportunidades set estado_id=${perdido}, motivo_perdida_id=${m} where id=${OP}`);
};

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
const enPantalla = async () => (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g," ").trim();

/** La casilla de reactivación: la que está dentro del bloque del motivo. */
const casilla = () => p.locator(
  'xpath=//p[contains(., "¿Por qué se perdió?")]/parent::div//input[@type="checkbox"]');

const abrirFicha = async () => {
  await p.goto("http://127.0.0.1:3142/?mod=x",{waitUntil:"networkidle"});
  await p.waitForTimeout(2200);
  await p.locator('aside button[data-mod="Clientes"]').click();
  await p.waitForTimeout(1600);
  // La fila de ESTA oportunidad: el orden de la tabla no es el de la base.
  await p.locator(`main table tbody tr`).filter({hasText: CODIGO}).first().click();
  await p.waitForTimeout(1300);
};

console.log("── la casilla sólo sale con «No Interesado» ──");
{
  ponerMotivo("Muy caro");
  await abrirFicha();
  const t = await enPantalla();
  es("el bloque del motivo está", /Por qué se perdió/.test(t), true);
  es("pero sin casilla de reactivación", await casilla().count(), 0);
}
{
  ponerMotivo("No interesado");
  await abrirFicha();
  es("CON «NO INTERESADO» APARECE", await casilla().count(), 1);
  es("y viene apagada", await casilla().isChecked(), false);
}

console.log("\n── marcarla no crea nada hasta confirmar ──");
{
  await casilla().check();
  await p.waitForTimeout(500);
  es("dice para cuándo quedaría", /Queda para el .*en Recordatorios/.test(await enPantalla()), true);
  es("todavía no creó nada", sql("select count(*) from seguimientos where tipo='reactivacion'"), "0");
}

console.log("\n── al confirmar los cambios, queda anotado ──");
{
  // Nada más se toca: la ficha ya estaba perdida y con el motivo puesto, así
  // que lo único pendiente es el recordatorio. Es el caso que antes dejaba el
  // botón apagado.
  const revisar = p.locator('button:has-text("Revisar"), button:has-text("Guardar cambios")').first();
  if (await revisar.count()) {
    await revisar.click();
    await p.waitForTimeout(900);
    const conf = p.locator('button:has-text("Guardar"), button:has-text("Aplicar")').last();
    if (await conf.count()) { await conf.click(); await p.waitForTimeout(2600); }
  }

  const fila = sql("select tipo||'|'||proxima||'|'||detalle from seguimientos where tipo='reactivacion'");
  console.log(`   (${fila || "(no se creó)"})`);
  es("QUEDÓ CREADO", fila.startsWith("reactivacion|"), true);
  if (fila) {
    const proxima = fila.split("|")[1];
    const meses = sql(`select (extract(year from age('${proxima}'::date, (now() at time zone 'America/El_Salvador')::date))*12 + extract(month from age('${proxima}'::date, (now() at time zone 'America/El_Salvador')::date)))::int`);
    es("y es a tres meses", meses, "3");
  }
}

console.log("\n── se ve en Recordatorios ──");
{
  await p.goto("http://127.0.0.1:3142/?mod=x",{waitUntil:"networkidle"});
  await p.waitForTimeout(2000);
  await p.locator('aside button[data-mod="Recordatorios"]').click();
  await p.waitForTimeout(1800);
  const t = await enPantalla();
  es("con el rótulo de reactivación", /Reactivación/.test(t), true);
  es("y con el nombre «Volver a escribirle» en su detalle o rótulo",
     /Reactivación/.test(t) && /no le interesa/i.test(t), true);
  await p.screenshot({path: process.env.SP + "/reactivar.png", fullPage:true});
}

es("sin errores en la página", errores, []);
await nav.close();
sql("delete from seguimientos where tipo='reactivacion'");
sql(`update oportunidades set motivo_perdida_id=null where id=${OP}`);
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
