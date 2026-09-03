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
  ];

  return todos.filter((f) => !omitir.includes(f.key));
}

/** ¿Esta ficha pasa todos los filtros puestos? */
export function pasa(
  o: Oportunidad,
  defs: readonly DefFiltro[],
  filtros: Record<string, number | null>,
): boolean {
  return defs.every(({ key }) => {
    const quiere = filtros[key];
    if (quiere == null) return true;
    // `SIN_DUENO` pide lo contrario que un id: las fichas con el campo vacío.
    // Es a donde lleva el aviso de «sin vendedor asignado».
    if (quiere === SIN_DUENO) return o[CAMPO[key]] == null;
    /*
     * El mes no es un id de catálogo: es una fecha convertida a número. No
     * está en `CAMPO` porque no hay una columna que guarde el mes; se calcula
     * desde la fecha de registro, igual que en el tablero, para que las dos
     * pantallas digan lo mismo de un mismo lead.
     */
    if (key === "mes") return esDelMes(o, quiere);
    return o[CAMPO[key]] === quiere;
  });
}

/** Cuántos filtros hay puestos. Cero es «la lista entera». */
export const cuantosPuestos = (
  defs: readonly DefFiltro[],
  filtros: Record<string, number | null>,
): number => defs.filter(({ key }) => filtros[key] != null).length;
