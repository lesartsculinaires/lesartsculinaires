/**
 * Los países, para cuando el territorio es «Extranjero».
 *
 * ------------------------------------------------------------------------
 * POR QUÉ UNA LISTA EN EL CÓDIGO Y NO UNA TABLA
 * ------------------------------------------------------------------------
 *
 * Los países no son un catálogo de la escuela: no se dan de alta, no se dan de
 * baja y no cambian de nombre entre una feria y la otra. Una tabla obligaría a
 * sembrarla, a mantener sus políticas y a que alguien la corrigiera desde
 * Usuarios y Roles, y no habría ganado nada.
 *
 * Además el país sigue guardándose como texto en `clientes.pais`. Esta lista
 * es una ayuda para escribirlo igual siempre —«Guatemala» y no «guate»,
 * «GUATEMALA» o «Guatemala.»— pero no una traba: lo cargado antes se sigue
 * leyendo, venga de donde venga.
 *
 * ------------------------------------------------------------------------
 * EL ORDEN NO ES ALFABÉTICO Y ES A PROPÓSITO
 * ------------------------------------------------------------------------
 *
 * Primero Centroamérica y de ahí el resto de América, que es de donde viene
 * casi todo el que se inscribe desde afuera. Alfabético puro dejaría a
 * Guatemala y Honduras después de Alemania, Arabia Saudita y Argelia, y habría
 * que buscar cada vez lo que se elige todos los días.
 *
 * Dentro de cada grupo sí van alfabéticos.
 */

export interface GrupoDePaises {
  grupo: string;
  paises: readonly string[];
}

export const PAISES_POR_GRUPO: readonly GrupoDePaises[] = [
  {
    grupo: "Centroamérica y el Caribe",
    paises: [
      "Belice",
      "Costa Rica",
      "Cuba",
      "Guatemala",
      "Haití",
      "Honduras",
      "Jamaica",
      "Nicaragua",
      "Panamá",
      "Puerto Rico",
      "República Dominicana",
    ],
  },
  {
    grupo: "Norteamérica",
    paises: ["Canadá", "Estados Unidos", "México"],
  },
  {
    grupo: "Sudamérica",
    paises: [
      "Argentina",
      "Bolivia",
      "Brasil",
      "Chile",
      "Colombia",
      "Ecuador",
      "Guyana",
      "Paraguay",
      "Perú",
      "Surinam",
      "Uruguay",
      "Venezuela",
    ],
  },
  {
    grupo: "Europa",
    paises: [
      "Alemania",
      "Austria",
      "Bélgica",
      "Dinamarca",
      "España",
      "Francia",
      "Grecia",
      "Irlanda",
      "Italia",
      "Noruega",
      "Países Bajos",
      "Polonia",
      "Portugal",
      "Reino Unido",
      "Rumania",
      "Rusia",
      "Suecia",
      "Suiza",
      "Ucrania",
    ],
  },
  {
    grupo: "Asia",
    paises: [
      "Arabia Saudita",
      "China",
      "Corea del Sur",
      "Emiratos Árabes Unidos",
      "Filipinas",
      "India",
      "Indonesia",
      "Israel",
      "Japón",
      "Líbano",
      "Malasia",
      "Singapur",
      "Tailandia",
      "Turquía",
      "Vietnam",
    ],
  },
  {
    grupo: "África",
    paises: [
      "Angola",
      "Argelia",
      "Camerún",
      "Egipto",
      "Etiopía",
      "Ghana",
      "Kenia",
      "Marruecos",
      "Nigeria",
      "Senegal",
      "Sudáfrica",
      "Túnez",
    ],
  },
  {
    grupo: "Oceanía",
    paises: ["Australia", "Nueva Zelanda"],
  },
];

/** Todos, en una sola lista, para buscar. */
export const PAISES: readonly string[] = PAISES_POR_GRUPO.flatMap((g) => g.paises);

/**
 * ¿Está este país en la lista?
 *
 * Sin distinguir mayúsculas ni tildes, porque lo que se cargó antes de que la
 * lista existiera vino escrito a mano de todas las formas.
 */
const plano = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function paisConocido(valor: string | null): boolean {
  if (!valor) return false;
  const buscado = plano(valor);
  return PAISES.some((p) => plano(p) === buscado);
}

/**
 * El nombre de la lista que corresponde a lo escrito, o lo escrito tal cual.
 *
 * Sirve para que una ficha vieja que dice «guatemala» se muestre seleccionada
 * en «Guatemala» en vez de aparecer como algo que no está en la lista.
 */
export function normalizarPais(valor: string | null): string | null {
  if (!valor || valor.trim() === "") return null;
  const buscado = plano(valor);
  return PAISES.find((p) => plano(p) === buscado) ?? valor.trim();
}
