import { mesDeLaVenta, type ResumenPeriodo } from "@/lib/periodos";
import { esGanada } from "@/lib/selectors";
import type { Oportunidad } from "@/lib/types";

/**
 * Los meses de la Evolución, sin que una fecha rara los dispare (12/11/2026).
 *
 * `porMes` rellena todos los meses entre la fecha más vieja y la más nueva,
 * para que las barras sean continuas. Con un lead importado con una fecha de
 * nacimiento como fecha de registro (pasó en HC: 26/08/1985), eso eran más de
 * 480 botones, uno por mes desde 1985.
 *
 * Ahora: los últimos `cuantos` meses van como botones; los anteriores, sólo si
 * tuvieron algo, en una lista agrupada por año (del más nuevo al más viejo).
 * Los meses vacíos de en medio desaparecen de la lista.
 */
export function repartirMeses(
  meses: readonly ResumenPeriodo[],
  cuantos = 12,
): { recientes: ResumenPeriodo[]; anteriores: { anio: string; meses: ResumenPeriodo[] }[] } {
  const recientes = meses.slice(-cuantos);
  const viejos = meses
    .slice(0, Math.max(0, meses.length - cuantos))
    .filter((m) => m.leads > 0 || m.ganados > 0 || m.cerrado > 0);
  const porAnio = new Map<string, ResumenPeriodo[]>();
  for (const m of viejos) {
    const anio = m.clave.slice(0, 4);
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), m]);
  }
  const anteriores = [...porAnio.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([anio, lista]) => ({ anio, meses: [...lista].reverse() }));
  return { recientes, anteriores };
}

export interface FechaParaRevisar {
  id: number;
  cliente: string;
  fecha: string;
  cual: "registro" | "cierre";
}

/**
 * Leads con una fecha que no puede ser: más de `aniosAtras` años antes de hoy
 * o más de un mes en el futuro. Casi siempre es una fecha de nacimiento o un
 * año mal escrito al importar. Se avisa para corregirla en la ficha; no se
 * toca nada solo.
 */
export function fechasParaRevisar(
  oportunidades: readonly Oportunidad[],
  hoy: string,
  aniosAtras = 5,
): FechaParaRevisar[] {
  const [a, m, d] = hoy.slice(0, 10).split("-");
  const piso = `${Number(a) - aniosAtras}-${m}-${d}`;
  const techo = (() => {
    const f = new Date(`${hoy.slice(0, 10)}T00:00:00Z`);
    f.setUTCDate(f.getUTCDate() + 31);
    return f.toISOString().slice(0, 10);
  })();
  const rara = (f: string | null | undefined) => !!f && (f.slice(0, 10) < piso || f.slice(0, 10) > techo);

  const salida: FechaParaRevisar[] = [];
  for (const o of oportunidades) {
    const registro = o.fechaRegistro || o.mes;
    if (rara(registro)) salida.push({ id: o.id, cliente: o.cliente, fecha: registro!.slice(0, 10), cual: "registro" });
    else if (esGanada(o) && o.fechaCierre && rara(o.fechaCierre) && mesDeLaVenta(o)) {
      salida.push({ id: o.id, cliente: o.cliente, fecha: o.fechaCierre.slice(0, 10), cual: "cierre" });
    }
  }
  return salida.sort((x, y) => x.fecha.localeCompare(y.fecha));
}
