/**
 * Los colores de las series de los gráficos apilados.
 *
 * ============================================================================
 * ESTOS SEIS NO SE ELIGIERON A OJO
 * ============================================================================
 *
 * Son una paleta categórica validada, y se puede volver a comprobar:
 *
 *     node scripts/validate_palette.js \
 *       "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300" \
 *       --mode light --surface "#FFFFFF"
 *
 * Contra el blanco del CRM pasa las cuatro comprobaciones duras: banda de
 * luminosidad, piso de croma, separación para quien no distingue colores
 * —el peor par contiguo da ΔE 9.1, sobre el mínimo de 8— y el piso de visión
 * normal —19.6, sobre el mínimo de 15—.
 *
 * ============================================================================
 * POR QUÉ SON SEIS Y NO LOS QUE HAGAN FALTA
 * ============================================================================
 *
 * Porque la separación se mide entre colores CONTIGUOS de la pila. Agregar un
 * séptimo tono obliga a inventarlo, y dos colores que no se distinguen
 * convierten un gráfico en una mancha de la que no se puede sacar nada. Lo que
 * pasa de seis se junta en «Otros», que sigue contando.
 *
 * Y el orden es fijo: el canal más grande del histórico se queda con el primero
 * mientras exista. Nunca se recicla un color ni se reparte por ranking del mes.
 *
 * ============================================================================
 * EL AVISO DE CONTRASTE, Y QUÉ SE HACE CON ÉL
 * ============================================================================
 *
 * Tres de los seis quedan por debajo de 3:1 contra el blanco. Eso NO los
 * descalifica —son rellenos, no texto— pero obliga a lo que el método llama
 * relieve: que la identidad de cada serie nunca dependa sólo del color. Por eso
 * la pantalla trae, siempre, leyenda con el nombre escrito, el detalle del día
 * con sus números, y una vista de tabla. Quitar cualquiera de las tres deja el
 * gráfico apoyado nada más que en el color.
 */

/** La paleta, en orden fijo. El índice es la identidad de la serie. */
export const COLORES_DE_SERIE = [
  "#2a78d6", // azul
  "#eb6834", // naranja
  "#1baf7a", // agua
  "#eda100", // amarillo
  "#e87ba4", // magenta
  "#008300", // verde
] as const;

/**
 * El gris de «Otros» y de los cajones de sastre.
 *
 * A propósito fuera de la paleta: «Otros» no es una categoría de la escuela
 * sino lo que sobró, y darle un color de serie lo haría competir visualmente
 * con canales que sí existen.
 */
export const COLOR_RESTO = "#8792AC";

/** Los nombres que no son una categoría de verdad y van en gris. */
const SON_RESTO = new Set(["Otros", "Sin canal", "Sin programa"]);

/**
 * El color de una serie por su posición en el orden fijo.
 *
 * Si alguna vez se pidieran más colores que los que hay, se devuelve el gris en
 * vez de dar la vuelta a la paleta: repetir un tono haría que dos series
 * distintas se vieran iguales, que es peor que verse neutras.
 */
export function colorDeSerie(etiqueta: string, orden: readonly string[]): string {
  if (SON_RESTO.has(etiqueta)) return COLOR_RESTO;
  const i = orden.indexOf(etiqueta);
  if (i < 0 || i >= COLORES_DE_SERIE.length) return COLOR_RESTO;
  return COLORES_DE_SERIE[i];
}
