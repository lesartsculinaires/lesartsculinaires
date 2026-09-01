/**
 * Los lotes de una importación: ¿una persona puede partirse en dos fichas?
 *
 *     npx esbuild src/lib/planImportacion.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/plan.mjs
 *     npx esbuild src/lib/crm/lotesImportacion.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/lotes.mjs
 *     node supabase/pruebas/lotesImportacion.test.mjs /tmp/plan.mjs /tmp/lotes.mjs
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
const { agruparEnLeads, colgarDeLosQueYaEstan, repartir } = await import(
  process.argv[3] ?? "/tmp/lotes.mjs"
);

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

/* ==========================================================================
 * La última red: la comprobación del servidor
 * ==========================================================================
 *
 * La escuela lo dijo así: «cuando entra una base se repite, o si un vendedor
 * agregó recientemente ese cliente».
 *
 * Las dos mitades de esa frase son el mismo agujero. La pantalla compara
 * contra las oportunidades que el navegador tiene cargadas, y eso deja afuera:
 * lo que no le toca ver a esa persona, lo que se cargó después de abrir la
 * pantalla, y las fichas que no tienen ningún lead. Por cualquiera de las tres
 * puertas entra un duplicado con la pantalla diciendo que está todo bien.
 *
 * `colgarDeLosQueYaEstan` corre en el servidor, contra la tabla de clientes
 * entera y en el momento de importar. Es lo último que pasa antes de crear una
 * ficha.
 */

/** Una fila como la que viaja al servidor. */
const carga = (extra) => ({
  unificar_con: null,
  grupo: null,
  nombre: "",
  telefono: null,
  correo: null,
  ...extra,
});

const CONOCIDOS = [
  { clienteId: 10, nombre: "Marco Tulio Castellanos", telefono: "7100-0001", correo: "marco@ejemplo.com" },
  { clienteId: 11, nombre: "Ana Lucia Ramirez", telefono: "+503 7200 0002", correo: null },
  { clienteId: 12, nombre: "Jose Rodriguez", telefono: null, correo: null },
];

console.log("\n── el servidor reconoce por correo ──");
{
  const filas = [carga({ nombre: "MARCO TULIO CASTELLANOS O.", correo: "MARCO@ejemplo.com" })];
  const salida = colgarDeLosQueYaEstan(filas, CONOCIDOS);
  es("SE CUELGA DE LA FICHA QUE YA ESTÁ", salida[0].unificar_con, 10);
  es("y no crea ninguna", repartir(salida).grupos.length, 0);
}

console.log("\n── y por teléfono, escrito de cualquier forma ──");
{
  // En la base está «+503 7200 0002» y el archivo trae «7200-0002». Es el
  // caso de todos los días: la planilla y el CRM nunca escriben igual un
  // teléfono.
  const filas = [carga({ nombre: "Ana L. Ramirez", telefono: "7200-0002" })];
  es("se reconoce igual", colgarDeLosQueYaEstan(filas, CONOCIDOS)[0].unificar_con, 11);
}

console.log("\n── PERO NUNCA POR NOMBRE SOLO ──");
{
  /*
   * Acá no hay nadie mirando. Dos alumnas se pueden llamar igual, y unir sus
   * fichas sin preguntar mezcla dos historias que después no se separan. La
   * pantalla sí lo propone, porque ahí hay una persona que puede decir que no.
   */
  const filas = [carga({ nombre: "Jose Rodriguez", telefono: "7999-9999", correo: "otro@ejemplo.com" })];
  const salida = colgarDeLosQueYaEstan(filas, CONOCIDOS);
  es("no se cuelga de la ficha del mismo nombre", salida[0].unificar_con, null);
  es("entra como ficha nueva", repartir(salida).grupos.length, 1);
}

console.log("\n── un grupo entero se cuelga junto ──");
{
  /*
   * Tres filas de la misma persona, y sólo UNA trae el correo. Si se buscara
   * fila por fila, las otras dos no encontrarían nada: una se colgaría de la
   * ficha vieja y las otras dos crearían una nueva, y la persona quedaría
   * partida en dos igual.
   */
  const filas = [
    carga({ grupo: "p0", nombre: "Marco Tulio", correo: "marco@ejemplo.com" }),
    carga({ grupo: "p0", nombre: "Marco Tulio", telefono: null }),
    carga({ grupo: "p0", nombre: "Marco Tulio", telefono: null }),
  ];
  const salida = colgarDeLosQueYaEstan(filas, CONOCIDOS);
  es("LAS TRES VAN A LA MISMA FICHA", salida.map((f) => f.unificar_con), [10, 10, 10]);
  es("y no se crea ninguna", repartir(salida).grupos.length, 0);
}

console.log("\n── lo que de verdad es nuevo entra igual ──");
{
  const filas = [
    carga({ nombre: "Persona Nueva", correo: "nueva@ejemplo.com", telefono: "7333-3333" }),
    carga({ nombre: "Otra Nueva", correo: "otra@ejemplo.com" }),
  ];
  const salida = colgarDeLosQueYaEstan(filas, CONOCIDOS);
  es("ninguna se cuelga", salida.every((f) => f.unificar_con == null), true);
  es("y son dos fichas distintas", repartir(salida).grupos.length, 2);
}

console.log("\n── lo que la pantalla ya decidió no se toca ──");
{
  // Si alguien miró y dijo «va a la ficha 99», eso manda: puede haber
  // separado a mano un grupo que los datos juntaban.
  const filas = [carga({ unificar_con: 99, nombre: "Marco Tulio", correo: "marco@ejemplo.com" })];
  es("se respeta la decisión", colgarDeLosQueYaEstan(filas, CONOCIDOS)[0].unificar_con, 99);
}

console.log("\n── sin nada con qué comparar, no revienta ──");
{
  es("base vacía", colgarDeLosQueYaEstan([carga({ nombre: "Alguien" })], []).length, 1);
  es("y sin filas tampoco", colgarDeLosQueYaEstan([], CONOCIDOS), []);
  // Un teléfono demasiado corto no sirve para reconocer a nadie: emparejaría
  // media base.
  es(
    "un teléfono de tres dígitos no empareja",
    colgarDeLosQueYaEstan([carga({ nombre: "X", telefono: "001" })], CONOCIDOS)[0].unificar_con,
    null,
  );
}

/*
 * ============================================================================
 * DE FILAS A LEADS
 * ============================================================================
 *
 * Lo de arriba prueba que la misma persona no cree dos FICHAS. Esto prueba lo
 * que faltaba y que la escuela siguió viendo repetido: que tampoco cree dos
 * LEADS. Una ficha con tres oportunidades iguales colgando se ve, en la
 * pantalla de Clientes, exactamente igual que tres duplicados.
 */
console.log("\n── LA MISMA PERSONA DOS VECES ES UN LEAD ──");
{
  // Dos filas, el mismo cliente, ninguna con programa. Es el caso de Yolanda.
  const leads = agruparEnLeads([7, 7], [null, null]);
  es("QUEDA UNO SOLO", leads.length, 1);
  es("con las dos filas adentro", leads[0].filas, [0, 1]);
  es("y de su dueño", leads[0].clienteId, 7);
}

console.log("\n── pero dos programas son dos leads ──");
{
  /*
   * La regla que protege lo contrario. Panadería y Pastelería son dos ventas
   * con dos montos: juntarlas perdería una, que es peor que el duplicado.
   */
  const leads = agruparEnLeads([7, 7], [3, 9]);
  es("no se juntan", leads.length, 2);
  es(
    "cada uno con su programa",
    leads.map((l) => l.productoId),
    [3, 9],
  );
}

console.log("\n── una fila sin programa se suma a la que hay ──");
{
  // El caso más común: las planillas de contactos no traen esa columna.
  const leads = agruparEnLeads([7, 7], [3, null]);
  es("un solo lead", leads.length, 1);
  es("que conserva el programa", leads[0].productoId, 3);
  es("con las dos filas", leads[0].filas, [0, 1]);

  // Y al revés, que es el orden en que suele venir: primero la fila floja.
  const alReves = agruparEnLeads([7, 7], [null, 3]);
  es("y al revés también", alReves.length, 1);
  es("ADOPTANDO EL PROGRAMA QUE LLEGÓ", alReves[0].productoId, 3);
}

console.log("\n── personas distintas no se mezclan nunca ──");
{
  const leads = agruparEnLeads([7, 8, 7], [null, null, null]);
  es("son dos leads", leads.length, 2);
  es("las dos filas de la 7 juntas", leads[0].filas, [0, 2]);
  es("y la de la 8 aparte", leads[1].filas, [1]);
}

console.log("\n── el caso completo ──");
{
  /*
   * Una persona con Panadería, Pastelería y dos filas sin programa. Las sin
   * programa no se pueden repartir sin adivinar, así que van a la primera:
   * como sólo llenan huecos, lo peor que pueden hacer es completar un dato en
   * el lead de al lado. Abrirles uno propio devolvería el duplicado.
   */
  const leads = agruparEnLeads([1, 1, 1, 1], [3, 9, null, null]);
  es("dos leads, no cuatro", leads.length, 2);
  es("el de Panadería se lleva las sueltas", leads[0].filas, [0, 2, 3]);
  es("y el de Pastelería queda solo", leads[1].filas, [1]);
}

console.log("\n── sin filas no revienta ──");
{
  es("lote vacío", agruparEnLeads([], []), []);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
