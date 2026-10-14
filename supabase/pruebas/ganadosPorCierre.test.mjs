import { compilar } from "./compilar.mjs";
/**
 * Los ganados cuentan en el mes en que se cerró la venta.
 *
 *     node supabase/pruebas/ganadosPorCierre.test.mjs
 *
 * El 14 de octubre de 2026 el tablero de octubre mostraba 4 ganados de
 * Alexandra cuando ella había cerrado 8 ese mes: los otros 4 eran leads que
 * habían entrado en septiembre, y el tablero contaba cada ganado en el mes de
 * registro. Ahora un ganado cuenta en el mes de su fecha de cierre; si no la
 * tiene, en el de registro. Los leads, el valor y el pipeline siguen por mes
 * de registro.
 */
const { porMes, porAnio, mesDeLaVenta } = await compilar("src/lib/periodos.ts");
const { ganadaEnElPeriodo, TODO } = await compilar("src/lib/periodoDelTablero.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const lead = (registro, estado, cierre = null, extra = {}) => ({
  mes: `${registro.slice(0, 7)}-01`,
  fechaRegistro: registro,
  fechaCierre: cierre,
  estado,
  esFinal: estado === "Ganado" || estado === "Perdido",
  valor: 100,
  cerrada: 400,
  ...extra,
});

// Los ocho de Alexandra en octubre: cuatro entraron en septiembre.
const alexandra = [
  lead("2026-09-30", "Ganado", "2026-10-02"),
  lead("2026-10-03", "Ganado", "2026-10-06"),
  lead("2026-09-17", "Ganado", "2026-10-08"),
  lead("2026-09-26", "Ganado", "2026-10-08"),
  lead("2026-10-06", "Ganado", "2026-10-09"),
  lead("2026-09-30", "Ganado", "2026-10-13"),
  lead("2026-10-13", "Ganado", "2026-10-14"),
  lead("2026-10-13", "Ganado", "2026-10-14"),
  lead("2026-10-10", "Activo"),
  lead("2026-09-20", "Perdido", "2026-10-01"),
];

console.log("── por mes ──");
{
  const meses = porMes(alexandra);
  const sep = meses.find((m) => m.clave === "2026-09");
  const oct = meses.find((m) => m.clave === "2026-10");
  es("OCTUBRE CUENTA LOS 8 GANADOS (por cierre)", oct.ganados, 8);
  es("septiembre ninguno: se registraron ahí pero se ganaron en octubre", sep.ganados, 0);
  es("los leads siguen por registro: 5 en septiembre", sep.leads, 5);
  es("y 5 en octubre", oct.leads, 5);
  es("el valor sigue por registro", [sep.cerrado, oct.cerrado], [2000, 2000]);
  es("el pipeline abierto, también (sólo el Activo de octubre)", [sep.pipeline, oct.pipeline], [0, 100]);
}

console.log("\n── un ganado sin fecha de cierre no se pierde ──");
{
  const sinFecha = [lead("2026-08-12", "Ganado", null)];
  es("cuenta en su mes de registro", porMes(sinFecha).find((m) => m.clave === "2026-08")?.ganados, 1);
  es("mesDeLaVenta cae al registro", mesDeLaVenta(sinFecha[0]), "2026-08");
}

console.log("\n── un ganado que se cerró en un mes sin leads nuevos ──");
{
  const meses = porMes([lead("2026-07-05", "Ganado", "2026-09-02")]);
  es("el mes aparece igual, con su ganado", meses.map((m) => [m.clave, m.leads, m.ganados]), [
    ["2026-07", 1, 0],
    ["2026-08", 0, 0],
    ["2026-09", 0, 1],
  ]);
}

console.log("\n── por año ──");
{
  const anios = porAnio([lead("2025-12-20", "Ganado", "2026-01-05"), lead("2026-02-01", "Activo")]);
  es("el ganado de enero es de 2026 aunque entró en 2025", anios.map((a) => [a.clave, a.leads, a.ganados]), [
    ["2025", 1, 0],
    ["2026", 1, 1],
  ]);
}

console.log("\n── el tablero: ¿se ganó en este período? ──");
{
  const l = lead("2026-09-26", "Ganado", "2026-10-08");
  es("en octubre sí", ganadaEnElPeriodo(l, "2026-10"), true);
  es("en septiembre no", ganadaEnElPeriodo(l, "2026-09"), false);
  es("en el año 2026 sí", ganadaEnElPeriodo(l, "2026"), true);
  es("en todo el histórico sí", ganadaEnElPeriodo(l, TODO), true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
