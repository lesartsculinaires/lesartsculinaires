/**
 * ¿La etapa Ganado está al final y le pone el Estado a la ficha?
 *
 *     node supabase/pruebas/banco/prueba-etapa-ganado.mjs
 *
 * El vínculo vive en un disparador de la base, así que se prueba escribiendo
 * como escriben los cinco caminos que llegan a la etapa —el tablero, la ficha,
 * las acciones en lote, la API y una importación—: con un update.
 *
 * Necesita el banco armado. La parte del tablero necesita además la aplicación
 * en 3142.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";

const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();
let f=0; const es=(t,r,e)=>{const ok=JSON.stringify(r)===JSON.stringify(e);
  if(!ok){f++;console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`)}else console.log(`✓ ${t}`)};

const OP = sql("select min(id) from oportunidades");
const mirar = () => sql(`select etapa||' / '||estado||' / '||coalesce(motivo_perdida,'—') from vw_pipeline where id=${OP}`);
const poner = (etapa, estado) => sql(
  `update oportunidades set etapa_id=(select id from etapas where nombre='${etapa}')` +
  (estado ? `, estado_id=(select id from estados where nombre='${estado}')` : "") +
  ` where id=${OP}`);

console.log("── dónde quedó la etapa ──");
{
  const orden = sql("select string_agg(nombre, ' · ' order by orden) from etapas");
  console.log(`   (${orden})`);
  es("AL FINAL DEL TABLERO", orden.endsWith("Ganado"), true);
  es("y Cierre sigue antes", /Cierre · Ganado$/.test(orden), true);
}

console.log("\n── mover la tarjeta pone el estado ──");
{
  poner("Pago", "Activo");
  es("arranca en Pago y Activo", mirar(), "Pago / Activo / —");
  poner("Ganado", null);
  es("AL LLEGAR A GANADO, EL ESTADO CAMBIA SOLO", mirar(), "Ganado / Ganado / —");
}

console.log("\n── pero no le discute a la persona ──");
{
  sql(`update oportunidades set estado_id=(select id from estados where nombre='Perdido'), motivo_perdida_id=(select id from motivos_perdida where nombre='Muy caro') where id=${OP}`);
  es("estando en Ganado se puede marcar Perdido a mano", mirar(), "Ganado / Perdido / Muy caro");

  sql(`update oportunidades set valor_oportunidad=123 where id=${OP}`);
  es("y editar otra cosa no vuelve a forzarlo", mirar(), "Ganado / Perdido / Muy caro");

  poner("Pago", "Activo");
  sql(`update oportunidades set etapa_id=(select id from etapas where nombre='Ganado'), estado_id=(select id from estados where nombre='Perdido') where id=${OP}`);
  es("un guardado que cambia los dos deja el que mandó la persona", mirar(), "Ganado / Perdido / —");
}

console.log("\n── salir de Ganado no revierte nada ──");
{
  poner("Pago", "Activo");
  poner("Ganado", null);
  poner("Cierre", null);
  es("sigue Ganado después de moverla", mirar(), "Cierre / Ganado / —");
}

console.log("\n── un alta que nace en Ganado ──");
{
  sql(`insert into oportunidades (codigo, cliente_id, etapa_id, fecha_registro) values ('CRM-8888', (select min(id) from clientes), (select id from etapas where nombre='Ganado'), current_date)`);
  es("también entra ganada", sql("select estado from vw_pipeline where codigo='CRM-8888'"), "Ganado");
  sql("delete from oportunidades where codigo='CRM-8888'");
}

console.log("\n── ganar no apaga el recordatorio de la reserva ──");
{
  poner("Pago", "Activo");
  sql(`update oportunidades set reserva=100, venta_cerrada=0 where id=${OP}`);
  poner("Ganado", null);
  const fila = sql(`select estado||' / reserva '||coalesce(reserva::int::text,'0')||' / cerrada '||coalesce(venta_cerrada::int::text,'0') from vw_pipeline where id=${OP}`);
  console.log(`   (${fila})`);
  es("queda ganada con el anticipo puesto y sin venta anotada",
     fila, "Ganado / reserva 100 / cerrada 0");
  // Que siga en la lista de recordatorios es cosa de la aplicación; la regla
  // está probada en supabase/pruebas/recordatorios.test.mjs. Acá se comprueba
  // el dato del que esa regla depende: anticipo puesto y venta sin registrar.
  sql(`update oportunidades set reserva=0 where id=${OP}`);
}

console.log("\n── y la columna se ve en el tablero ──");
{
  poner("Ganado", null);
  const jwt = fs.readFileSync("/home/user/lesartsculinaires/supabase/pruebas/banco/jwt-jefa.txt","utf8").trim();
  const g = "base64-"+Buffer.from(JSON.stringify({access_token:jwt,token_type:"bearer",expires_in:86400,
    expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:"x",
    user:{id:"cccccccc-0000-0000-0000-000000000003",email:"jefa@lac.test"}})).toString("base64");
  const nav = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx = await nav.newContext({viewport:{width:1600,height:1000}});
  await ctx.addCookies([{name:"sb-127-auth-token",value:g,domain:"127.0.0.1",path:"/"}]);
  await ctx.addInitScript((h)=>{try{localStorage.setItem("lac.reservas.visto",h)}catch{}}, new Date().toISOString().slice(0,10));
  const p = await ctx.newPage();
  const errores=[]; p.on("pageerror",e=>errores.push(e.message));
  await p.goto("http://127.0.0.1:3142/?mod=x",{waitUntil:"networkidle"});
  await p.waitForTimeout(2500);
  await p.locator('aside button[data-mod="Pipeline"]').click();
  await p.waitForTimeout(2200);
  const t = (await p.locator("main").innerText()).replace(/\s+/g," ").trim();
  es("la columna Ganado está en el tablero", /Ganado/.test(t), true);
  es("y sigue estando Cierre", /Cierre/.test(t), true);
  es("sin errores en la página", errores, []);
  await p.screenshot({path: (process.env.SP ?? "/tmp") + "/pipeline-ganado.png"});
  await nav.close();
}

poner("Pago", "Activo");
console.log(f===0?"\nTodo bien.":`\n${f} fallaron.`);
process.exit(f?1:0);
