import type { Oportunidad } from "@/lib/types";

/**
 * Ordenar la tabla de clientes por cualquiera de sus columnas.
 *
 * Vive acá y no dentro de la pantalla porque las reglas tienen más matices de
 * los que parece —los acentos, los vacíos, los números escritos como texto— y
 * cada una se puede equivocar sola. Siendo una función pura se comprueba sin
 * levantar nada.
 */

/** Las columnas por las que se puede ordenar. */
export type Columna =
  | "codigo"
  | "fechaRegistro"
  | "cliente"
  | "producto"
  | "vendedor"
  | "etapa"
  | "estado"
  | "valor"
  | "cerrada";

export interface Orden {
  columna: Columna;
  /** Ascendente: A→Z, más viejo primero, más barato primero. */
  asc: boolean;
}

/**
 * Comparación de texto en español.
 *
 * `localeCompare` con «es» pone la ñ donde va y trata «Ángela» junto a
 * «Angela» en vez de mandarla al final, que es lo que hace comparar por código
 * de carácter. `numeric` hace que CRM-9 vaya antes que CRM-10, que si no
 * quedarían al revés por comparar el «1» con el «9».
 */
const comparador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/**
 * Qué columnas son números y cuáles texto.
 *
 * Las fechas van como texto a propósito: se guardan en formato ISO, donde el
 * orden alfabético y el cronológico son el mismo.
 */
const NUMERICAS = new Set<Columna>(["valor", "cerrada"]);

/**
 * Ordena una copia; nunca toca la lista que recibe.
 *
 * Los vacíos van al final en los dos sentidos. Es deliberado: al ordenar por
 * valor lo que se busca es «las más grandes» o «las más chicas», y en los dos
 * casos las que no tienen monto son ruido que estorba arriba.
 */
export function ordenar(filas: readonly Oportunidad[], orden: Orden | null): Oportunidad[] {
  if (!orden) return [...filas];

  const { columna, asc } = orden;
  const signo = asc ? 1 : -1;

  return [...filas].sort((a, b) => {
    const x = a[columna];
    const y = b[columna];

    const xVacio = x == null || x === "" || x === "—";
    const yVacio = y == null || y === "" || y === "—";
    if (xVacio && yVacio) return desempate(a, b);
    if (xVacio) return 1;
    if (yVacio) return -1;

    const cmp = NUMERICAS.has(columna)
      ? Number(x) - Number(y)
      : comparador.compare(String(x), String(y));

    return cmp !== 0 ? cmp * signo : desempate(a, b);
  });
}

/**
 * El desempate, para que el orden no baile.
 *
 * Sin esto, dos fichas con el mismo vendedor pueden intercambiarse de lugar
 * entre un dibujado y el siguiente, y una lista que se mueve sola mientras se
 * la lee es peor que una mal ordenada. El id es único y estable, así que
 * alcanza.
 */
const desempate = (a: Oportunidad, b: Oportunidad): number => b.id - a.id;

/**
 * Qué pasa al hacer clic en un encabezado.
 *
 * Primer clic ordena; el segundo sobre la misma columna da vuelta el sentido;
 * el tercero suelta el orden y vuelve al de siempre. Ese tercer paso importa:
 * sin él no hay forma de volver a «lo más reciente primero» sin recargar.
 */
export function siguienteOrden(actual: Orden | null, columna: Columna): Orden | null {
  if (actual?.columna !== columna) {
    // Los textos arrancan de la A; las fechas y los montos, de lo más grande,
    // que es lo que se busca al ordenar por ellos.
    return { columna, asc: !esDeMayorAMenor(columna) };
  }
  if (actual.asc !== esDeMayorAMenor(columna)) return { columna, asc: !actual.asc };
  return null;
}

const esDeMayorAMenor = (c: Columna): boolean =>
  c === "fechaRegistro" || c === "valor" || c === "cerrada";
