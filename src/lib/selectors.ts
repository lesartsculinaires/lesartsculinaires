import { money } from "@/lib/format";
import { normalizarPais } from "@/lib/paises";
import { openTone } from "@/lib/theme";
import type { Estado, Oportunidad, Tone } from "@/lib/types";

/**
 * NOTA SOBRE `reserva`, que a propósito no aparece en este archivo.
 *
 * La reserva es la parte del valor que el cliente ya pagó para apartar el
 * cupo, no plata adicional: en una inscripción de $495 con $100 de reserva, el
 * negocio vale $495 y no $595. Sumarla al pipeline lo inflaría, y sumarla al
 * total cerrado contaría dos veces los mismos $100 el día que la venta se
 * cierre por el total.
 *
 * Si algún día hace falta saber cuánto hay reservado, va como su propia
 * cuenta —«reservado en negocios abiertos»— y no metida dentro de estas.
 */

/** Live pipeline: anything not in a final state. */
export const estaAbierta = (o: Oportunidad): boolean => !o.esFinal;

export const esGanada = (o: Oportunidad): boolean => o.estado === "Ganado";

/** Revenue booked; falls back to the opportunity value when not recorded. */
export const montoGanado = (o: Oportunidad): number =>
  esGanada(o) ? (o.cerrada ?? o.valor ?? 0) : 0;

export const valorPipeline = (list: readonly Oportunidad[]): number =>
  list.filter(estaAbierta).reduce((a, o) => a + (o.valor ?? 0), 0);

export const totalCerrado = (list: readonly Oportunidad[]): number =>
  list.reduce((a, o) => a + (o.cerrada ?? 0), 0);

/** Closed revenue for one month, keyed by the view's `mes` column. */
export const cerradoEnMes = (list: readonly Oportunidad[], mes: string): number =>
  list.filter((o) => o.mes === mes).reduce((a, o) => a + (o.cerrada ?? 0), 0);

/** Cómo se llama en los gráficos el lead al que nadie le cargó el país. */
export const SIN_PAIS = "Sin país cargado";

export interface GroupedBar {
  label: string;
  count: string;
  value: string;
  /** Width % of the solid "won" segment. */
  wonPct: number;
  /** Width % of the lighter "still open" segment. */
  openPct: number;
}

/**
 * Aggregate opportunities by one text field, ranked by total value.
 * Bar widths are relative to the largest group, not to the grand total.
 */
export function groupBars(
  list: readonly Oportunidad[],
  key: "vendedor" | "canal" | "territorio" | "producto" | "etapa" | "estado" | "pais",
  limit = 20,
): GroupedBar[] {
  const map = new Map<string, { n: number; val: number; won: number }>();
  for (const o of list) {
    /*
     * El país es el único que puede venir vacío o escrito de dos formas.
     *
     * Vacío porque sólo se carga cuando el territorio es «Extranjero»: hoy
     * mil de las mil quinientas fichas no lo tienen, y esconderlas dejaría un
     * gráfico que dice «cuatro de Estados Unidos» como si eso fuera el
     * reparto entero. Se cuentan aparte y con su nombre, que además es la
     * manera de que se vea cuánto falta por cargar.
     *
     * Y de dos formas porque se escribió a mano antes de que fuera una
     * lista: en la base conviven «Panama» y «Panamá», que son el mismo país
     * y harían dos barras. `normalizarPais` los junta contra el catálogo.
     */
    const k =
      key === "pais"
        ? (normalizarPais(o.pais ?? null) ?? SIN_PAIS)
        : o[key];
    const g = map.get(k) ?? { n: 0, val: 0, won: 0 };
    g.n += 1;
    g.val += o.valor ?? 0;
    g.won += montoGanado(o);
    map.set(k, g);
  }

  // Rank by value, but keep groups that have leads yet no amounts recorded.
  const rows = [...map.entries()]
    .sort((a, b) => b[1].val - a[1].val || b[1].n - a[1].n)
    .slice(0, limit);
  const max = Math.max(...rows.map((r) => r[1].val), 1);

  return rows.map(([label, g]) => ({
    label,
    count: g.n === 1 ? "1 lead" : `${g.n} leads`,
    value: money(g.val || null),
    wonPct: (g.won / max) * 100,
    openPct: ((g.val - g.won) / max) * 100,
  }));
}

/** Colours for a status pill, resolved from the catalogue. */
export function estadoTone(nombre: string, accent: string): Tone {
  switch (nombre) {
    case "Ganado":
      return ["#2F6B4F", "#E6F0E9"];
    case "Perdido":
      return ["#B85042", "#F7EBE9"];
    case "Reserva":
      return ["#5A5EA6", "#EBECF7"];
    case "En pausa/inactivo":
      return ["#9C7118", "#F6EEDC"];
    case "Activo":
      return ["#0F6E7A", "#E2F0F1"];
    default:
      return [accent, openTone(accent)];
  }
}

/**
 * El color de una etapa: las dos puntas del embudo se leen aparte del resto.
 *
 * Acá decía que «Cierre» iba en verde. Esa etapa ahora se llama «Perdido» —lo
 * pidió la escuela— y dejarlo como estaba pintaría de verde, el color de lo
 * ganado, justo la columna de lo que no se vendió.
 *
 * Se decide por nombre y no por posición porque son dos ideas distintas:
 * «Ganado» es la última del embudo y va en verde, «Perdido» está en el medio
 * —donde estaba «Cierre»— y va en rojo. Lo demás es camino y va en el color de
 * la casa.
 */
export const etapaTone = (nombre: string, accent: string): string =>
  nombre === "Ganado" ? "#2F6B4F" : nombre === "Perdido" ? "#B85042" : accent;

/** True when this state means the deal was lost. */
export const esPerdida = (e: Estado): boolean =>
  e.esFinal && e.nombre === "Perdido";

// ------------------------------------------------------ por qué se pierden

export interface MotivoPerdida {
  nombre: string;
  leads: number;
  /** Qué porcentaje de las perdidas se fue por acá. */
  porcentaje: number;
  /** Lo que valían esas oportunidades, si estaba cargado. */
  valor: number;
  /** Las que se perdieron sin decir por qué. */
  sinDecir: boolean;
}

/**
 * Cuántos leads se perdieron por cada motivo.
 *
 * Se cuenta por cantidad de leads y no por dinero, que es lo que hace el resto
 * del tablero. Es a propósito: la pregunta acá es «¿qué nos está costando
 * gente?», y una sola oportunidad grande perdida por falta de documentación no
 * significa que el papeleo sea el problema. El monto igual se muestra al lado,
 * porque a veces cambia la conversación.
 *
 * Las que se perdieron sin motivo anotado se muestran, y van últimas. Es la
 * decisión que hace que el número sea confiable: escondiéndolas, un tablero
 * con tres motivos cargados de treinta pérdidas se leería como si esos tres
 * explicaran todo.
 */
export function motivosDePerdida(list: readonly Oportunidad[]): MotivoPerdida[] {
  const perdidas = list.filter((o) => o.estado === "Perdido");
  if (perdidas.length === 0) return [];

  const mapa = new Map<string, { n: number; valor: number }>();
  for (const o of perdidas) {
    const k = o.motivoPerdida ?? "";
    const g = mapa.get(k) ?? { n: 0, valor: 0 };
    g.n += 1;
    g.valor += o.valor ?? 0;
    mapa.set(k, g);
  }

  return [...mapa.entries()]
    .map(([nombre, g]) => ({
      nombre: nombre || "Sin motivo anotado",
      leads: g.n,
      porcentaje: Math.round((g.n / perdidas.length) * 100),
      valor: g.valor,
      sinDecir: nombre === "",
    }))
    .sort((a, b) => {
      // Los sin motivo al final: no son una razón, son un hueco.
      if (a.sinDecir !== b.sinDecir) return a.sinDecir ? 1 : -1;
      return b.leads - a.leads || b.valor - a.valor;
    });
}
