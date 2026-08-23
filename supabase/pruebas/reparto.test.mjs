import { sortear, yaEsLead, fechaDeReactivacion, MESES_PARA_REACTIVAR } from "./reparto.mjs";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

const dos = [{ id: 7, nombre: "Alexandra" }, { id: 9, nombre: "Katya" }];

console.log("── los casos de borde ──");
es("sin nadie habilitado devuelve nulo", sortear([]), null);
es("con uno solo, siempre ese", sortear([dos[0]], () => 0.99).nombre, "Alexandra");
es("un azar de 0 toma el primero", sortear(dos, () => 0).nombre, "Alexandra");
es("un azar de 0.99 toma el último", sortear(dos, () => 0.99).nombre, "Katya");
es("UN AZAR DE 1 NO SE VA DE RANGO", sortear(dos, () => 1)?.nombre, "Katya");
es("justo en el medio pasa al segundo", sortear(dos, () => 0.5).nombre, "Katya");

console.log("\n── mil tiradas entre dos ──");
{
  const cuenta = new Map(dos.map((c) => [c.nombre, 0]));
  for (let i = 0; i < 1000; i++) {
    const q = sortear(dos);
    cuenta.set(q.nombre, cuenta.get(q.nombre) + 1);
  }
  const [a, b] = [...cuenta.values()];
  console.log(`   (Alexandra ${a} · Katya ${b})`);
  es("las dos recibieron", a > 0 && b > 0, true);
  // Con mil tiradas, alejarse más de un 10% del medio es prácticamente
  // imposible por azar: si pasa, el sorteo está torcido.
  es("y reparte parejo", Math.abs(a - b) < 100, true);
}

console.log("\n── cinco personas, ninguna se queda afuera ──");
{
  const cinco = [1, 2, 3, 4, 5].map((id) => ({ id, nombre: "p" + id }));
  const vistos = new Set();
  for (let i = 0; i < 2000; i++) vistos.add(sortear(cinco).id);
  es("todas salieron alguna vez", vistos.size, 5);
}

console.log("\n── quién ya es lead ──");
es("sin oportunidades, no lo es", yaEsLead(0), false);
es("con una, sí", yaEsLead(1), true);
es("con varias cerradas, también", yaEsLead(3), true);

console.log("\n── los tres meses ──");
es("son tres", MESES_PARA_REACTIVAR, 3);
es("de agosto a noviembre", fechaDeReactivacion("2026-08-23"), "2026-11-23");
es("cruzando el año", fechaDeReactivacion("2026-11-15"), "2027-02-15");
es("el 31 de enero cae el 30 de abril", fechaDeReactivacion("2026-01-31"), "2026-04-30");
es("el 30 de noviembre cae el 28 de febrero", fechaDeReactivacion("2026-11-30"), "2027-02-28");
es("y en bisiesto, el 29", fechaDeReactivacion("2027-11-30"), "2028-02-29");

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
