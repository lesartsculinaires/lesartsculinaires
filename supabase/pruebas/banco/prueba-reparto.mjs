/**
 * ¿Un mensaje de WhatsApp abre un lead, y le toca a alguien?
 *
 *     node supabase/pruebas/banco/prueba-reparto.mjs
 *
 * Prueba las reglas que decidió la escuela: lead nuevo en Prospectos con canal
 * Whatsapp y asesor sorteado; nada nuevo si el cliente ya tiene un lead, esté
 * abierto o cerrado; y sin nadie habilitado el lead entra igual, sin dueño.
 *
 * Necesita el banco armado (`armar.sh`) y la aplicación en 3142 con
 * `WHATSAPP_APP_SECRET=secreto-de-prueba` y la llave de `jwt-servicio.txt`.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, { encoding: "utf8" }).trim();

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";
const SECRETO = "secreto-de-prueba";

/** Manda un mensaje entrante de un número, como lo mandaría Meta. */
async function escribe(tel, nombre, texto = "Hola, quiero información") {
  const carga = {
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: "111" },
      contacts: [{ profile: { name: nombre }, wa_id: tel }],
      messages: [{
        from: tel, id: "wamid." + crypto.randomUUID(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text", text: { body: texto },
      }],
    } }] }],
  };
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", SECRETO).update(crudo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  await new Promise((s) => setTimeout(s, 500));
  return r.status;
}

const limpiar = (tel) => {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono like '%${tel.slice(-8)}')`);
  sql(`delete from conversaciones where telefono like '%${tel.slice(-8)}'`);
  sql(`delete from seguimientos where oportunidad_id in (select o.id from oportunidades o join clientes c on c.id=o.cliente_id where c.telefono like '%${tel.slice(-8)}')`);
  sql(`delete from oportunidad_notas where oportunidad_id in (select o.id from oportunidades o join clientes c on c.id=o.cliente_id where c.telefono like '%${tel.slice(-8)}')`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono like '%${tel.slice(-8)}')`);
  sql(`delete from clientes where telefono like '%${tel.slice(-8)}'`);
};

const nuevoTel = () => "5037" + String(Date.now()).slice(-7);
const usados = [];
const tel = () => { const t = nuevoTel(); usados.push(t); return t; };

console.log("── quiénes reciben hoy ──");
const reparto = sql("select string_agg(nombre, ' · ') from public.vendedores_para_reparto()");
console.log(`   (${reparto})`);
es("hay al menos dos", reparto.split(" · ").length >= 2, true);

console.log("\n── un número nuevo abre un lead ──");
const t1 = tel();
{
  es("el webhook contesta 200", await escribe(t1, "Nueva Persona"), 200);
  const fila = sql(
    `select p.codigo||'|'||coalesce(p.etapa,'--')||'|'||coalesce(p.canal,'--')||'|'||coalesce(p.vendedor,'SIN ASIGNAR') ` +
    `from vw_pipeline p where p.telefono='${t1}'`);
  console.log(`   (${fila})`);
  const [codigo, etapa, canal, vendedor] = fila.split("|");
  es("tiene código", /^CRM-\d+$/.test(codigo), true);
  es("ENTRA EN PROSPECTOS", etapa, "Prospectos");
  es("CON CANAL WHATSAPP", canal.toLowerCase(), "whatsapp");
  es("Y CON ASESOR ASIGNADO", vendedor !== "SIN ASIGNAR", true);
  es("el asesor es uno de los habilitados", reparto.includes(vendedor), true);
  es("y aparece en el pipeline", sql(`select count(*) from vw_pipeline where telefono='${t1}'`), "1");
}

console.log("\n── si vuelve a escribir, no se abre otro ──");
{
  await escribe(t1, "Nueva Persona", "¿Y cuánto cuesta?");
  es("sigue habiendo un solo lead", sql(`select count(*) from vw_pipeline where telefono='${t1}'`), "1");
  es("y sigue siendo del mismo asesor",
     sql(`select count(distinct vendedor) from vw_pipeline where telefono='${t1}'`), "1");
}

console.log("\n── un ex-alumno con su lead cerrado tampoco abre otro ──");
const t2 = tel();
{
  await escribe(t2, "Ex Alumno");
  const idFinal = sql("select id from estados where es_final limit 1");
  sql(`update oportunidades set estado_id=${idFinal} where cliente_id in (select id from clientes where telefono='${t2}')`);
  es("quedó cerrado", sql(`select es_final from vw_pipeline where telefono='${t2}'`), "t");

  await escribe(t2, "Ex Alumno", "Hola, ¿tienen otro diplomado?");
  es("NO SE ABRIÓ UNO NUEVO", sql(`select count(*) from oportunidades o join clientes c on c.id=o.cliente_id where c.telefono='${t2}'`), "1");
  es("pero el mensaje sí entró",
     sql(`select count(*) from mensajes m join conversaciones c on c.id=m.conversacion_id where c.telefono='${t2}'`), "2");
}

console.log("\n── el sorteo reparte entre los habilitados ──");
{
  const cuantos = 14;
  const míos = [];
  for (let i = 0; i < cuantos; i++) {
    const t = tel();
    míos.push(t);
    await escribe(t, "Sorteo " + i);
  }
  const reparto2 = sql(
    `select string_agg(x.v||'='||x.n, ' · ') from (` +
    `select coalesce(vendedor,'SIN ASIGNAR') as v, count(*) as n from vw_pipeline ` +
    `where telefono in (${míos.map((t) => `'${t}'`).join(",")}) group by 1) x`);
  console.log(`   (${reparto2})`);
  es("los catorce entraron", sql(`select count(*) from vw_pipeline where telefono in (${míos.map((t) => `'${t}'`).join(",")})`), String(cuantos));
  es("ninguno quedó sin asignar", /SIN ASIGNAR/.test(reparto2), false);
  es("y le tocó a más de una persona", reparto2.split(" · ").length >= 2, true);
}

console.log("\n── sin nadie habilitado, el lead entra igual ──");
const t3 = tel();
{
  sql("update roles set recibe_leads = false where recibe_leads");
  await escribe(t3, "Sin Dueño");
  const v = sql(`select coalesce(vendedor,'SIN ASIGNAR') from vw_pipeline where telefono='${t3}'`);
  console.log(`   (${v})`);
  es("EL LEAD NO SE PIERDE", sql(`select count(*) from vw_pipeline where telefono='${t3}'`), "1");
  es("queda sin asignar, a la vista de todos", v, "SIN ASIGNAR");
  sql("update roles set recibe_leads = true where nombre in ('Ventas','Jefe de ventas')");
}

console.log("\n── un rol nuevo entra al sorteo sin tocar código ──");
const t4 = tel();
{
  sql("update roles set recibe_leads = false where recibe_leads");
  sql("update roles set recibe_leads = true where nombre = 'Administrador'");
  const ahora = sql("select string_agg(nombre,' · ') from public.vendedores_para_reparto()");
  console.log(`   (ahora reciben: ${ahora || "nadie"})`);
  await escribe(t4, "Otro Rol");
  const v = sql(`select coalesce(vendedor,'SIN ASIGNAR') from vw_pipeline where telefono='${t4}'`);
  es("el reparto siguió a la casilla del rol", ahora ? ahora.includes(v) : v === "SIN ASIGNAR", true);
  sql("update roles set recibe_leads = false where recibe_leads");
  sql("update roles set recibe_leads = true where nombre in ('Ventas','Jefe de ventas')");
}

for (const t of usados) limpiar(t);
console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
