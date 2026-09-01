/**
 * Cuándo un lead que entra ES un lead que ya está.
 *
 *     npx esbuild src/lib/leadRepetido.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/leadRepetido.mjs
 *     node supabase/pruebas/leadRepetido.test.mjs /tmp/leadRepetido.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «Todavía se siguen duplicando leads a pesar de que di la opción de unificar.
 * La idea es que se unifique la información, que la que se repita se unifique y
 * la adicional se agregue: que sea uno solo.»
 *
 * El caso que lo destapó: CRM-2625 y CRM-2626, los dos de Yolanda, el mismo
 * día, los dos sin programa y sin asesor. La ficha se había unificado bien; los
 * leads, no.
 *
 * ============================================================================
 * LAS DOS COSAS QUE TIENEN QUE SER CIERTAS A LA VEZ
 * ============================================================================
 *
 * Y son opuestas, que es lo que hace que valga la pena probarlo:
 *
 *   QUE SEA UNO SOLO           Cargar dos veces a la misma persona deja un
 *                              lead, no dos.
 *
 *   QUE NO SE COMAN TRATOS     Pero una persona SÍ puede tener dos leads de
 *   DE VERDAD                  verdad: dos programas distintos son dos ventas
 *                              distintas, con dos montos. Juntarlas perdería
 *                              una, que es peor que el duplicado.
 */
const {
  cualAbsorbe,
  planificarLead,
  estaCerrada,
  listarCamposDeLead,
  ETIQUETA_LEAD,
} = await import(process.argv[2] ?? "/tmp/leadRepetido.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un lead guardado, con todo en blanco salvo lo que se diga. */
const lead = (x = {}) => ({
  id: 1,
  codigo: "CRM-2625",
  vendedor_id: null,
  producto_id: null,
  territorio_id: null,
  canal_id: null,
  etapa_id: null,
  estado_id: null,
  fecha_registro: "2026-09-01",
  fecha_cierre: null,
  valor_oportunidad: null,
  venta_cerrada: null,
  descuento_promocion: null,
  ...x,
});

/** Lo que trae el alta. */
const entra = (x = {}) => ({
  vendedor_id: null,
  producto_id: null,
  territorio_id: null,
  canal_id: null,
  etapa_id: null,
  estado_id: null,
  fecha_registro: "2026-09-01",
  fecha_cierre: null,
  valor_oportunidad: null,
  descuento_promocion: null,
  ...x,
});

const GANADO = 9;
const PERDIDO = 10;
const FINALES = new Set([GANADO, PERDIDO]);
const NINGUNO = new Set();

console.log("── EL CASO DE YOLANDA ──");
{
  /*
   * Lo que pasaba en producción: la misma persona, el mismo día, los dos sin
   * programa. Antes de esto se abría un segundo lead igual, y ahí estaban
   * CRM-2625 y CRM-2626.
   */
  const r = cualAbsorbe([lead()], entra(), FINALES);
  es("SE JUNTA CON EL QUE YA TENÍA", r.lead?.codigo, "CRM-2625");
  es("y no hay motivo para abrir otro", r.porQueNo, null);

  const p = planificarLead(lead(), entra());
  es("y no hay nada que escribirle", Object.keys(p.parche).length, 0);
  es("ni ningún dato en conflicto", p.choques, []);
}

console.log("\n── un contacto sin leads: hay que crearle uno ──");
{
  const r = cualAbsorbe([], entra(), FINALES);
  es("no hay con qué juntarlo", r.lead, null);
  // Sin motivo: no es que no se pudo, es que no había ninguno.
  es("y no es que se haya rechazado", r.porQueNo, null);
}

console.log("\n── DOS PROGRAMAS SON DOS TRATOS ──");
{
  /*
   * La regla que protege lo contrario de todo lo demás. Panadería en marzo y
   * Pastelería en septiembre son dos ventas: juntarlas dejaría un solo monto.
   */
  const r = cualAbsorbe([lead({ producto_id: 3 })], entra({ producto_id: 7 }), FINALES);
  es("NO SE JUNTAN", r.lead, null);
  es("y se dice por qué", r.porQueNo, "otro_programa");

  // El mismo programa sí, claro.
  const mismo = cualAbsorbe([lead({ producto_id: 3 })], entra({ producto_id: 3 }), FINALES);
  es("el mismo programa sí se junta", mismo.lead?.codigo, "CRM-2625");
}

console.log("\n── y un lead sin programa no contradice a nadie ──");
{
  /*
   * El caso más común: los formularios de Meta no preguntan el programa. Si
   * eso impidiera juntar, no se juntaría casi nada y volverían los duplicados.
   */
  const r = cualAbsorbe([lead({ producto_id: 3 })], entra({ producto_id: null }), FINALES);
  es("se suma al que hay", r.lead?.codigo, "CRM-2625");

  // Y al revés: el guardado sin programa recibe al que sí lo trae, y de paso
  // se lo completa.
  const r2 = cualAbsorbe([lead()], entra({ producto_id: 7 }), FINALES);
  es("y el guardado sin programa recibe al que trae uno", r2.lead?.codigo, "CRM-2625");
  const p = planificarLead(lead(), entra({ producto_id: 7 }));
  es("COMPLETÁNDOLE EL PROGRAMA", p.parche.producto_id, 7);
  es("y contándolo", p.completados, ["producto_id"]);
}

console.log("\n── UNA CERRADA NO SE TOCA ──");
{
  /*
   * Ganado o Perdido es historia. Escribirle encima cambiaría un mes que ya se
   * cerró y las cuentas que salieron de él.
   */
  const ganada = lead({ estado_id: GANADO });
  es("una ganada está cerrada", estaCerrada(ganada, FINALES), true);

  const r = cualAbsorbe([ganada], entra(), FINALES);
  es("NO SE LE AGREGA NADA", r.lead, null);
  es("y se dice por qué", r.porQueNo, "todas_cerradas");

  // Con plata anotada también, aunque el estado esté en blanco: hay fichas
  // viejas del Excel así, y son historia igual.
  const vieja = lead({ venta_cerrada: 1500 });
  es("con venta anotada también", estaCerrada(vieja, FINALES), true);
  es("y tampoco se toca", cualAbsorbe([vieja], entra(), FINALES).lead, null);

  // Sin `es_final` de la base, la ganada ya no se reconoce por el estado —pero
  // sigue estando cerrada si tiene plata. Es a propósito: si la consulta del
  // catálogo falla, el peor caso es juntar de más, no abrir duplicados.
  es("sin catálogo, el estado no alcanza", estaCerrada(ganada, NINGUNO), false);
}

console.log("\n── entre varios, el que corresponde ──");
{
  const sinPrograma = lead({ id: 1, codigo: "CRM-0100", fecha_registro: "2026-01-01" });
  const panaderia = lead({ id: 2, codigo: "CRM-0200", producto_id: 3, fecha_registro: "2026-02-01" });

  // El que coincide de programa gana sobre el que no tiene ninguno, aunque el
  // otro sea más viejo o más nuevo.
  es(
    "gana el del mismo programa",
    cualAbsorbe([sinPrograma, panaderia], entra({ producto_id: 3 }), FINALES).lead?.codigo,
    "CRM-0200",
  );

  // Entre iguales, el más nuevo: es el que se está trabajando.
  const a = lead({ id: 1, codigo: "CRM-0100", fecha_registro: "2026-01-01" });
  const b = lead({ id: 2, codigo: "CRM-0200", fecha_registro: "2026-08-01" });
  es(
    "entre iguales, el más nuevo",
    cualAbsorbe([a, b], entra(), FINALES).lead?.codigo,
    "CRM-0200",
  );

  // Y las cerradas no compiten aunque sean las más nuevas.
  const cerradaNueva = lead({ id: 3, codigo: "CRM-0300", fecha_registro: "2026-08-30", estado_id: PERDIDO });
  es(
    "la cerrada no compite",
    cualAbsorbe([a, cerradaNueva], entra(), FINALES).lead?.codigo,
    "CRM-0100",
  );
}

console.log("\n── COMPLETAR NUNCA BORRA ──");
{
  const guardado = lead({ vendedor_id: 4, valor_oportunidad: 1500 });
  const nuevo = entra({ vendedor_id: 9, valor_oportunidad: 2000, canal_id: 2 });

  const p = planificarLead(guardado, nuevo);

  es("el hueco se llena", p.parche.canal_id, 2);
  es("Y LO OCUPADO NO SE PISA", p.parche.vendedor_id, undefined);
  es("ni el monto", p.parche.valor_oportunidad, undefined);
  es(
    "los dos choques se cuentan",
    p.choques.map((c) => c.campo).sort(),
    ["valor_oportunidad", "vendedor_id"],
  );
  es(
    "diciendo qué quedó y qué no",
    p.choques.find((c) => c.campo === "vendedor_id"),
    { campo: "vendedor_id", actual: "4", entrante: "9" },
  );
}

console.log("\n── el mismo dato escrito distinto no es un choque ──");
{
  // «1500» y «1500.00» son el mismo monto. Contarlo como conflicto mandaría a
  // una persona a resolver algo que no existe.
  const p = planificarLead(lead({ valor_oportunidad: 1500 }), entra({ valor_oportunidad: "1500.00" }));
  es("el monto no choca", p.choques, []);

  const t = planificarLead(
    lead({ descuento_promocion: "Beca 20%" }),
    entra({ descuento_promocion: "  beca 20%  " }),
  );
  es("ni el texto con otro espaciado", t.choques, []);
}

console.log("\n── LA FECHA DE REGISTRO SE VA PARA ATRÁS ──");
{
  /*
   * El lead empezó cuando empezó. Volver a cargarlo hoy no lo hace de hoy: si
   * se quedara la nueva, un lead de agosto pasaría a contar en septiembre y los
   * informes por mes cambiarían solos.
   */
  const p = planificarLead(lead({ fecha_registro: "2026-08-10" }), entra({ fecha_registro: "2026-09-01" }));
  es("una carga posterior no mueve la fecha", p.parche.fecha_registro, undefined);
  es("y no cuenta como conflicto", p.choques, []);

  const q = planificarLead(lead({ fecha_registro: "2026-09-01" }), entra({ fecha_registro: "2026-08-10" }));
  es("PERO UNA ANTERIOR SÍ LA CORRIGE", q.parche.fecha_registro, "2026-08-10");
}

console.log("\n── LA ETAPA NO RETROCEDE ──");
{
  const orden = new Map([[1, 1], [2, 2], [3, 3]]);

  // Un formulario entra siempre en la primera etapa. Si el lead ya va por
  // Propuesta, aplicarlo sería perder el trabajo hecho.
  const atras = planificarLead(lead({ etapa_id: 3 }), entra({ etapa_id: 1 }), { ordenDeEtapa: orden });
  es("no vuelve al principio", atras.parche.etapa_id, undefined);
  // Y tampoco molesta con un aviso: pasaría en casi toda unificación.
  es("y no llena la pantalla de avisos", atras.choques, []);

  const adelante = planificarLead(lead({ etapa_id: 1 }), entra({ etapa_id: 3 }), { ordenDeEtapa: orden });
  es("PERO SÍ AVANZA", adelante.parche.etapa_id, 3);

  // Sin el orden no se sabe cuál va más adelante: se conserva. No retroceder
  // importa más que avanzar.
  const aCiegas = planificarLead(lead({ etapa_id: 3 }), entra({ etapa_id: 1 }));
  es("sin el orden, se conserva", aCiegas.parche.etapa_id, undefined);

  // Un lead sin etapa recibe la que venga, con orden o sin él.
  const vacia = planificarLead(lead(), entra({ etapa_id: 2 }));
  es("y el que no tiene etapa la recibe", vacia.parche.etapa_id, 2);
}

console.log("\n── los choques se leen en castellano ──");
{
  /*
   * Un aviso que dijera «producto_id: quedó 3; no se guardó 7» no le sirve a
   * nadie. La pantalla pasa el traductor y salen los nombres.
   */
  const p = planificarLead(lead({ producto_id: 3 }), entra({ producto_id: 7, vendedor_id: 9 }), {
    comoSeLee: (campo, v) =>
      campo === "producto_id" ? { 3: "Panadería", 7: "Pastelería" }[v] : String(v),
  });
  es(
    "con el nombre del programa",
    p.choques.find((c) => c.campo === "producto_id"),
    { campo: "producto_id", actual: "Panadería", entrante: "Pastelería" },
  );
  es("y el hueco se llenó igual", p.parche.vendedor_id, 9);
}

console.log("\n── y se puede contar qué se completó ──");
{
  es("uno solo", listarCamposDeLead(["producto_id"]), "Programa");
  es("dos", listarCamposDeLead(["producto_id", "vendedor_id"]), "Programa y Asesor");
  es(
    "tres",
    listarCamposDeLead(["producto_id", "vendedor_id", "canal_id"]),
    "Programa, Asesor y Canal",
  );
  es("ninguno", listarCamposDeLead([]), "");

  // Cada campo que se puede completar tiene que tener nombre, o el aviso
  // saldría con un hueco.
  const p = planificarLead(
    lead(),
    entra({
      vendedor_id: 1, producto_id: 2, territorio_id: 3, canal_id: 4,
      etapa_id: 5, estado_id: 6, fecha_cierre: "2026-12-01",
      valor_oportunidad: 100, descuento_promocion: "Beca",
    }),
  );
  es(
    "todos los campos tienen nombre",
    p.completados.every((c) => typeof ETIQUETA_LEAD[c] === "string"),
    true,
  );
  console.log(`   (se completan ${p.completados.length} campos de una vez)`);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
