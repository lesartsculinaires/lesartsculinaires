/**
 * Qué datos necesita cada pantalla, para no pedir los de las otras catorce.
 *
 * ============================================================================
 * LO QUE SE PAGABA EN CADA DIBUJADO
 * ============================================================================
 *
 * La portada cargaba TODO antes de pintar nada: el embudo entero, la bandeja
 * con sus mensajes, los envíos con sus destinatarios, los formularios con sus
 * preguntas y sus respuestas, las plantillas, las bases, las etiquetas. Unas
 * veinticinco consultas, las necesitara o no la pantalla que se iba a ver.
 *
 * Y eso no pasa una vez al entrar. Pasa en cada vuelta del refresco
 * automático, con cada aviso del websocket, y al final de CADA acción del
 * servidor —porque todas terminan en `revalidatePath("/")`, que vuelve a
 * armar la portada entera—.
 *
 * Medido en producción el 8 de octubre de 2026: la base atendió 14.000
 * peticiones en una hora con cuatro personas trabajando. A las 14:00 contestó
 * esas mismas 14.000 con un p95 de 489 ms; a las 18:00, con 4.365 ms. No era
 * el volumen: era una máquina quedándose sin aire, alimentada por un montón de
 * consultas que nadie iba a mirar.
 *
 * Quien está en el Dashboard no necesita la bandeja. Quien está en la bandeja
 * no necesita los formularios de feria. Acá está escrito quién necesita qué, y
 * lo que no está escrito no se pide.
 *
 * ============================================================================
 * POR QUÉ ESTA REGLA VIVE SOLA, EN UN ARCHIVO SIN PANTALLA
 * ============================================================================
 *
 * Porque la leen los dos lados y tienen que decir exactamente lo mismo. El
 * servidor la usa para mandar, en el primer dibujado, lo que la pantalla
 * inicial va a necesitar; el navegador la usa para pedir lo que falte cuando
 * se cambia de pantalla. Si las dos mitades se desincronizan, el síntoma es
 * una pantalla que parpadea «Cargando…» con los datos ya en la mano, o peor,
 * una que se dibuja vacía y parece decir que no hay nada.
 *
 * Y porque así se puede probar sin levantar medio CRM, que es lo que hace
 * `supabase/pruebas/datosDelModulo.test.mjs`.
 */

/**
 * Los montones de datos que se piden aparte.
 *
 * NO están acá los que hacen falta siempre —quién sos, el catálogo, las
 * oportunidades, los accesos—: ésos los manda el servidor en cada dibujado
 * porque los usa la barra, el encabezado o el reloj de recordatorios, que están
 * a la vista en todas las pantallas.
 */
export const CONJUNTOS = [
  /** Conversaciones y mensajes de la bandeja. El más caro de todos. */
  "bandeja",
  /** El catálogo de etiquetas de leads. */
  "etiquetas",
  /** Plantillas de WhatsApp y cuándo se sincronizaron. */
  "plantillas",
  /** Las bases subidas, para filtrar por tanda. */
  "bases",
  /** Formularios de feria, con sus preguntas y respuestas. */
  "formularios",
  /** Envíos masivos, con sus destinatarios ya contados. */
  "envios",
] as const;

export type Conjunto = (typeof CONJUNTOS)[number];

const ES_CONJUNTO = new Set<string>(CONJUNTOS);

/** ¿Es uno de los nombres que conocemos? Lo usa el servidor para no fiarse. */
export function esConjunto(x: unknown): x is Conjunto {
  return typeof x === "string" && ES_CONJUNTO.has(x);
}

/**
 * Qué necesita cada pantalla.
 *
 * Lo que no aparece acá no necesita nada de lo que se pide aparte: el
 * Dashboard, el Calendario, Equipos, Programas, Fríos, Recordatorios,
 * Notificaciones, Autorizaciones, Canales y Usuarios y Roles se dibujan con lo
 * que ya viene siempre, o se cargan solos desde adentro.
 */
const POR_PANTALLA: Readonly<Record<string, readonly Conjunto[]>> = {
  // La bandeja necesita las tres: los hilos, las etiquetas que se les ponen y
  // las plantillas para responder fuera de las 24 horas.
  Inbox: ["bandeja", "etiquetas", "plantillas"],
  // Clientes filtra por tanda subida y ofrece plantillas desde la ficha.
  Clientes: ["bases", "etiquetas", "plantillas"],
  Bases: ["bases"],
  // El embudo también filtra por tanda.
  Pipeline: ["bases"],
  Plantillas: ["plantillas"],
  Formularios: ["formularios"],
  "Envíos": ["envios"],
};

/**
 * Todo lo que hay que tener para dibujar esta pantalla.
 *
 * `fichaAbierta` no es un detalle: la ficha del cliente se abre ENCIMA de
 * cualquier pantalla —del embudo, de Fríos, de la bandeja— y dibuja las
 * etiquetas del lead. Sin esto, abrir una ficha desde el Pipeline mostraría un
 * lead sin ninguna etiqueta, que se lee como que no tiene, no como que no se
 * cargaron.
 *
 * Devuelve la lista ordenada a propósito: así dos llamadas con lo mismo dan el
 * mismo texto al unirlas, y el navegador puede comparar con `===` en vez de
 * volver a pedir en cada dibujado.
 */
export function queSeNecesita(mod: string, fichaAbierta = false): Conjunto[] {
  const suyos = POR_PANTALLA[mod] ?? [];
  const todos = fichaAbierta ? [...suyos, "etiquetas" as const] : suyos;
  return [...new Set(todos)].sort();
}

/**
 * De lo que hace falta, qué falta de verdad.
 *
 * `tiene` es lo que ya está en la mano y sigue fresco. Se devuelve ordenado y
 * sin repetidos por lo mismo que arriba.
 */
export function queFalta(
  necesarios: readonly Conjunto[],
  tiene: Iterable<Conjunto>,
): Conjunto[] {
  const hay = new Set(tiene);
  return necesarios.filter((c) => !hay.has(c)).sort();
}
