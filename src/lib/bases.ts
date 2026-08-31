/**
 * Agrupación de las oportunidades por la carga que las trajo.
 *
 * Hay dos fuentes. Las importaciones registradas traen nombre de archivo y
 * autor. Todo lo que entró antes de que existiera ese registro —o a mano, una
 * por una— no tiene encabezado, así que se agrupa por el día en que se creó:
 * es la única señal disponible, y alcanza para encontrar las filas.
 */

import type { Importacion, Oportunidad } from "@/lib/types";

export interface Base {
  /** `imp:12` para una importación registrada, `dia:2026-07-29` si no. */
  clave: string;
  /** Nombre del archivo, o la fecha cuando no hay registro. */
  titulo: string;
  /** Día en que entró, ISO. */
  fecha: string | null;
  /** Momento exacto, cuando se conoce. */
  momento: string | null;
  registrada: boolean;
  oportunidades: Oportunidad[];
  /** Filas que el registro dice haber cargado; puede diferir de las vivas. */
  filasDeclaradas: number | null;
  /** Id de `importaciones`. Nulo en las cargas agrupadas por día. */
  importacionId: number | null;
  /**
   * Esta base es una copia de otra: mismo archivo, subido el mismo día.
   *
   * Guarda el título de la que se considera «la buena» para poder decirlo en
   * la pantalla. Nulo cuando no hay repetición o cuando ÉSTA es la buena.
   */
  duplicadaDe: string | null;
}

/** "2026-07-29T17:36:47Z" → "2026-07-29". */
const soloDia = (iso: string | null): string | null =>
  iso ? iso.slice(0, 10) : null;

/**
 * Arma la lista de bases, de la más reciente a la más vieja.
 *
 * Las importaciones registradas se listan aunque hayan quedado sin filas
 * vivas: si alguien borró los clientes que trajo una base, el hecho de que
 * esa base se subió sigue siendo información.
 */
export function agruparBases(
  oportunidades: readonly Oportunidad[],
  importaciones: readonly Importacion[],
): Base[] {
  const porImportacion = new Map<number, Oportunidad[]>();
  const sueltas: Oportunidad[] = [];

  for (const o of oportunidades) {
    if (o.importacionId != null) {
      const lista = porImportacion.get(o.importacionId) ?? [];
      lista.push(o);
      porImportacion.set(o.importacionId, lista);
    } else {
      sueltas.push(o);
    }
  }

  const bases: Base[] = importaciones.map((imp) => ({
    clave: `imp:${imp.id}`,
    titulo: imp.archivo,
    fecha: soloDia(imp.creadoEn),
    momento: imp.creadoEn,
    registrada: true,
    oportunidades: porImportacion.get(imp.id) ?? [],
    filasDeclaradas: imp.filas,
    importacionId: imp.id,
    duplicadaDe: null, // se completa abajo, mirando el conjunto
  }));

  marcarRepetidas(bases);

  // Lo que no pertenece a ninguna importación, por día de creación.
  const porDia = new Map<string, Oportunidad[]>();
  for (const o of sueltas) {
    const dia = soloDia(o.creadoEn) ?? "sin-fecha";
    const lista = porDia.get(dia) ?? [];
    lista.push(o);
    porDia.set(dia, lista);
  }

  for (const [dia, lista] of porDia) {
    bases.push({
      clave: `dia:${dia}`,
      titulo:
        dia === "sin-fecha"
          ? "Carga sin fecha registrada"
          : `Carga del ${dia.split("-").reverse().join("/")}`,
      fecha: dia === "sin-fecha" ? null : dia,
      // El momento más temprano del grupo representa la carga.
      momento: lista.reduce<string | null>(
        (min, o) => (o.creadoEn && (!min || o.creadoEn < min) ? o.creadoEn : min),
        null,
      ),
      registrada: false,
      oportunidades: lista,
      filasDeclaradas: null,
      importacionId: null,
      duplicadaDe: null,
    });
  }

  return bases.sort((a, b) => (b.momento ?? "").localeCompare(a.momento ?? ""));
}

/**
 * Marca cuáles bases son copias de otra, y cuál es la que se queda.
 *
 * ==========================================================================
 * QUÉ CUENTA COMO REPETIDA
 * ==========================================================================
 *
 * Mismo nombre de archivo, subido el mismo día. Las dos condiciones juntas, y
 * es a propósito: la escuela sube «Asalariados 2025-2026 CRM.xlsx» una vez al
 * año, actualizado. Dos cargas de ese archivo con nueve meses de distancia son
 * dos cargas legítimas, no un error; dos del mismo minuto son el doble clic
 * que ya conocemos.
 *
 * ==========================================================================
 * Y CUÁL SE QUEDA
 * ==========================================================================
 *
 * La que tiene más leads trabajados —la que le costó tiempo a alguien—, y a
 * igualdad, la primera que se subió.
 *
 * El orden importa más de lo que parece. Quien mire la pantalla va a borrar lo
 * que esté marcado sin pensarlo mucho, así que la marca tiene que caer del
 * lado correcto sola. Marcar «la segunda» a secas sería más simple y estaría
 * mal justo cuando importa: si el doble clic pasó y alguien trabajó la segunda
 * tanda, borrarla tira ese trabajo.
 *
 * Acá se mira lo que la pantalla tiene a mano —notas no, pero sí etapa, dinero
 * y estado—; la comprobación que puede frenar el borrado la hace
 * `revisar_base` en la base, que sí ve las notas y los recordatorios.
 */
function marcarRepetidas(bases: Base[]): void {
  const porArchivo = new Map<string, Base[]>();

  for (const b of bases) {
    // Mismo archivo y mismo día. Sin el día, dos cargas anuales del mismo
    // nombre se marcarían como repetidas.
    const clave = `${b.titulo} ${b.fecha ?? ""}`;
    const lista = porArchivo.get(clave) ?? [];
    lista.push(b);
    porArchivo.set(clave, lista);
  }

  for (const grupo of porArchivo.values()) {
    if (grupo.length < 2) continue;

    const trabajo = (b: Base) =>
      b.oportunidades.filter(
        (o) =>
          (o.cerrada ?? 0) > 0 ||
          (o.reserva ?? 0) > 0 ||
          o.esFinal ||
          (o.etapaOrden != null && o.etapaOrden > 1),
      ).length;

    const buena = [...grupo].sort((a, b) => {
      const d = trabajo(b) - trabajo(a);
      if (d !== 0) return d;
      return (a.momento ?? "").localeCompare(b.momento ?? "");
    })[0];

    for (const b of grupo) {
      if (b !== buena) b.duplicadaDe = buena.titulo;
    }
  }
}

/** Las que están marcadas como copia. Para el botón de borrar. */
export const repetidas = (bases: readonly Base[]): Base[] =>
  bases.filter((b) => b.duplicadaDe != null);

/** Totales de una base, para su fila en la tabla. */
export function resumirBase(b: Base): {
  clientes: number;
  ganados: number;
  cerrado: number;
} {
  const clientes = new Set(b.oportunidades.map((o) => o.clienteId)).size;
  return {
    clientes,
    ganados: b.oportunidades.filter((o) => o.estado === "Ganado").length,
    cerrado: b.oportunidades.reduce((a, o) => a + (o.cerrada ?? 0), 0),
  };
}
