/**
 * ¿El sorteo reparte de verdad entre los dos vendedores?
 *
 * La prueba de `reparto.test.mjs` mira la función sola, con un azar de
 * mentira. Ésta mira lo que interesa de verdad: sesenta mensajes de sesenta
 * números nuevos entrando por el webhook real, y a quién le quedó cada lead.
 *
 * Lo que se comprueba, en orden de importancia:
 *
 *   1. Que ningún lead quede sin dueño.
 *   2. Que a los dos les toque —no que les toque igual—. Un reparto al azar
 *      no da treinta y treinta, da algo alrededor de ahí, y exigir el empate
 *      sería exigir que no sea al azar. Se pide que el más flojo se lleve al
 *      menos un 30 %: con sesenta tiros parejos, quedar por debajo de eso
 *      pasa menos de una vez cada mil, así que si salta hay algo roto —un
 *      vendedor filtrado de más, o un sorteo que siempre elige al primero.
 *   3. Que el dueño del lead y el dueño del chat sean la misma persona. Si no,
 *      la bandeja dice «sin asignar» sobre un lead que sí tiene asesor.
 *
 * Necesita el banco levantado (ver LEEME.md).
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const sql = (q) =>
  execSync(`su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \\"${q}\\""`, {
    encoding: "utf8",
  }).trim();

const URL = "http://127.0.0.1:3142/api/whatsapp/webhook";
const CUANTOS = 60;
const PREFIJO = "50399";

async function escribir(tel) {
  const carga = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "222",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "111" },
              contacts: [{ profile: { name: "Interesado " + tel.slice(-4) }, wa_id: tel }],
              messages: [
                {
                  from: tel,
                  id: "wamid." + crypto.randomUUID(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Hola, quiero información de los cursos" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const crudo = JSON.stringify(carga);
  const firma = crypto.createHmac("sha256", "secreto-de-prueba").update(crudo).digest("hex");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + firma },
    body: crudo,
  });
  await r.text();
  return r.status;
}

const limpiar = (tels) => {
  const lista = tels.map((t) => `'${t}'`).join(",");
  sql(`delete from mensajes where conversacion_id in (select id from conversaciones where telefono in (${lista}))`);
  sql(`delete from conversaciones where telefono in (${lista})`);
  sql(`delete from oportunidades where cliente_id in (select id from clientes where telefono in (${lista}))`);
  sql(`delete from clientes where telefono in (${lista})`);
};

const gente = sql(`select id || '|' || nombre from vendedores_para_reparto()`)
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [id, nombre] = l.split("|");
    return { id: Number(id), nombre };
  });

console.log(`── ${CUANTOS} mensajes de ${CUANTOS} números nuevos ──`);
console.log(`   reparten entre: ${gente.map((v) => v.nombre).join(", ")}\n`);

const base = Date.now();
const tels = Array.from({ length: CUANTOS }, (_, i) => PREFIJO + String(base + i).slice(-6));
limpiar(tels);

// De a diez, para no ahogar al banco y a la vez no tardar un minuto.
const estados = [];
for (let i = 0; i < tels.length; i += 10) {
  estados.push(...(await Promise.all(tels.slice(i, i + 10).map(escribir))));
}

let ok = true;
const decir = (bien, texto) => {
  console.log(`${bien ? "✓" : "✗"} ${texto}`);
  ok = bien && ok;
};

decir(estados.every((e) => e === 200), `los ${CUANTOS} contestados con 200`);

const lista = tels.map((t) => `'${t}'`).join(",");
const abiertos = Number(
  sql(`select count(*) from oportunidades o join clientes c on c.id = o.cliente_id where c.telefono in (${lista})`),
);
decir(abiertos === CUANTOS, `${abiertos} leads abiertos de ${CUANTOS}`);

const huerfanos = Number(
  sql(`select count(*) from oportunidades o join clientes c on c.id = o.cliente_id
        where c.telefono in (${lista}) and o.vendedor_id is null`),
);
decir(huerfanos === 0, `${huerfanos} leads sin dueño`);

// A quién le tocó cada uno.
const reparto = sql(
  `select o.vendedor_id || '|' || count(*) from oportunidades o
     join clientes c on c.id = o.cliente_id
    where c.telefono in (${lista}) group by o.vendedor_id order by o.vendedor_id`,
)
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [id, n] = l.split("|");
    return { id: Number(id), n: Number(n) };
  });

console.log("");
for (const v of gente) {
  const toco = reparto.find((r) => r.id === v.id)?.n ?? 0;
  const porciento = Math.round((toco / CUANTOS) * 100);
  const barra = "█".repeat(Math.round(toco / 2));
  console.log(`   ${v.nombre.padEnd(14)} ${String(toco).padStart(2)}  ${String(porciento).padStart(3)}%  ${barra}`);
}
console.log("");

decir(reparto.length === gente.length, `a los ${gente.length} les tocó algo`);

const flojo = Math.min(...gente.map((v) => reparto.find((r) => r.id === v.id)?.n ?? 0));
decir(flojo >= CUANTOS * 0.3, `al que menos le tocó se llevó ${Math.round((flojo / CUANTOS) * 100)} % (mínimo sano 30 %)`);

const desparejos = Number(
  sql(`select count(*) from conversaciones cv
         join clientes c on c.id = cv.cliente_id
         join oportunidades o on o.cliente_id = c.id
        where c.telefono in (${lista}) and cv.vendedor_id is distinct from o.vendedor_id`),
);
decir(desparejos === 0, `${desparejos} chats con un dueño distinto al de su lead`);

limpiar(tels);
console.log(ok ? "\nTodo bien." : "\nHay algo que revisar.");
process.exit(ok ? 0 : 1);
