/**
 * ¿Cuál base está repetida, y cuál es la que se queda?
 *
 *     npx esbuild src/lib/bases.ts --bundle --format=esm --platform=node \
 *       --alias:@=./src --outfile=/tmp/bases.mjs
 *     node supabase/pruebas/bases.test.mjs /tmp/bases.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO MERECE UNA PRUEBA PROPIA
 * ------------------------------------------------------------------------
 *
 * Porque la marca de «copia» es lo que alguien va a borrar sin pensarlo mucho.
 * El módulo ofrece un botón que selecciona todas las copias de una vez, así
 * que si la marca cae del lado equivocado se borra la base buena —con sus
 * leads y sus contactos— y eso no vuelve.
 *
 * Hay dos formas de equivocarse y las dos están probadas acá:
 *
 *   MARCAR DE MÁS    dos cargas legítimas del mismo archivo con meses de
 *                    distancia —la escuela sube «Asalariados» una vez al año—
 *                    no son un duplicado.
 *
 *   MARCAR LA MALA   cuando el doble clic pasó y alguien trabajó la SEGUNDA
 *                    tanda, la que se queda es esa, no la primera.
 */
const { agruparBases, repetidas } = await import(process.argv[2] ?? "/tmp/bases.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un lead de esa base, con el trabajo que se le hizo encima. */
const lead = (importacionId, extra = {}) => ({
  id: Math.random(),
  clienteId: Math.random(),
  importacionId,
  creadoEn: "2026-08-20T15:00:00Z",
  cerrada: null,
  reserva: null,
  esFinal: false,
  etapaOrden: 1,
  estado: "Activo",
  ...extra,
});

const base = (id, archivo, creadoEn, filas = 10) => ({
  id,
  archivo,
  filas,
  creadoEn,
  creadoPor: null,
});

console.log("── el doble clic: mismo archivo, mismo minuto ──");
{
  const bases = agruparBases(
    [lead(1), lead(1), lead(2), lead(2)],
    [
      base(1, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:00Z"),
      base(2, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:30Z"),
    ],
  );

  const copias = repetidas(bases);
  es("hay una sola copia", copias.length, 1);
  es("Y ES LA SEGUNDA, no la primera", copias[0].importacionId, 2);
  es(
    "y dice de cuál es copia",
    copias[0].duplicadaDe,
    "Asalariados 2025-2026 CRM.xlsx",
  );

  const buena = bases.find((b) => b.importacionId === 1);
  es("la primera no queda marcada", buena.duplicadaDe, null);
}

console.log("\n── PERO SI SE TRABAJÓ LA SEGUNDA, LA QUE SE QUEDA ES ESA ──");
{
  /*
   * El caso que hace que esto no sea trivial. Si el doble clic pasó el lunes y
   * el martes una asesora trabajó los leads de la segunda tanda —sin saber que
   * había dos—, borrar «la segunda» por ser la segunda tira ese trabajo.
   */
  const bases = agruparBases(
    [
      lead(1),
      lead(1),
      lead(2, { etapaOrden: 3 }),
      lead(2, { cerrada: 850 }),
    ],
    [
      base(1, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:00Z"),
      base(2, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:30Z"),
    ],
  );

  const copias = repetidas(bases);
  es("sigue habiendo una sola copia", copias.length, 1);
  es("PERO AHORA LA COPIA ES LA PRIMERA", copias[0].importacionId, 1);
}

console.log("\n── lo que NO es un duplicado ──");
{
  /*
   * La escuela sube «Asalariados» una vez al año, actualizado. Dos cargas del
   * mismo nombre con nueve meses de distancia son dos cargas legítimas, y
   * marcar una borraría la base del año pasado entera.
   */
  const bases = agruparBases(
    [lead(1), lead(2)],
    [
      base(1, "Asalariados 2025-2026 CRM.xlsx", "2025-11-03T10:00:00Z"),
      base(2, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:00Z"),
    ],
  );
  es("dos cargas anuales del mismo archivo no son copias", repetidas(bases).length, 0);
}
{
  const bases = agruparBases(
    [lead(1), lead(2)],
    [
      base(1, "Asalariados 2025-2026 CRM.xlsx", "2026-08-20T15:04:00Z"),
      base(2, "Feria UCA 2026.xlsx", "2026-08-20T15:05:00Z"),
    ],
  );
  es("dos archivos distintos del mismo día tampoco", repetidas(bases).length, 0);
}
{
  const bases = agruparBases([lead(1)], [base(1, "Una sola.xlsx", "2026-08-20T15:04:00Z")]);
  es("y una base sola, menos", repetidas(bases).length, 0);
}

console.log("\n── tres veces el mismo archivo ──");
{
  // Pasa con una tablet que cuenta el toque tres veces. Se queda una y se
  // marcan dos, no una.
  const bases = agruparBases(
    [lead(1), lead(2), lead(3)],
    [
      base(1, "Repetida.xlsx", "2026-08-20T15:04:00Z"),
      base(2, "Repetida.xlsx", "2026-08-20T15:04:20Z"),
      base(3, "Repetida.xlsx", "2026-08-20T15:04:40Z"),
    ],
  );
  const copias = repetidas(bases);
  es("se marcan dos", copias.length, 2);
  es(
    "y la que queda es la primera",
    bases.find((b) => b.duplicadaDe == null && b.importacionId != null).importacionId,
    1,
  );
}

console.log("\n── las cargas sin registro no se pueden marcar ──");
{
  /*
   * Lo que entró antes de que existiera el registro de bases se agrupa por
   * día. No es una carga: es una fecha. No hay nada que borrar del otro lado,
   * y la pantalla apaga su casilla mirando justamente esto.
   */
  const bases = agruparBases(
    [{ ...lead(null), importacionId: null, creadoEn: "2026-07-29T09:00:00Z" }],
    [],
  );
  es("queda agrupada por día", bases.length, 1);
  es("sin id de importación", bases[0].importacionId, null);
  es("y sin marca de copia", bases[0].duplicadaDe, null);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
