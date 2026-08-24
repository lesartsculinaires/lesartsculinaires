/**
 * ¿Cuándo hay que recordarle a alguien que cobre?
 *
 *     npx esbuild src/lib/recordatorios.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/rec.mjs
 *     node supabase/pruebas/recordatorios.test.mjs /tmp/rec.mjs
 *
 * La regla se toca poco y cuando se toca hay plata de por medio, así que
 * conviene que sus casos estén escritos. El que más importa es el de una venta
 * marcada como ganada con el pago todavía a medias: ahí el recordatorio tiene
 * que seguir vivo, porque el «ganado» de la escuela quiere decir «dijo que sí»,
 * no «terminó de pagar».
 */
const { necesitaRecordatorio, recordatoriosDe, paraInterrumpir, porAtender } =
  await import(process.argv[2] ?? "/tmp/rec.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) { f++; console.log(`✗ ${t}   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`); }
  else console.log(`✓ ${t}`);
};

/** Una ficha con lo mínimo que mira la regla. */
const ficha = (extra = {}) => ({
  id: 1, reserva: 100, cerrada: 0, esFinal: false, estado: "Activo",
  reservaEn: "2026-08-01T10:00:00Z", ...extra,
});

console.log("── lo que enciende el recordatorio ──");
es("con anticipo y sin venta anotada", necesitaRecordatorio(ficha()), true);
es("sin anticipo, no", necesitaRecordatorio(ficha({ reserva: 0 })), false);
es("con el anticipo en nulo, tampoco", necesitaRecordatorio(ficha({ reserva: null })), false);

console.log("\n── lo que lo apaga ──");
es("la venta anotada", necesitaRecordatorio(ficha({ cerrada: 500 })), false);
es("y el estado Perdido", necesitaRecordatorio(ficha({ estado: "Perdido", esFinal: true })), false);

console.log("\n── el caso que importa ──");
es("GANADO CON EL PAGO A MEDIAS SIGUE RECORDANDO",
   necesitaRecordatorio(ficha({ estado: "Ganado", esFinal: true })), true);
es("y se apaga recién cuando entra la plata",
   necesitaRecordatorio(ficha({ estado: "Ganado", esFinal: true, cerrada: 500 })), false);
es("en pausa también sigue recordando",
   necesitaRecordatorio(ficha({ estado: "En pausa/inactivo" })), true);

console.log("\n── la lista, ordenada ──");
{
  const hoy = new Date("2026-08-23T12:00:00Z");
  const lista = recordatoriosDe([
    ficha({ id: 1, reservaEn: "2026-08-01T10:00:00Z" }),               // vencido
    ficha({ id: 2, reservaEn: "2026-08-08T10:00:00Z" }),               // vence hoy
    ficha({ id: 3, reservaEn: "2026-08-20T10:00:00Z" }),               // en plazo
    ficha({ id: 4, reserva: 0 }),                                      // afuera
    ficha({ id: 5, estado: "Ganado", esFinal: true, reservaEn: "2026-08-09T10:00:00Z" }),
  ], hoy);

  console.log(`   (${lista.map((r) => `${r.oportunidad.id}:${r.urgencia}`).join(" · ")})`);
  es("la de sin anticipo queda afuera", lista.some((r) => r.oportunidad.id === 4), false);
  es("LA GANADA SIGUE EN LA LISTA", lista.some((r) => r.oportunidad.id === 5), true);
  es("primero lo vencido", lista[0].oportunidad.id, 1);
  es("los que interrumpen son los de hoy y lo vencido",
     paraInterrumpir(lista).map((r) => r.oportunidad.id), [1, 2]);
  es("y el reloj cuenta también los que vencen pronto",
     porAtender(lista).map((r) => r.oportunidad.id), [1, 2, 5]);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
