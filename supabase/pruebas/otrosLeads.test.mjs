/**
 * Los otros leads de la misma persona: ¿se ven, y se leen bien?
 *
 *     npx esbuild src/lib/otrosLeads.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/otros.mjs
 *     node supabase/pruebas/otrosLeads.test.mjs /tmp/otros.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Necesito poner en la ficha del lead una manera de que, si una misma persona
 * pregunta en distintas fechas distintos productos, se vea: ésa es otra razón
 * por la que se pueden duplicar los leads cuando ingresamos nueva base.»
 *
 * ============================================================================
 * POR QUÉ NO SE ARREGLA JUNTÁNDOLOS
 * ============================================================================
 *
 * Porque no están mal. Mirando la base de verdad, los casos son así:
 *
 *   Silvestre Cerón   Pastelería, PERDIDO en julio → Suprême Diplôme, GANADO
 *                     en agosto.
 *   Karla Pereira     Pastelería, Perdido en junio → Bollería, Activo en julio.
 *
 * Juntarlos borraría la venta ganada y el motivo de pérdida. Lo que falta no es
 * unir: es que al abrir uno se vea el otro, para que nadie los confunda con un
 * repetido y los una.
 */
const { otrosLeadsDe, cuantosPorCliente, posicionEntreLosSuyos } =
  await import(process.argv[2] ?? "/tmp/otros.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Una oportunidad como la que llega a la pantalla. */
const op = (x) => ({
  id: 1, codigo: "CRM-0001", clienteId: 10, cliente: "Quien Sea",
  producto: "Sin definir", etapa: "Prospectos", estado: "Activo",
  vendedor: "Sin asignar", valor: null, fechaRegistro: "2026-07-01",
  ...x,
});

/* El caso de Silvestre, que es el que hay que no romper. */
const SILVESTRE = [
  op({ id: 1, codigo: "CRM-0538", clienteId: 10, producto: "Pastelería Internacional",
       estado: "Perdido", etapa: "Cierre", fechaRegistro: "2026-07-20", valor: 300 }),
  op({ id: 2, codigo: "CRM-0640", clienteId: 10, producto: "Suprême Diplôme",
       estado: "Ganado", etapa: "Cierre", fechaRegistro: "2026-08-20", valor: 1200 }),
  // Otra persona, para comprobar que no se mezcla.
  op({ id: 3, codigo: "CRM-0700", clienteId: 99, cliente: "Otra" }),
];

console.log("── desde un lead se ven los de la misma persona ──");
{
  const otros = otrosLeadsDe({ id: 1, clienteId: 10 }, SILVESTRE);
  es("hay uno", otros.length, 1);
  es("y es el que corresponde", otros[0].codigo, "CRM-0640");
  es("con su programa", otros[0].programa, "Suprême Diplôme");
  es("SE SABE QUE ESTÁ CERRADO", otros[0].cerrado, true);
  es("y con su monto", otros[0].valor, 1200);
}

console.log("\n── NUNCA SE MEZCLAN PERSONAS ──");
{
  // El error que haría que una asesora vea el trato de otra clienta en una
  // ficha que no es suya.
  const otros = otrosLeadsDe({ id: 3, clienteId: 99 }, SILVESTRE);
  es("la otra no ve nada", otros, []);

  const desde640 = otrosLeadsDe({ id: 2, clienteId: 10 }, SILVESTRE);
  es("y desde el otro lado tampoco se cuela", desde640.map((o) => o.codigo), ["CRM-0538"]);
}

console.log("\n── el propio lead no se lista a sí mismo ──");
{
  const otros = otrosLeadsDe({ id: 1, clienteId: 10 }, SILVESTRE);
  es("no está", otros.some((o) => o.codigo === "CRM-0538"), false);
}

console.log("\n── con un solo lead no hay nada que mostrar ──");
{
  // Es el caso de 1532 de las 1566 personas: el bloque no tiene que aparecer.
  const sola = [op({ id: 7, clienteId: 44 })];
  es("lista vacía", otrosLeadsDe({ id: 7, clienteId: 44 }, sola), []);
}

console.log("\n── se ordenan del más nuevo al más viejo ──");
{
  /*
   * Interesa primero lo último que pasó con esa persona. «Se le cayó
   * Pastelería y compró Suprême» se lee de arriba abajo.
   */
  const tres = [
    op({ id: 1, clienteId: 10, codigo: "CRM-A", fechaRegistro: "2026-01-01" }),
    op({ id: 2, clienteId: 10, codigo: "CRM-B", fechaRegistro: "2026-09-01" }),
    op({ id: 3, clienteId: 10, codigo: "CRM-C", fechaRegistro: "2026-05-01" }),
  ];
  es(
    "el más nuevo arriba",
    otrosLeadsDe({ id: 1, clienteId: 10 }, tres).map((o) => o.codigo),
    ["CRM-B", "CRM-C"],
  );
}

console.log("\n── los «vacíos» de la pantalla no se muestran como datos ──");
{
  /*
   * La lista trae «Sin definir» y «Sin asignar» donde no hay nada. Mostrarlos
   * como si fueran el nombre de un programa haría leer «también preguntó por
   * Sin definir».
   */
  const con = [
    op({ id: 1, clienteId: 10 }),
    op({ id: 2, clienteId: 10, producto: "Sin definir", vendedor: "Sin asignar", etapa: "—" }),
  ];
  const o = otrosLeadsDe({ id: 1, clienteId: 10 }, con)[0];
  es("el programa sale nulo", o.programa, null);
  es("el asesor también", o.vendedor, null);
  es("y la etapa vacía también", o.etapa, null);
}

console.log("\n── «1 de 2» en la lista de Clientes ──");
{
  const cuantos = cuantosPorCliente(SILVESTRE);
  es("Silvestre tiene dos", cuantos.get(10), 2);
  es("la otra, uno", cuantos.get(99), 1);

  const puesto = posicionEntreLosSuyos(SILVESTRE);
  // Por fecha: el de julio es el primero, el de agosto el segundo.
  es("el de julio es el 1", puesto.get(1), 1);
  es("el de agosto es el 2", puesto.get(2), 2);

  /*
   * Quien tiene un solo lead NO lleva marca. Poner «1 de 1» en mil quinientas
   * filas sería ruido en todas para ganar claridad en treinta y ocho.
   */
  es("LA QUE TIENE UNO SOLO NO SE MARCA", puesto.get(3), undefined);
}

console.log("\n── el orden de la marca no depende del orden de entrada ──");
{
  // La tabla se puede ordenar por cualquier columna; «1 de 2» tiene que seguir
  // queriendo decir «el primero por fecha».
  const alReves = [...SILVESTRE].reverse();
  const puesto = posicionEntreLosSuyos(alReves);
  es("el de julio sigue siendo el 1", puesto.get(1), 1);
  es("y el de agosto el 2", puesto.get(2), 2);
}

console.log("\n── sin datos no revienta ──");
{
  es("lista vacía", cuantosPorCliente([]).size, 0);
  es("y sin posiciones", posicionEntreLosSuyos([]).size, 0);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
