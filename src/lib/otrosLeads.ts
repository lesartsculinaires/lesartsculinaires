/**
 * Los otros leads de la misma persona.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA MOSTRARLOS
 * ============================================================================
 *
 * Porque sin esto la pantalla de Clientes miente por omisión. Lista
 * oportunidades, no personas, así que alguien que preguntó por dos programas
 * ocupa dos filas —y se lee como un duplicado, aunque no lo sea—. La asesora
 * abre una de las dos, no ve nada que hable de la otra, y la única salida que
 * tiene es sospechar.
 *
 * Mirando la base de la escuela, esas «dos filas» son casi siempre lo
 * contrario de un error:
 *
 *   Silvestre Cerón   Pastelería, Perdido en julio → Suprême Diplôme, GANADO
 *                     en agosto.
 *   Karla Pereira     Pastelería, Perdido en junio → Bollería, Activo en julio.
 *   Irma Doris García Barismo, Perdido en junio → Pastelería, Activo en julio.
 *
 * Es la mejor historia comercial que tienen: se les cayó un programa y le
 * vendieron otro. Juntar esos leads borraría la venta ganada y el motivo de
 * pérdida. Así que lo que hay que arreglar no es el dato —está bien— sino que
 * se pueda ver de dónde viene la segunda fila.
 *
 * ============================================================================
 * QUÉ SE MIDIÓ ANTES DE ESCRIBIR ESTO
 * ============================================================================
 *
 * 1566 personas y 1604 leads: 34 personas con más de un lead, 17 con más de un
 * programa, 38 filas de más en total. Y la distancia máxima entre la primera y
 * la última consulta de una misma persona es de 31 días, con 7 de promedio.
 *
 * O sea que no es «volvió al año siguiente»: es la misma conversación de
 * compra, alguien comparando programas. Por eso el orden de abajo es por fecha
 * y no por programa, y por eso el aviso habla de «también preguntó por» y no
 * de historial.
 */

import type { Oportunidad } from "@/lib/types";

/** Un lead hermano, con lo justo para decidir si hay que ir a mirarlo. */
export interface OtroLead {
  id: number;
  codigo: string;
  /** Nombre del programa, o null cuando el lead no lo tiene cargado. */
  programa: string | null;
  etapa: string | null;
  estado: string | null;
  fechaRegistro: string;
  valor: number | null;
  vendedor: string | null;
  /**
   * El trato terminó: Ganado o Perdido.
   *
   * Se marca aparte porque cambia lo que significa la fila. Un lead cerrado no
   * es competencia del que se está mirando: es historia de esa persona, y
   * saberla ayuda a atenderla —«ya cursó Barismo»—. Uno abierto sí es algo que
   * alguien tiene que estar trabajando ahora.
   */
  cerrado: boolean;
}

/**
 * Un valor que la pantalla usa como «vacío» y no como nombre de verdad.
 *
 * La lista no trae nulos: donde no hay nada, trae la palabra que se muestra
 * —«Sin definir» en el programa, «Sin asignar» en la asesora, «—» en varios—.
 * Si eso pasara derecho, la ficha diría «también preguntó por Sin definir».
 */
const RELLENOS = new Set(["", "—", "-", "sin definir", "sin asignar", "sin programa"]);

const puesto = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return RELLENOS.has(s.toLowerCase()) ? null : s;
};

/**
 * Los demás leads de la persona del lead que se está mirando.
 *
 * Sale de la lista que la pantalla ya tiene cargada, sin pedirle nada al
 * servidor: `Oportunidad` trae el nombre del programa y del estado resueltos,
 * así que no hace falta ni el catálogo.
 *
 * Ordena del más nuevo al más viejo. Lo que interesa primero es lo último que
 * pasó con esa persona —«se le cayó Pastelería y compró Suprême»— y eso se lee
 * de arriba abajo.
 */
export function otrosLeadsDe(
  lead: Pick<Oportunidad, "id" | "clienteId">,
  todas: readonly Oportunidad[],
): OtroLead[] {
  return todas
    .filter((o) => o.clienteId === lead.clienteId && o.id !== lead.id)
    .map((o) => ({
      id: o.id,
      codigo: o.codigo,
      programa: puesto(o.producto),
      etapa: puesto(o.etapa),
      estado: puesto(o.estado),
      fechaRegistro: o.fechaRegistro,
      valor: o.valor ?? null,
      vendedor: puesto(o.vendedor),
      cerrado: o.estado === "Ganado" || o.estado === "Perdido",
    }))
    .sort(
      (a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id,
    );
}

/**
 * Cuántos leads tiene cada persona, para poder decir «1 de 2» en la lista.
 *
 * Se calcula una vez sobre la lista entera en vez de contar por fila: en una
 * tabla de mil y pico de filas, preguntar por cada una cuántas hermanas tiene
 * es recorrer la lista mil veces.
 */
export function cuantosPorCliente(
  todas: readonly Oportunidad[],
): Map<number, number> {
  const m = new Map<number, number>();
  for (const o of todas) m.set(o.clienteId, (m.get(o.clienteId) ?? 0) + 1);
  return m;
}

/**
 * Qué número de lead es éste dentro de los de su persona, del más viejo al más
 * nuevo.
 *
 * «1 de 2» y no sólo «2 leads» porque la posición es la que quita la sospecha:
 * dos filas seguidas que dicen «1 de 2» y «2 de 2» se leen como una persona
 * con dos consultas. Dos filas que dijeran las dos «2 leads» se seguirían
 * leyendo como un repetido.
 */
export function posicionEntreLosSuyos(
  todas: readonly Oportunidad[],
): Map<number, number> {
  const porCliente = new Map<number, Oportunidad[]>();
  for (const o of todas) {
    const suyos = porCliente.get(o.clienteId);
    if (suyos) suyos.push(o);
    else porCliente.set(o.clienteId, [o]);
  }

  const puesto = new Map<number, number>();
  for (const suyos of porCliente.values()) {
    if (suyos.length < 2) continue;
    [...suyos]
      .sort(
        (a, b) =>
          a.fechaRegistro.localeCompare(b.fechaRegistro) || a.id - b.id,
      )
      .forEach((o, i) => puesto.set(o.id, i + 1));
  }
  return puesto;
}
