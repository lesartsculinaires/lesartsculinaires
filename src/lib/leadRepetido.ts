/**
 * Cuándo un lead que entra ES un lead que ya está, y qué hacer con él.
 *
 * ============================================================================
 * EL PROBLEMA QUE ESTO ARREGLA
 * ============================================================================
 *
 * Unificar juntaba la ficha de la persona pero abría igual una oportunidad
 * nueva. O sea: se apretaba «Unificar con este contacto», quedaba UNA ficha
 * —eso funcionaba— y DOS leads colgando de ella. En la pantalla de Clientes,
 * que lista oportunidades, eso se ve exactamente igual que un duplicado,
 * porque es un duplicado: CRM-2625 y CRM-2626, la misma persona, el mismo día,
 * los dos sin programa y sin asesor.
 *
 * Lo que se pidió es que sea uno solo: lo que se repite se junta, lo que viene
 * de más se agrega.
 *
 * ============================================================================
 * PERO NO SIEMPRE ES UNO SOLO
 * ============================================================================
 *
 * Que una persona tenga varias oportunidades no es un error del esquema: es el
 * esquema. Alguien que hizo Panadería en marzo y pregunta por Pastelería en
 * septiembre tiene dos tratos, con dos montos y dos asesores posibles, y
 * meterlos en la misma fila perdería uno de los dos.
 *
 * Así que la pregunta no es «¿ya existe esta persona?» —eso lo contesta
 * `duplicados.ts`— sino «¿este lead es el mismo trato que uno que ya tiene?».
 * Dos reglas la contestan:
 *
 *   UNA CERRADA NO SE TOCA          Ganado o Perdido, o con plata anotada, es
 *                                   historia. Escribirle encima cambiaría lo
 *                                   que ya pasó, y de paso movería las cuentas
 *                                   del mes que ya se cerró. Quien vuelve
 *                                   después de cerrar abre un trato nuevo.
 *
 *   OTRO PROGRAMA ES OTRO TRATO     Si los dos dicen programa y no es el
 *                                   mismo, son dos. Si el que entra no trae
 *                                   programa —el caso de Yolanda, y el más
 *                                   común: un formulario sin ese campo— no
 *                                   contradice nada y se suma al que hay.
 *
 * ============================================================================
 * Y CUANDO SÍ ES EL MISMO, NO SE PISA NADA
 * ============================================================================
 *
 * Misma regla que en `fusion.ts`, que es la de la casa: completar nunca borra.
 * Los huecos se llenan con lo que trae el lead nuevo; lo que ya tenía un valor
 * distinto se conserva y se muestra, para que lo decida una persona.
 *
 * Con dos excepciones, las dos porque «conservar» ahí sería peor:
 *
 *   LA FECHA DE REGISTRO SE VA      Se queda la más vieja. El lead empezó
 *   PARA ATRÁS                      cuando empezó; volver a cargarlo hoy no lo
 *                                   hace de hoy, y si se quedara la nueva los
 *                                   informes por mes moverían un lead de
 *                                   agosto a septiembre.
 *
 *   LA ETAPA NO RETROCEDE           Un formulario entra siempre en la primera
 *                                   etapa. Si el lead que ya está va por
 *                                   Propuesta, tratarlo como un choque llenaría
 *                                   la pantalla de avisos en cada unificación;
 *                                   y aplicarlo lo devolvería al principio,
 *                                   que es perder trabajo hecho. Se queda la
 *                                   más avanzada, sin avisar: una etapa sólo
 *                                   sube.
 */

import type { CampoFusion, Choque } from "@/lib/fusion";

/** Una oportunidad ya guardada, con lo justo para decidir sobre ella. */
export interface LeadExistente {
  id: number;
  codigo: string | null;
  vendedor_id: number | null;
  producto_id: number | null;
  territorio_id: number | null;
  canal_id: number | null;
  etapa_id: number | null;
  estado_id: number | null;
  fecha_registro: string;
  fecha_cierre: string | null;
  valor_oportunidad: number | null;
  venta_cerrada: number | null;
  descuento_promocion: string | null;
  /**
   * Todos los programas por los que preguntó, `producto_id` incluido.
   *
   * Es lo que deja que una base nueva que trae a la misma persona por un
   * programa que ya consultó caiga sobre el lead que tiene, en vez de abrirle
   * otro. Opcional: quien no lo pase se comporta como antes, mirando sólo el
   * programa principal.
   */
  programas?: readonly number[];
}

/** Lo que trae el lead que entra. Las claves son nombres de columna. */
export interface LeadEntrante {
  vendedor_id: number | null;
  producto_id: number | null;
  territorio_id: number | null;
  canal_id: number | null;
  etapa_id: number | null;
  estado_id: number | null;
  fecha_registro: string;
  fecha_cierre: string | null;
  valor_oportunidad: number | null;
  descuento_promocion: string | null;
}

/** Los campos de la oportunidad que se pueden completar al juntar. */
export type CampoLead =
  | "vendedor_id"
  | "producto_id"
  | "territorio_id"
  | "canal_id"
  | "etapa_id"
  | "estado_id"
  | "fecha_registro"
  | "fecha_cierre"
  | "valor_oportunidad"
  | "descuento_promocion";

/**
 * Cómo se llama cada campo en la pantalla.
 *
 * Aparte de `ETIQUETA_CAMPO` de `fusion.ts` porque son otras columnas: aquéllas
 * son de la persona, éstas del trato. Comparten el tipo `Choque` para que la
 * pantalla pueda mostrar las dos listas con el mismo componente.
 */
export const ETIQUETA_LEAD: Record<CampoLead, string> = {
  vendedor_id: "Asesor",
  producto_id: "Programa",
  territorio_id: "Territorio",
  canal_id: "Canal",
  etapa_id: "Etapa",
  estado_id: "Estado",
  fecha_registro: "Fecha de registro",
  fecha_cierre: "Fecha de cierre",
  valor_oportunidad: "Valor de la oportunidad",
  descuento_promocion: "Descuento o promoción",
};

/** Qué se intenta completar, en orden, y con la regla de llenar el hueco. */
const CAMPOS_SIMPLES: readonly CampoLead[] = [
  "vendedor_id",
  "producto_id",
  "territorio_id",
  "canal_id",
  "estado_id",
  "fecha_cierre",
  "valor_oportunidad",
  "descuento_promocion",
];

/** Las columnas que hay que leer de una oportunidad para poder juntarla. */
export const COLUMNAS_DE_LEAD = [
  "id",
  "codigo",
  "venta_cerrada",
  "vendedor_id",
  "producto_id",
  "territorio_id",
  "canal_id",
  "etapa_id",
  "estado_id",
  "fecha_registro",
  "fecha_cierre",
  "valor_oportunidad",
  "descuento_promocion",
].join(", ");

const vacio = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "");

/**
 * ¿Esta oportunidad está terminada?
 *
 * Dos formas de estarlo, y hacen falta las dos. El estado la cierra cuando
 * alguien lo puso en Ganado o Perdido —`estados.es_final`—, pero hay fichas
 * viejas del Excel con la venta anotada y el estado en blanco, y ésas también
 * son historia: si `venta_cerrada` tiene plata, el trato pasó.
 */
export const estaCerrada = (
  lead: LeadExistente,
  estadosFinales: ReadonlySet<number>,
): boolean =>
  (lead.venta_cerrada ?? 0) > 0 ||
  (lead.estado_id != null && estadosFinales.has(lead.estado_id));

/** Por qué un lead no se pudo juntar con ninguno de los que ya estaban. */
export type PorQueNoSeJunta = "todas_cerradas" | "otro_programa";

export interface Absorbente {
  /** El lead que se queda con todo. Null si hay que crear uno nuevo. */
  lead: LeadExistente | null;
  /** Cuando `lead` es null, por qué. Null si el contacto no tenía ninguno. */
  porQueNo: PorQueNoSeJunta | null;
}

/**
 * Cuál de los leads que ya tiene el contacto se queda con éste.
 *
 * Devuelve también el motivo cuando no hay ninguno, porque la pantalla tiene
 * que poder decir «se creó un lead aparte porque el que tenía es de otro
 * programa» en vez de crear uno en silencio, que es justo lo que se veía como
 * duplicado.
 */
export function cualAbsorbe(
  existentes: readonly LeadExistente[],
  entrante: LeadEntrante,
  estadosFinales: ReadonlySet<number>,
): Absorbente {
  if (existentes.length === 0) return { lead: null, porQueNo: null };

  const abiertas = existentes.filter((l) => !estaCerrada(l, estadosFinales));
  if (abiertas.length === 0) return { lead: null, porQueNo: "todas_cerradas" };

  /*
   * Todos los programas por los que preguntó ese lead, no sólo el que se le
   * está vendiendo.
   *
   * Es lo que hace que preguntar por varios programas deje UN lead. Alguien
   * que consultó Pastelería y Barismo tiene los dos anotados; cuando entra una
   * base que la trae por Barismo, cae sobre ese lead en vez de abrirle otro.
   *
   * Sin la lista se usa el principal, que es como se comportaba antes de que
   * existiera: los leads viejos siguen funcionando igual.
   */
  const preguntoPor = (l: LeadExistente): (number | null)[] =>
    l.programas && l.programas.length > 0 ? [...l.programas] : [l.producto_id];

  /*
   * Un lead sin programa no contradice a ninguno: se suma al que haya. Es el
   * caso más común de todos —los formularios de Meta no preguntan el programa—
   * y es exactamente el de Yolanda.
   */
  const compatibles =
    entrante.producto_id == null
      ? abiertas
      : abiertas.filter((l) =>
          preguntoPor(l).some((p) => p == null || p === entrante.producto_id),
        );

  if (compatibles.length === 0) return { lead: null, porQueNo: "otro_programa" };

  /*
   * El que coincide exactamente de programa gana sobre el que no tiene
   * ninguno: si la persona ya tiene un lead de Panadería y otro sin programa,
   * y entra uno de Panadería, va al de Panadería.
   *
   * Entre iguales, el más nuevo: es el que se está trabajando.
   */
  const puntaje = (l: LeadExistente): number =>
    entrante.producto_id != null && preguntoPor(l).includes(entrante.producto_id) ? 1 : 0;

  const elegido = [...compatibles].sort(
    (a, b) =>
      puntaje(b) - puntaje(a) ||
      b.fecha_registro.localeCompare(a.fecha_registro) ||
      b.id - a.id,
  )[0];

  return { lead: elegido, porQueNo: null };
}

export interface PlanLead {
  /** Columnas a escribir sobre el lead que absorbe. Vacío = no cambia nada. */
  parche: Partial<Record<CampoLead, unknown>>;
  /** Campos que estaban vacíos y se llenaron. */
  completados: CampoLead[];
  /** Datos distintos que se conservaron como estaban. */
  choques: Choque[];
}

/**
 * Qué habría que escribirle al lead que absorbe.
 *
 * `comoSeLee` traduce un id a lo que se ve en la pantalla —12 → «Panadería»—
 * para que el aviso de choque diga «Programa: quedó Panadería; no se guardó
 * Pastelería» y no dos números que no significan nada. Sin él se muestran los
 * ids, que es feo pero no miente.
 */
export function planificarLead(
  // `LeadEntrante` y no `LeadExistente`: tiene los diez campos que se juntan, y
  // así esto sirve para las dos cosas que hay que juntar. Un lead guardado
  // encaja igual —tiene esos campos y algunos más—, y además se puede fundir
  // una fila de un archivo con otra, que es el mismo problema del lado de la
  // importación: la misma persona dos veces en la misma planilla.
  existente: LeadEntrante,
  entrante: LeadEntrante,
  opciones: {
    /** Orden de cada etapa, para saber cuál va más adelante. */
    ordenDeEtapa?: ReadonlyMap<number, number>;
    comoSeLee?: (campo: CampoLead, valor: unknown) => string;
  } = {},
): PlanLead {
  const parche: Partial<Record<CampoLead, unknown>> = {};
  const completados: CampoLead[] = [];
  const choques: Choque[] = [];
  const leer =
    opciones.comoSeLee ?? ((_c: CampoLead, v: unknown) => String(v));

  for (const campo of CAMPOS_SIMPLES) {
    const nuevo = entrante[campo];
    if (vacio(nuevo)) continue;

    const actual = existente[campo];
    if (vacio(actual)) {
      parche[campo] = nuevo;
      completados.push(campo);
      continue;
    }

    // Los montos se comparan como números: «1500» y «1500.00» son el mismo
    // dato escrito distinto y no un conflicto que haya que ir a resolver.
    const iguales =
      campo === "valor_oportunidad"
        ? Number(actual) === Number(nuevo)
        : typeof actual === "string" || typeof nuevo === "string"
          ? String(actual).trim().toLowerCase() === String(nuevo).trim().toLowerCase()
          : actual === nuevo;

    if (iguales) continue;

    choques.push({
      // `Choque` habla de campos del cliente; acá son del lead. Se comparte la
      // forma para poder dibujar las dos listas igual, y la etiqueta la pone
      // quien muestra, con `ETIQUETA_LEAD`.
      campo: campo as unknown as CampoFusion,
      actual: leer(campo, actual),
      entrante: leer(campo, nuevo),
    });
  }

  // La fecha de registro se va para atrás, nunca para adelante.
  if (entrante.fecha_registro && entrante.fecha_registro < existente.fecha_registro) {
    parche.fecha_registro = entrante.fecha_registro;
    completados.push("fecha_registro");
  }

  // La etapa sólo sube. Sin el orden no se puede saber cuál va más adelante,
  // así que se conserva la que está: no retroceder importa más que avanzar.
  if (entrante.etapa_id != null && entrante.etapa_id !== existente.etapa_id) {
    if (existente.etapa_id == null) {
      parche.etapa_id = entrante.etapa_id;
      completados.push("etapa_id");
    } else if (opciones.ordenDeEtapa) {
      const antes = opciones.ordenDeEtapa.get(existente.etapa_id) ?? 0;
      const ahora = opciones.ordenDeEtapa.get(entrante.etapa_id) ?? 0;
      if (ahora > antes) {
        parche.etapa_id = entrante.etapa_id;
        completados.push("etapa_id");
      }
    }
  }

  return { parche, completados, choques };
}

/**
 * Varias filas del mismo lead, fundidas en una.
 *
 * Es el caso de la importación: la misma persona aparece dos veces en la
 * planilla y hasta ahora eso creaba dos oportunidades. Se aplican las mismas
 * reglas que al juntar con un lead guardado —la primera manda, las siguientes
 * llenan huecos, la fecha se va para atrás— y lo que llegó distinto sale en
 * `choques` para poder anotarlo en la bitácora en vez de perderlo.
 */
export function fundirEntrantes(
  filas: readonly LeadEntrante[],
  opciones: {
    ordenDeEtapa?: ReadonlyMap<number, number>;
    comoSeLee?: (campo: CampoLead, valor: unknown) => string;
  } = {},
): { valores: LeadEntrante; choques: Choque[] } {
  if (filas.length === 0) throw new Error("fundirEntrantes sin filas");

  let valores: LeadEntrante = { ...filas[0] };
  const choques: Choque[] = [];

  for (const fila of filas.slice(1)) {
    const p = planificarLead(valores, fila, opciones);
    valores = { ...valores, ...(p.parche as Partial<LeadEntrante>) };
    choques.push(...p.choques);
  }

  return { valores, choques };
}

/** "Asesor y Programa" — para contar qué se completó. */
export function listarCamposDeLead(campos: readonly CampoLead[]): string {
  const n = campos.map((c) => ETIQUETA_LEAD[c]);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
