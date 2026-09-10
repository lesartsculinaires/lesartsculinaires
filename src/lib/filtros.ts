import { fechaCorta } from "@/lib/format";
import { esDelMes } from "@/lib/periodoDelTablero";
import { SIN_DUENO, activos } from "@/lib/types";
import type { CatalogItem, Catalogo, Importacion, Oportunidad } from "@/lib/types";

/**
 * La barra de filtros, una sola vez.
 *
 * Vive acá porque la usan Clientes y Pipeline, y son la misma barra: los
 * mismos campos, las mismas opciones y la misma manera de decidir si una ficha
 * pasa. Teniéndola dos veces, el día que se agregue un filtro —o que se
 * arregle uno— habría que acordarse de tocar las dos, y una pantalla
 * empezaría a clasificar distinto que la otra sin que nadie lo note.
 */

/** Qué campo de la oportunidad mira cada filtro. */
export const CAMPO: Record<string, keyof Oportunidad> = {
  base: "importacionId",
  vendedor: "vendedorId",
  producto: "productoId",
  etapa: "etapaId",
  estado: "estadoId",
  motivo: "motivoPerdidaId",
  canal: "canalId",
  territorio: "territorioId",
};

export interface DefFiltro {
  key: string;
  label: string;
  items: CatalogItem[];
}

/**
 * Una base subida, como opción de filtro.
 *
 * El nombre del archivo es lo que la persona reconoce —«leads feria
 * marzo.xlsx»— y la fecha desempata cuando el mismo archivo se subió más de
 * una vez, que pasa al corregir una planilla y volver a cargarla.
 */
export const comoOpcion = (b: Importacion): CatalogItem => ({
  id: b.id,
  nombre: `${b.archivo || "Sin nombre"} · ${fechaCorta(b.creadoEn)}`,
});

/**
 * Los filtros de la barra, en orden.
 *
 * `omitir` sirve para las pantallas donde alguno no tiene sentido: en el
 * Pipeline las columnas ya son las etapas, y el vendedor se elige con los
 * botones del tablero.
 */
export function definirFiltros(
  cat: Catalogo,
  importaciones: readonly Importacion[],
  omitir: readonly string[] = [],
  /**
   * Los meses que hubo, para el filtro de período.
   *
   * Se pasan de afuera y no se calculan acá porque salen de las
   * oportunidades, no del catálogo: esta función no las tiene y pedírselas
   * sólo para esto la obligaría a recorrerlas enteras en cada dibujado. Vacío
   * = sin filtro de mes, que es lo que corresponde en una pantalla que no lo
   * necesita.
   */
  meses: readonly CatalogItem[] = [],
  /**
   * Las etiquetas del catálogo, para poder filtrar por ellas.
   *
   * Vienen de afuera por lo mismo que los meses: no están en `Catalogo`, que
   * es lo que se le pide a la base para las pantallas de leads. Vacío = sin
   * filtro de etiqueta.
   */
  etiquetas: readonly CatalogItem[] = [],
): DefFiltro[] {
  const todos: DefFiltro[] = [
    /*
     * El mes va PRIMERO, y es el único que no sale del catálogo.
     *
     * Está adelante porque acota más que cualquier otro: «los leads de
     * septiembre» es la primera pregunta y las demás —de qué canal, de qué
     * programa— se hacen adentro de ésa. Puesto al final se usaría al revés.
     *
     * Sin meses no aparece: un desplegable vacío no lleva a ninguna parte.
     */
    ...(meses.length > 0
      ? [{ key: "mes", label: "Mes", items: [...meses] }]
      : []),
    // Filtrar por alguien dado de baja no lleva a ninguna parte: sus fichas
    // ya no le pertenecen en el sentido de «a quién le toca».
    { key: "vendedor", label: "Vendedor", items: activos(cat.vendedores) },
    { key: "etapa", label: "Etapa", items: cat.etapas },
    { key: "estado", label: "Estado", items: cat.estados },
    // El motivo sólo se ofrece si hay motivos cargados: sin la migración
    // corrida, un filtro vacío no lleva a ninguna parte. Va pegado a Estado
    // porque es su continuación —«perdidos, y de esos, los caros»—.
    ...(cat.motivosPerdida.length > 0
      ? [{ key: "motivo", label: "Motivo", items: cat.motivosPerdida }]
      : []),
    { key: "producto", label: "Programa", items: cat.productos },
    { key: "canal", label: "Canal", items: cat.canales },
    { key: "territorio", label: "Territorio", items: cat.territorios },
    // Las bases van al final y sólo si hay alguna: en un CRM donde nunca se
    // importó nada, un filtro vacío es una promesa que no se cumple.
    ...(importaciones.length > 0
      ? [{ key: "base", label: "Base", items: importaciones.map(comoOpcion) }]
      : []),
    /*
     * La etiqueta, que es la que arma los envíos.
     *
     * Es el filtro que la escuela pidió para poder «seleccionarlos o
     * agruparlos»: se marca «viene de feria» en las fichas, se filtra por eso
     * acá, se marcan todas con la casilla del encabezado y sale el botón de
     * escribirles.
     *
     * Se comporta distinto de todos los demás y por eso está aparte en
     * `pasa`: los otros comparan un id contra una columna, y un lead tiene
     * UNA etapa; las etiquetas son varias por lead, así que la pregunta no es
     * «¿es ésta?» sino «¿está entre las suyas?».
     */
    ...(etiquetas.length > 0
      ? [{ key: "etiqueta", label: "Etiqueta", items: [...etiquetas] }]
      : []),
  ];

  return todos.filter((f) => !omitir.includes(f.key));
}

/**
 * Lo elegido en cada filtro.
 *
 * ============================================================================
 * UNA LISTA POR FILTRO, Y NO UN VALOR
 * ============================================================================
 *
 * Antes era `number | null`: un filtro tenía un valor o ninguno. La escuela
 * pidió poder marcar varios —«poder hacer clic a distintos ítems»— y eso no es
 * un agregado a la pantalla sino un cambio de forma: «los leads de julio Y de
 * agosto» no se puede decir con un número.
 *
 * La lista vacía es «Todos», que es lo mismo que era `null`. Así no hay dos
 * maneras de decir «sin filtrar» —ni `null` ni `[]` conviviendo— que es de
 * donde salen los filtros que se ven puestos y no filtran nada.
 */
export type Elegidos = Record<string, number[]>;

/**
 * Lo que hay marcado en un filtro, siempre como lista.
 *
 * Existe porque las pantallas guardan el estado en la dirección y en memoria, y
 * un filtro que nunca se tocó no tiene entrada: pedirlo devuelve `undefined`.
 * Sin esto, cada lugar que lee un filtro tendría que acordarse del `?? []`.
 */
export const marcados = (filtros: Elegidos, key: string): number[] => filtros[key] ?? [];

/**
 * Marca o desmarca un ítem, y devuelve la lista nueva.
 *
 * `null` es «Todos» y limpia el filtro entero: es el ítem de arriba de cada
 * desplegable, y tiene que poder deshacer una selección larga de un clic.
 *
 * Los demás alternan. Volver a apretar algo ya marcado lo saca, que es lo que
 * espera cualquiera que haya usado una lista de casillas.
 */
export function alternar(actuales: readonly number[], valor: number | null): number[] {
  if (valor == null) return [];
  return actuales.includes(valor)
    ? actuales.filter((v) => v !== valor)
    : [...actuales, valor];
}

/** ¿Esta ficha pasa todos los filtros puestos? */
export function pasa(o: Oportunidad, defs: readonly DefFiltro[], filtros: Elegidos): boolean {
  return defs.every(({ key }) => {
    const quiere = marcados(filtros, key);
    if (quiere.length === 0) return true;

    /*
     * Dentro de un filtro, las opciones suman; entre filtros, restan.
     *
     * «Julio o agosto» —`some`— y además «de Katya», que es otro filtro y se
     * comprueba aparte con el `every` de arriba. Es lo que uno espera al marcar
     * dos meses: ver los dos, no ver nada porque ningún lead es de los dos a la
     * vez.
     */
    return quiere.some((v) => {
      // `SIN_DUENO` pide lo contrario que un id: las fichas con el campo vacío.
      // Es a donde lleva el aviso de «sin vendedor asignado».
      if (v === SIN_DUENO) return o[CAMPO[key]] == null;
      /*
       * El mes no es un id de catálogo: es una fecha convertida a número. No
       * está en `CAMPO` porque no hay una columna que guarde el mes; se calcula
       * desde la fecha de registro, igual que en el tablero, para que las dos
       * pantallas digan lo mismo de un mismo lead.
       */
      if (key === "mes") return esDelMes(o, v);
      // Varias por lead: se pregunta si la puesta está entre las suyas.
      if (key === "etiqueta") return o.etiquetaIds.includes(v);
      return o[CAMPO[key]] === v;
    });
  });
}

/** Cuántos filtros hay puestos. Cero es «la lista entera». */
export const cuantosPuestos = (defs: readonly DefFiltro[], filtros: Elegidos): number =>
  defs.filter(({ key }) => marcados(filtros, key).length > 0).length;

/**
 * Cómo se lee un filtro en su pastilla: «Todos», el nombre, o cuántos hay.
 *
 * Con uno marcado se dice cuál —es lo que más pasa y lo que hay que poder leer
 * sin abrir el menú—. Con varios, el número: los nombres no entran en una
 * pastilla y cortarlos haría leer «Diplomado Superior de Coci…» sin saber que
 * hay otro más.
 */
export function comoSeLee(
  puestos: readonly number[],
  nombreDe: (id: number) => string | undefined,
): string {
  if (puestos.length === 0) return "Todos";
  if (puestos.length === 1) return nombreDe(puestos[0]) ?? "Todos";
  return `${puestos.length} elegidos`;
}
