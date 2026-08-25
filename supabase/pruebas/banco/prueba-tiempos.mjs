/**
 * ¿Le contesta rápido a Meta?
 *
 * Meta espera unos cinco segundos por una respuesta. Si el webhook tarda más,
 * reintenta el mismo mensaje —que entonces se guardaría dos veces si el corte
 * de duplicados fallara— y, si la lentitud persiste, termina desactivando el
 * webhook entero: dejan de entrar los mensajes y nadie se entera hasta que un
 * cliente reclama.
 *
 * Desde que se midió por última vez, al webhook se le sumó bastante trabajo:
 * abrir el lead, sortear vendedor, ponerle dueño al hilo. Esta prueba mide el
 * camino completo con la carga que manda Meta de verdad, firmada, y además
 * comprueba que después de correr todo eso los datos quedaron bien guardados.
 *
 * Necesita el banco levantado (ver LEEME.md).
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
const sql = (q) => execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {encoding:"utf8"}).trim();

const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";
async function mandar(tel, nombre, texto) {
  const carga = { object:"whatsapp_business_account", entry:[{id:"222",changes:[{field:"messages",value:{
    messaging_product:"whatsapp", metadata:{phone_number_id:"111"},
    contacts:[{profile:{name:nombre}, wa_id:tel}],
    messages:[{from:tel,id:"wamid."+crypto.randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:texto}}],
  }}]}]};
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256","secreto-de-prueba").update(crudo).digest("hex");
  const t0 = Date.now();
  const r = await fetch(URL, {method:"POST",
    headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+firma}, body:crudo});
  await r.text();
  return { ms: Date.now() - t0, estado: r.status };
}

const usados = [];
const nuevo = () => { const t = "50322" + String(Date.now()+usados.length).slice(-6); usados.push(t); return t; };

console.log("── cuánto tarda en contestarle a Meta ──");
console.log("   (Meta espera unos 5 segundos; si se pasa, reintenta y termina desactivando el webhook)\n");

// Uno de calentamiento, para no medir el arranque en frío del servidor.
await mandar(nuevo(), "Calentando", "Hola");

const casos = [
  ["un número nuevo (crea cliente, conversación, mensaje y lead)", () => mandar(nuevo(), "Nuevo Contacto", "Hola, información")],
  ["uno que ya escribió (sólo guarda el mensaje)", (t) => mandar(t, "Nuevo Contacto", "¿Y el precio?")],
];

const primero = nuevo();
await mandar(primero, "Nuevo Contacto", "Hola");

const medir = async (rotulo, fn, arg) => {
  const tomas = [];
  for (let i = 0; i < 5; i++) tomas.push((await fn(arg)).ms);
  tomas.sort((a,b)=>a-b);
  const mediana = tomas[Math.floor(tomas.length/2)];
  const peor = tomas[tomas.length-1];
  const bien = peor < 2000;
  console.log(`${bien ? "✓" : "✗"} ${rotulo}`);
  console.log(`   mediana ${mediana} ms · peor ${peor} ms   (${tomas.join(", ")})`);
  return bien;
};

let ok = true;
ok = (await medir(casos[0][0], casos[0][1])) && ok;
ok = (await medir(casos[1][0], casos[1][1], primero)) && ok;

console.log("\n── una ráfaga: cinco mensajes a la vez ──");
{
  const t0 = Date.now();
  const rs = await Promise.all([1,2,3,4,5].map(() => mandar(nuevo(), "Rafaga", "Hola")));
  const total = Date.now() - t0;
  const todos200 = rs.every((r) => r.estado === 200);
  console.log(`${todos200 && total < 5000 ? "✓" : "✗"} las cinco contestadas en ${total} ms, todas ${todos200 ? "200" : "con error"}`);
  ok = todos200 && total < 5000 && ok;
}

console.log("\n── y todo quedó guardado ──");
{
  const cuantos = usados.length;
  const enBase = Number(sql(`select count(*) from conversaciones where telefono like '50322%'`));
  console.log(`${enBase === cuantos ? "✓" : "✗"} ${enBase} conversaciones de ${cuantos} números`);
  const leads = Number(sql(`select count(*) from vw_pipeline where telefono like '50322%'`));
  console.log(`${leads === cuantos ? "✓" : "✗"} ${leads} leads abiertos, uno por contacto`);
  const sinDueno = Number(sql(`select count(*) from conversaciones where telefono like '50322%' and vendedor_id is null`));
  console.log(`${sinDueno === 0 ? "✓" : "✗"} ${sinDueno} chats sin dueño`);
  ok = enBase === cuantos && leads === cuantos && sinDueno === 0 && ok;
}

for (const t of usados) {
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono='${t}')`);
  sql(`delete from conversaciones where telefono='${t}'`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono='${t}')`);
  sql(`delete from clientes where telefono='${t}'`);
}
console.log(ok ? "\nTodo bien." : "\nHay algo que revisar.");
process.exit(ok ? 0 : 1);
