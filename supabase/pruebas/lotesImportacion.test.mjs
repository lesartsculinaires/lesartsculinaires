/**
 * Los lotes de una importación: ¿una persona puede partirse en dos fichas?
 *
 *     npx esbuild src/lib/planImportacion.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/plan.mjs
 *     node supabase/pruebas/lotesImportacion.test.mjs /tmp/plan.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * La escuela avisó: «al momento de subir una base de datos siempre se repiten
 * los leads y no se unifican».
 *
 * La pantalla manda las filas de a 200 —una petición con dos mil filas no
 * pasa— y el servidor crea UNA ficha por grupo DENTRO DE CADA LOTE. O sea: si
 * las tres filas de Ana no viajan en el mismo lote, Ana entra dos veces.
 *
 * `enLotes` ya sabía eso y evitaba cortar un grupo por la mitad… mirando sólo
 * la fila siguiente. Y ahí está el agujero: las filas se mandan en el orden
 * del archivo, así que una persona que aparece en la fila 5 y otra vez en la
 * 300 tiene sus dos filas a 295 de distancia. La comprobación de «¿la que
 * sigue es del mismo grupo?» nunca ve nada, el corte cae en el medio, y esa
 * persona termina con dos fichas.
 *
 * Y es justo el caso más común de una base de la escuela: la misma persona
 * preguntando por dos programas distintos, con sus filas lejos una de la otra
 * porque la planilla está ordenada por programa o por fecha.
 *
 * ============================================================================
 * LO QUE SE PRUEBA
 * ============================================================================
 *
 * Que ninguna clave de grupo aparezca en dos lotes. Esa es la condición: si se
 * cumple, el servidor no puede duplicar; si se rompe, duplica siempre.
 */
const { construirPlan, enLotes } = await import(process.argv[2] ?? "/tmp/plan.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Una fila válida mínima, como sale de `construirFilas`. */
const fila = (linea, nombre, extra = {}) => ({
  linea,
  nombre,
  telefono: null,
  correo: null,
  vendedor_id: null,
  producto_id: null,
  territorio_id: null,
  canal_id: null,
  etapa_id: null,
  estado_id: null,
  fecha_registro: "2026-08-27",
  fecha_cierre: null,
  valor_oportunidad: null,
  venta_cerrada: null,
  descuento_promocion: null,
  fecha_nacimiento: null,
  pais: null,
  edad: null,
  nota: null,
  errores: [],
  avisos: [],
  duplicado: false,
  coincideCon: null,
  ...extra,
});

/** ¿Alguna clave de grupo aparece en más de un lote? */
const gruposPartidos = (lotes) => {
  const donde = new Map();
  const partidos = new Set();

  lotes.forEach((lote, n) => {
    for (const d of lote) {
      if (!d.grupo) continue;
      const previo = donde.get(d.grupo);
      if (previo != null && previo !== n) partidos.add(d.grupo);
      donde.set(d.grupo, n);
    }
  });

  return [...partidos];
};

console.log("── el caso de la escuela: la misma persona, lejos en el archivo ──");
{
  /*
   * Doscientas cincuenta filas. La misma persona en la 2 y en la 249, que es
   * como viene una planilla ordenada por programa: preguntó por dos cosas y
   * quedaron en extremos opuestos del archivo.
   */
  const filas = [];
  for (let i = 2; i <= 251; i++) {
    const esElla = i === 2 || i === 249;
    filas.push(
      fila(i, esElla ? "Marco Tulio Castellanos" : `Persona Numero ${i}`, {
        correo: esElla ? "marco@ejemplo.com" : `p${i}@ejemplo.com`,
      }),
    );
  }

  const plan = construirPlan({ filas, existentes: [], modo: "unificar" });

  es("se reconocen como una sola persona", plan.resumen.fichasNuevas, 249);
  es("y sus dos filas quedan juntas", plan.resumen.seJuntanEntreSi, 1);

  const lotes = enLotes(plan.destinos, 200);
  console.log(`   (${lotes.length} lotes de ${lotes.map((l) => l.length).join(" y ")})`);

  // ESTA es la comprobación. Con la clave repartida en dos lotes, el servidor
  // crea dos fichas de Marco Tulio y la unificación no sirvió de nada.
  es("NINGÚN GRUPO PARTIDO EN DOS LOTES", gruposPartidos(lotes), []);

  // Y no se pierde ni se repite ninguna fila por acomodarlas.
  const todas = lotes.flat();
  es("van todas las filas", todas.length, plan.destinos.length);
  es(
    "sin repetir ninguna",
    new Set(todas.map((d) => d.fila.linea)).size,
    plan.destinos.length,
  );
}

console.log("\n── tres apariciones, en tres lotes distintos ──");
{
  // El mismo problema pero peor: filas 2, 210 y 420. Con lotes de 200 caerían
  // en tres lotes y la persona entraría tres veces.
  const filas = [];
  for (let i = 2; i <= 501; i++) {
    const esEl = i === 2 || i === 210 || i === 420;
    filas.push(
      fila(i, esEl ? "Ana Lucia Ramirez" : `Otra Persona ${i}`, {
        correo: esEl ? "ana@ejemplo.com" : `o${i}@ejemplo.com`,
      }),
    );
  }

  const plan = construirPlan({ filas, existentes: [], modo: "unificar" });
  const lotes = enLotes(plan.destinos, 200);
  console.log(`   (${lotes.length} lotes de ${lotes.map((l) => l.length).join(", ")})`);
  es("las tres son una sola persona", plan.resumen.seJuntanEntreSi, 2);
  es("Y VIAJAN JUNTAS", gruposPartidos(lotes), []);
}

console.log("\n── el orden del archivo se respeta en lo demás ──");
{
  /*
   * Las filas de una persona se adelantan a donde apareció por primera vez, y
   * sólo eso. El resto conserva el orden de la planilla: los códigos CRM-XXXX
   * se asignan en ese orden, y quien después compara el archivo con el CRM
   * tiene que poder seguir la lista.
   */
  const filas = [
    fila(2, "Ana Lucia Ramirez", { correo: "ana@ejemplo.com" }),
    fila(3, "Beto Perez", { correo: "beto@ejemplo.com" }),
    fila(4, "Carla Gomez", { correo: "carla@ejemplo.com" }),
    fila(5, "Ana Lucia Ramirez", { correo: "ana@ejemplo.com" }),
    fila(6, "Dora Mejia", { correo: "dora@ejemplo.com" }),
  ];

  const plan = construirPlan({ filas, existentes: [], modo: "unificar" });
  es(
    "Ana se junta consigo misma, el resto queda en su lugar",
    plan.destinos.map((d) => d.fila.linea),
    [2, 5, 3, 4, 6],
  );
}

console.log("\n── lo que ya estaba bien no cambia ──");
{
  const filas = [
    fila(2, "Uno Uno", { correo: "u1@ejemplo.com" }),
    fila(3, "Dos Dos", { correo: "d2@ejemplo.com" }),
    fila(4, "Tres Tres", { correo: "t3@ejemplo.com" }),
  ];

  const plan = construirPlan({ filas, existentes: [], modo: "unificar" });
  es("sin repetidos, el orden es el del archivo", plan.destinos.map((d) => d.fila.linea), [2, 3, 4]);
  es("y ninguna lleva grupo", plan.destinos.every((d) => d.grupo == null), true);

  const lotes = enLotes(plan.destinos, 2);
  es("se parte donde toca", lotes.map((l) => l.length), [2, 1]);
}

console.log("\n── una que ya está en el CRM no necesita grupo ──");
{
  /*
   * Cuando la persona YA existe, el servidor recibe su id y lo usa directo.
   * Eso funciona igual en cualquier lote, así que estas filas no necesitan
   * viajar juntas y no tienen por qué forzar un lote más grande.
   */
  const filas = [
    fila(2, "Marco Tulio Castellanos", { correo: "marco@ejemplo.com" }),
    fila(3, "Otra Persona", { correo: "otra@ejemplo.com" }),
    fila(4, "Marco Tulio Castellanos", { correo: "marco@ejemplo.com" }),
  ];

  const plan = construirPlan({
    filas,
    existentes: [
      { clienteId: 77, nombre: "Marco Tulio Castellanos", telefono: null, correo: "marco@ejemplo.com" },
    ],
    modo: "unificar",
  });

  const suyas = plan.destinos.filter((d) => d.unificarCon === 77);
  es("las dos apuntan al cliente que ya existe", suyas.length, 2);
  es("y no llevan grupo", suyas.every((d) => d.grupo == null), true);
  // Una ficha nueva, la de «Otra Persona». Marco Tulio no: se cuelga de la que
  // ya está en el CRM, que es de lo que se trata unificar.
  es("sólo se crea la ficha de la otra persona", plan.resumen.fichasNuevas, 1);
  es("y las dos de Marco se unen a la del CRM", plan.resumen.seUnenAlCrm, 2);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
