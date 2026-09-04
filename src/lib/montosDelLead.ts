/**
 * Cómo se llaman en pantalla los dos montos de un lead.
 *
 * ============================================================================
 * POR QUÉ ESTO ES UN ARCHIVO Y NO UN TEXTO ESCRITO EN CADA PANTALLA
 * ============================================================================
 *
 * Porque los dos montos aparecen en nueve pantallas —la ficha, el tablero, el
 * Pipeline, Clientes, Programas, Equipos, Evolución, Bases y la importación—
 * y la escuela pidió intercambiarles el nombre. Con el texto suelto en cada
 * una, un renombre es veinte ediciones y basta que se escape una para que el
 * CRM se contradiga sobre el mismo número: la ficha diciendo una cosa y el
 * tablero otra.
 *
 * Eso no es una hipótesis. Ya pasó con las etapas: «Cierre» se renombró a
 * «Perdido» y 169 leads pasaron a leerse como perdidos de un día para el otro,
 * muchos de ellos ganados y cobrados. Un nombre que significa plata merece
 * vivir en un solo lugar.
 *
 * ============================================================================
 * LOS NOMBRES DE ESTAS CONSTANTES SON EL DE LA COLUMNA, NO EL DEL RÓTULO
 * ============================================================================
 *
 * A propósito, y es lo único importante de este archivo.
 *
 * Desde que se intercambiaron, el rótulo y la columna dicen cosas distintas:
 * la columna `venta_cerrada` se muestra como «Valor de oportunidad». Si estas
 * constantes se llamaran por el rótulo —`ROTULO_VALOR_OPORTUNIDAD = "Valor de
 * oportunidad"`— quien las use tendría que acordarse de que ese rótulo va
 * sobre la otra columna, y a la tercera pantalla alguien las cruza.
 *
 * Llamándolas por la columna, la única regla es: al lado de un dato que sale
 * de `venta_cerrada` va `ROTULO_VENTA_CERRADA`. No hay nada que recordar.
 *
 * ----------------------------------------------------------------------------
 * QUÉ NO CAMBIÓ
 * ----------------------------------------------------------------------------
 *
 * Nada de la base. Las columnas siguen llamándose y sumándose igual, los
 * disparadores siguen mirando `venta_cerrada` para saber si una venta entró, y
 * la API sigue recibiendo los mismos nombres. Esto es el idioma de la pantalla
 * y nada más.
 */

/** Rótulo de la columna `venta_cerrada`. */
export const ROTULO_VENTA_CERRADA = "Valor de oportunidad";

/** Rótulo de la columna `valor_oportunidad`. */
export const ROTULO_VALOR_OPORTUNIDAD = "Venta cerrada";

/**
 * La versión corta, para los encabezados de tabla donde no entra el nombre.
 *
 * Van aparte y no recortadas con código porque «Valor de oportunidad» y
 * «Venta cerrada» no se acortan al mismo lugar: la primera palabra de una es
 * la que la distingue y la de la otra no.
 */
export const CORTO_VENTA_CERRADA = "Valor";
export const CORTO_VALOR_OPORTUNIDAD = "Cerrada";
