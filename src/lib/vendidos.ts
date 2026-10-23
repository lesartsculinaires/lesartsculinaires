/**
 * Cursos y diplomados vendidos, y quién los vendió.
 *
 * Pedido el 23/10/2026: «ser más específico en las métricas para un reporte
 * más rápido y directo» — cuántos cursos y cuántos diplomados se vendieron, y
 * cuántos de cada uno vendió cada asesora. Lo usan el Dashboard y los reportes
 * del día y del mes, para que los tres digan lo mismo.
 *
 * Una venta es un lead en estado Ganado, contado en el día o el mes de su
 * fecha de cierre (la misma regla que los ganados del tablero). Su tipo sale
 * de la categoría del programa que se vendió: «Curso corto» es curso,
 * «Diplomado» es diplomado; Certificación, Otro y los ganados sin programa van
 * en «otros», a la vista, para que la suma siempre dé el total de ganados.
 *
 * Funciones puras: no leen la base ni dibujan nada.
 */

import { normalizarTexto } from "@/lib/duplicados";

export type TipoVendido = "curso" | "diplomado" | "otro";

export const tipoDePrograma = (categoria: string | null | undefined): TipoVendido => {
  const c = normalizarTexto(categoria ?? "");
  if (c.startsWith("curso")) return "curso";
  if (c.startsWith("diplomado")) return "diplomado";
  return "otro";
};

/** Un lead ganado, con lo justo para contarlo. */
export interface Venta {
  quien: string | null;
  programa: string | null;
  categoria: string | null;
  monto: number;
}

export interface FilaVendidos {
  quien: string;
  cursos: number;
  diplomados: number;
  otros: number;
  total: number;
  monto: number;
}

export interface ProgramaVendido {
  programa: string;
  tipo: TipoVendido;
  ventas: number;
  monto: number;
}

export interface Vendidos {
  cursos: number;
  diplomados: number;
  otros: number;
  total: number;
  montoCursos: number;
  montoDiplomados: number;
  montoOtros: number;
  /** De quien más vendió a quien menos. */
  porAsesora: FilaVendidos[];
  /** Qué programas se vendieron, del más vendido al menos. */
  porPrograma: ProgramaVendido[];
}

export const SIN_ASESORA = "Sin asignar";
export const SIN_PROGRAMA = "Sin programa elegido";

export function contarVendidos(ventas: readonly Venta[]): Vendidos {
  const r: Vendidos = {
    cursos: 0,
    diplomados: 0,
    otros: 0,
    total: 0,
    montoCursos: 0,
    montoDiplomados: 0,
    montoOtros: 0,
    porAsesora: [],
    porPrograma: [],
  };
  const quienes = new Map<string, FilaVendidos>();
  const programas = new Map<string, ProgramaVendido>();

  for (const v of ventas) {
    const tipo = v.programa ? tipoDePrograma(v.categoria) : "otro";
    r.total += 1;
    if (tipo === "curso") {
      r.cursos += 1;
      r.montoCursos += v.monto;
    } else if (tipo === "diplomado") {
      r.diplomados += 1;
      r.montoDiplomados += v.monto;
    } else {
      r.otros += 1;
      r.montoOtros += v.monto;
    }

    const quien = v.quien?.trim() || SIN_ASESORA;
    let f = quienes.get(quien);
    if (!f) {
      f = { quien, cursos: 0, diplomados: 0, otros: 0, total: 0, monto: 0 };
      quienes.set(quien, f);
    }
    if (tipo === "curso") f.cursos += 1;
    else if (tipo === "diplomado") f.diplomados += 1;
    else f.otros += 1;
    f.total += 1;
    f.monto += v.monto;

    const nombre = v.programa?.trim() || SIN_PROGRAMA;
    let p = programas.get(nombre);
    if (!p) {
      p = { programa: nombre, tipo, ventas: 0, monto: 0 };
      programas.set(nombre, p);
    }
    p.ventas += 1;
    p.monto += v.monto;
  }

  r.porAsesora = [...quienes.values()].sort(
    (a, b) => b.total - a.total || b.diplomados - a.diplomados || a.quien.localeCompare(b.quien),
  );
  r.porPrograma = [...programas.values()].sort(
    (a, b) => b.ventas - a.ventas || a.programa.localeCompare(b.programa),
  );
  return r;
}

/** «3 cursos y 2 diplomados», «1 diplomado»: lo que está en cero no se dice. */
export function decirVendidos(v: Pick<Vendidos, "cursos" | "diplomados" | "otros">): string {
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  const partes = [
    v.cursos > 0 ? n(v.cursos, "curso", "cursos") : null,
    v.diplomados > 0 ? n(v.diplomados, "diplomado", "diplomados") : null,
    v.otros > 0 ? n(v.otros, "otro programa", "otros programas") : null,
  ].filter((p): p is string => p != null);
  if (partes.length === 0) return "ningún curso ni diplomado";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
