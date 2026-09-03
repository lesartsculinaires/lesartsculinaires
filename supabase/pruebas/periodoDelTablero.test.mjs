/**
 * El mes que mira el tablero.
 *
 *     npx esbuild src/lib/periodoDelTablero.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/per.mjs
 *     node supabase/pruebas/periodoDelTablero.test.mjs /tmp/per.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «La idea es que cada mes se vea reflejado un nuevo comienzo y poder comparar
 *  los datos de los meses anteriores y a futuro del año [...] que cada mes
 *  pueda ver datos reales y actualizados.»
 *
 * Hasta acá el tablero contaba TODO el histórico: decía «79 oportunidades»
 * tanto el 1 de septiembre como el 30, y los cinco leads que entraron en
 * septiembre no aparecían en ningún lado.
 */
const {
  periodosDisponibles,
  enElPeriodo,
  recortar,
  periodoAnterior,
  periodoInicial,
  comoSeExplicaElVacio,
  TODO,
} = await import(process.argv[2] ?? "/tmp/per.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un lead, con lo mínimo que a esta regla le importa. */
const lead = (mes, extra = {}) => ({
  id: 1,
  mes: mes ? `${mes}-01` : "",
  fechaRegistro: mes ? `${mes}-15` : "",
  ...extra,
});

const HOY = new Date(2026, 8, 3); // 3 de septiembre de 2026

const CARTERA = [
  lead("2026-05"), lead("2026-05"),
  lead("2026-06"),
  lead("2026-08"), lead("2026-08"), lead("2026-08"),
  lead("2026-09"),
  lead("2025-11"),
];

console.log("── SE PUEDEN ELEGIR LOS MESES QUE HUBO ──");
{
  const p = periodosDisponibles(CARTERA, HOY);
  const claves = p.map((x) => x.clave);

  es(
    "los meses, del más nuevo al más viejo",
    claves.filter((c) => c.length === 7),
    ["2026-09", "2026-08", "2026-06", "2026-05", "2025-11"],
  );
  // Ojo con contar por largo: «todo» también mide cuatro.
  es(
    "después los años",
    claves.filter((c) => /^\d{4}$/.test(c)),
    ["2026", "2025"],
  );
  es("y al final, todo", claves[claves.length - 1], TODO);

  es("se leen en castellano", p[0].etiqueta, "Septiembre 2026");
  es("y los años también", p.find((x) => x.clave === "2026").etiqueta, "Año 2026");
}

console.log("\n── EL MES EN CURSO ESTÁ AUNQUE ESTÉ VACÍO ──");
{
  /*
   * Es lo que hace que el «nuevo comienzo» exista. Sin esto, el 1 de octubre a
   * las nueve de la mañana el tablero seguiría mostrando septiembre, y quien
   * lo mire creería que octubre viene igual de bien que el mes que terminó.
   */
  const primeroDeOctubre = new Date(2026, 9, 1);
  const claves = periodosDisponibles(CARTERA, primeroDeOctubre).map((x) => x.clave);

  es("OCTUBRE ESTÁ, SIN UN SOLO LEAD", claves.includes("2026-10"), true);
  es("y es el primero de la lista", claves[0], "2026-10");
  es("con lo que abre el tablero", periodoInicial(primeroDeOctubre), "2026-10");

  // Y lo dice, en vez de mostrar ceros sin explicación.
  const octubre = periodosDisponibles(CARTERA, primeroDeOctubre)[0];
  es(
    "explicando que todavía no entró nada",
    /todavía no entró ningún lead en octubre/i.test(comoSeExplicaElVacio(octubre)),
    true,
  );
}

console.log("\n── no se ofrecen meses que no pasaron ──");
{
  /*
   * No se puede medir un mes que no llegó. Llenar la lista de ceros hasta
   * diciembre no agrega nada: los meses aparecen solos, uno por mes.
   */
  const claves = periodosDisponibles(CARTERA, HOY).map((x) => x.clave);
  es("no está octubre", claves.includes("2026-10"), false);
  es("ni diciembre", claves.includes("2026-12"), false);
}

console.log("\n── QUÉ CAE EN CADA MES ──");
{
  es("un lead de agosto es de agosto", enElPeriodo(lead("2026-08"), "2026-08"), true);
  es("y no de septiembre", enElPeriodo(lead("2026-08"), "2026-09"), false);
  es("pero sí del año 2026", enElPeriodo(lead("2026-08"), "2026"), true);
  es("y no del 2025", enElPeriodo(lead("2026-08"), "2025"), false);
  es("todo el histórico se lleva todo", enElPeriodo(lead("2026-08"), TODO), true);

  es("recortar agosto da tres", recortar(CARTERA, "2026-08").length, 3);
  es("recortar septiembre da uno", recortar(CARTERA, "2026-09").length, 1);
  es("el año 2026 da siete", recortar(CARTERA, "2026").length, 7);
  es("y todo da los ocho", recortar(CARTERA, TODO).length, 8);
}

console.log("\n── UN LEAD SIN FECHA NO SE METE EN UN MES QUE NO ES SUYO ──");
{
  /*
   * Sumarlo al mes en curso «para que no se pierda» inflaría ese mes con algo
   * que no pasó ahí, y la comparación contra el mes anterior dejaría de
   * significar nada.
   */
  const huerfano = lead(null);
  es("no cae en ningún mes", enElPeriodo(huerfano, "2026-09"), false);
  es("ni en ningún año", enElPeriodo(huerfano, "2026"), false);
  es("PERO EN «TODO» SIGUE ESTANDO", enElPeriodo(huerfano, TODO), true);
}

console.log("\n── CONTRA QUÉ SE COMPARA ──");
{
  es("septiembre contra agosto", periodoAnterior("2026-09").clave, "2026-08");
  es("y se lee bien", periodoAnterior("2026-09").etiqueta, "Agosto 2026");

  // El salto de año, que es donde se rompen las cuentas hechas a mano.
  es("ENERO CONTRA DICIEMBRE DEL AÑO PASADO", periodoAnterior("2026-01").clave, "2025-12");
  es("un año contra el anterior", periodoAnterior("2026").clave, "2025");

  // «Todo» no se compara contra nada: no hay un antes de todo.
  es("todo no tiene anterior", periodoAnterior(TODO), null);
}

console.log("\n── SE COMPARA CONTRA UN MES VACÍO IGUAL ──");
{
  /*
   * A propósito: si en agosto hubo 33 leads y en septiembre 5, eso hay que
   * verlo. Saltearse los meses sin datos para comparar contra «el último mes
   * que tuvo algo» escondería justo la caída que hay que mirar.
   */
  const previo = periodoAnterior("2026-08");
  es("julio existe aunque no tenga leads", previo.clave, "2026-07");
  es("y no hay ninguno", recortar(CARTERA, previo.clave).length, 0);
}

console.log("\n── el tablero abre en el mes en curso ──");
{
  /*
   * Y no en el último mes con datos: eso haría que el 1 de octubre siguiera
   * mostrando septiembre, y quien lo mire creería que está viendo el mes nuevo.
   */
  es("septiembre el 3 de septiembre", periodoInicial(HOY), "2026-09");
  es("octubre el 1 de octubre", periodoInicial(new Date(2026, 9, 1)), "2026-10");
  es("enero el 1 de enero", periodoInicial(new Date(2027, 0, 1)), "2027-01");
}

console.log("\n── sin ninguna oportunidad no rompe ──");
{
  const p = periodosDisponibles([], HOY);
  es("igual se puede elegir el mes en curso", p[0].clave, "2026-09");
  es("y todo", p[p.length - 1].clave, TODO);
  es("recortar no rompe", recortar([], "2026-09"), []);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
