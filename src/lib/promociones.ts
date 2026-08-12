/**
 * Promociones y descuentos ya usados.
 *
 * El campo es texto libre a propósito —cada promoción se describe distinto—
 * pero eso tiene un costo: la misma promoción escrita de cinco formas hace
 * imposible contar después cuántas matrículas se cerraron con ella. Ofrecer
 * las ya usadas no impide escribir una nueva, pero hace que repetir una sea
 * más fácil que reinventarla.
 */

import type { Oportunidad } from "@/lib/types";

export interface PromocionUsada {
  texto: string;
  /** En cuántas oportunidades aparece. */
  veces: number;
}

/** Normaliza sólo para comparar; el texto que se guarda es el original. */
const clave = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Promociones distintas ya escritas, de la más usada a la menos usada.
 *
 * Cuando la misma promoción aparece escrita de varias formas se queda con la
 * grafía más frecuente: es la que el equipo ya reconoce.
 */
export function promocionesUsadas(
  oportunidades: readonly Oportunidad[],
  limite = 8,
): PromocionUsada[] {
  const grupos = new Map<string, Map<string, number>>();

  for (const o of oportunidades) {
    const texto = o.descuento?.trim();
    if (!texto) continue;

    const k = clave(texto);
    if (!k) continue;

    const grafias = grupos.get(k) ?? new Map<string, number>();
    grafias.set(texto, (grafias.get(texto) ?? 0) + 1);
    grupos.set(k, grafias);
  }

  return [...grupos.values()]
    .map((grafias) => {
      const total = [...grafias.values()].reduce((a, n) => a + n, 0);
      const masUsada = [...grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { texto: masUsada, veces: total };
    })
    .sort((a, b) => b.veces - a.veces || a.texto.localeCompare(b.texto))
    .slice(0, limite);
}
