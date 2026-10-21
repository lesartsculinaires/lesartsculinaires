/**
 * El nombre de la galleta del idioma, en un archivo sin «use client».
 *
 * Lo leen el servidor (el layout) y el navegador (el selector). Un valor
 * exportado desde un componente de cliente no le llega entero a un componente
 * de servidor —le llega una referencia—, y la galleta nunca se encontraba.
 */
export type Idioma = "es" | "en";

export const GALLETA_IDIOMA = "lac.idioma";
