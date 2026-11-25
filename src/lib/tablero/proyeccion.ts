/**
 * La proyección de la meta de venta del mes.
 *
 * Pedido el 25/11/2026 para LAC y HC: en el Dashboard, en el Tablero y como
 * primer bloque del sitio de Dirección, ver de un vistazo
 *   · la meta del mes que pone Dirección y cuánto se lleva (y a qué %),
 *   · a cuánto se llegaría al cierre si se sigue al ritmo de hoy,
 *   · lo de cada asesora,
 *   · lo vendido por semana del mes y por mes (los últimos seis).
 *
 * Es puro: recibe las ventas (de `tablero_ventas` o del sitio) y las metas, y
 * no sabe de dónde vienen. Así el CRM y el sitio de Dirección cuentan igual.
 *
 * QUÉ CUENTA COMO VENDIDO: lo mismo que la «Venta nueva» del Tablero —diplomados
 * y cursos cortos ganados, el día de su cierre, más el corporativo que Ventas
 * carga a mano—. Ver la migración 20261206120000_tablero_proyeccion.sql.
 */

export type CategoriaDeVenta = "diplomado" | "curso_corto" | "corporativo";

export interface VentaDelDia {
  fecha: string; // AAAA-MM-DD
  vendedorId: number | null;
  categoria: CategoriaDeVenta;
  cantidad: number;
  monto: number;
}

export interface MetaDelMes {
  mes: string; // AAAA-MM-01
  valor: number;
}

export interface FilaAsesora {
  id: number | null;
  nombre: string;
  monto: number;
  diplomados: number;
  cursosCortos: number;
  /** Parte de lo vendido en el mes (0–1). */
  parte: number | null;
  /** Cuánto de la meta del mes cubre lo suyo (0–1). */
  deLaMeta: number | null;
}

export interface SemanaDelMes {
  desde: string;
  hasta: string;
  etiqueta: string;
  monto: number;
  /** La parte de la meta que le toca a esa semana, por los días que tiene del mes. */
  meta: number | null;
  actual: boolean;
  futura: boolean;
}

export interface MesDeLaSerie {
  mes: string;
  etiqueta: string;
  monto: number;
  meta: number | null;
  porcentaje: number | null;
  actual: boolean;
}

export interface Proyeccion {
  mes: string;
  meta: number | null;
  vendido: number;
  porcentaje: number | null;
  falta: number | null;
  cubierta: boolean;
  diasDelMes: number;
  diasCorridos: number;
  /** A cuánto se llega al cierre si se sigue al ritmo de lo que va del mes. */
  proyeccion: number | null;
  porcentajeProyectado: number | null;
  semanasQuedan: number;
  /** Lo que hay que vender por semana, desde hoy, para llegar a la meta. */
  porSemanaParaLlegar: number | null;
  desglose: { diplomados: { cantidad: number; monto: number }; cursosCortos: { cantidad: number; monto: number }; corporativo: number };
  asesoras: FilaAsesora[];
  semanas: SemanaDelMes[];
  meses: MesDeLaSerie[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const aFecha = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => iso(new Date(aFecha(s).getTime() + n * 86_400_000));
const diasDelMes = (mes: string) => {
  const d = aFecha(mes);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
export const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;
const mesMenos = (mes: string, n: number) => {
  const d = aFecha(mes);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)));
};
const etiquetaDia = (s: string) => `${Number(s.slice(8, 10))} ${MESES[Number(s.slice(5, 7)) - 1]}`;
const dividir = (a: number, b: number | null | undefined) => (b ? a / b : null);

/** Las semanas (lunes a domingo) que tocan el mes, recortadas a sus días. */
export function semanasDelMesCalendario(mes: string): { desde: string; hasta: string }[] {
  const ultimo = sumarDias(mes, diasDelMes(mes) - 1);
  const salida: { desde: string; hasta: string }[] = [];
  let desde = mes;
  while (desde <= ultimo) {
    const dow = (aFecha(desde).getUTCDay() + 6) % 7; // lunes = 0
    const domingo = sumarDias(desde, 6 - dow);
    const hasta = domingo < ultimo ? domingo : ultimo;
    salida.push({ desde, hasta });
    desde = sumarDias(hasta, 1);
  }
  return salida;
}

export function proyeccionDelMes(args: {
  mes: string;
  hoy: string;
  ventas: readonly VentaDelDia[];
  metas: readonly MetaDelMes[];
  nombres: ReadonlyMap<number, string>;
  /** Cómo se llama la fila de ventas sin vendedora (corporativo, o lo de otras cuando no se puede ver). */
  sinNombre?: string;
}): Proyeccion {
  const { mes, hoy, ventas, metas, nombres } = args;
  const fin = sumarDias(mes, diasDelMes(mes) - 1);
  const delMes = ventas.filter((v) => v.fecha >= mes && v.fecha <= fin);
  const metaDe = (m: string) => {
    const x = metas.find((y) => y.mes === m);
    return x && Number.isFinite(x.valor) ? x.valor : null;
  };
  const meta = metaDe(mes);
  const vendido = delMes.reduce((s, v) => s + v.monto, 0);

  const dias = diasDelMes(mes);
  const corridos = hoy < mes ? 0 : hoy > fin ? dias : Number(hoy.slice(8, 10));
  const proyeccion = corridos > 0 ? (vendido / corridos) * dias : null;

  const semanasCal = semanasDelMesCalendario(mes);
  const semanasQuedan = semanasCal.filter((s) => s.hasta >= hoy && hoy <= fin).length;
  const falta = meta == null ? null : Math.max(0, meta - vendido);

  // Por asesora
  const porId = new Map<string, FilaAsesora>();
  for (const v of delMes) {
    const clave = v.vendedorId == null ? "-" : String(v.vendedorId);
    const fila = porId.get(clave) ?? {
      id: v.vendedorId,
      nombre: v.vendedorId == null ? (args.sinNombre ?? "Sin asesora") : (nombres.get(v.vendedorId) ?? `#${v.vendedorId}`),
      monto: 0, diplomados: 0, cursosCortos: 0, parte: null, deLaMeta: null,
    };
    fila.monto += v.monto;
    if (v.categoria === "diplomado") fila.diplomados += v.cantidad;
    if (v.categoria === "curso_corto") fila.cursosCortos += v.cantidad;
    porId.set(clave, fila);
  }
  const asesoras = [...porId.values()]
    .map((f) => ({ ...f, parte: dividir(f.monto, vendido), deLaMeta: dividir(f.monto, meta) }))
    .sort((a, b) => (a.id == null ? 1 : 0) - (b.id == null ? 1 : 0) || b.monto - a.monto);

  const semanas = semanasCal.map((s) => {
    const diasDeLaSemana = Math.round((aFecha(s.hasta).getTime() - aFecha(s.desde).getTime()) / 86_400_000) + 1;
    return {
      desde: s.desde,
      hasta: s.hasta,
      etiqueta: s.desde === s.hasta ? etiquetaDia(s.desde) : `${etiquetaDia(s.desde)} – ${etiquetaDia(s.hasta)}`,
      monto: delMes.filter((v) => v.fecha >= s.desde && v.fecha <= s.hasta).reduce((t, v) => t + v.monto, 0),
      meta: meta == null ? null : (meta * diasDeLaSemana) / dias,
      actual: hoy >= s.desde && hoy <= s.hasta,
      futura: hoy < s.desde,
    };
  });

  const meses = [5, 4, 3, 2, 1, 0].map((n) => {
    const m = mesMenos(mes, n);
    const f = sumarDias(m, diasDelMes(m) - 1);
    const monto = ventas.filter((v) => v.fecha >= m && v.fecha <= f).reduce((t, v) => t + v.monto, 0);
    const mm = metaDe(m);
    return { mes: m, etiqueta: `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`, monto, meta: mm, porcentaje: dividir(monto, mm), actual: n === 0 };
  });

  const sumaCat = (c: CategoriaDeVenta) =>
    delMes.filter((v) => v.categoria === c).reduce((t, v) => ({ cantidad: t.cantidad + v.cantidad, monto: t.monto + v.monto }), { cantidad: 0, monto: 0 });

  return {
    mes,
    meta,
    vendido,
    porcentaje: dividir(vendido, meta),
    falta,
    cubierta: meta != null && vendido >= meta,
    diasDelMes: dias,
    diasCorridos: corridos,
    proyeccion,
    porcentajeProyectado: proyeccion == null ? null : dividir(proyeccion, meta),
    semanasQuedan,
    porSemanaParaLlegar: falta && semanasQuedan > 0 ? falta / semanasQuedan : null,
    desglose: { diplomados: sumaCat("diplomado"), cursosCortos: sumaCat("curso_corto"), corporativo: sumaCat("corporativo").monto },
    asesoras,
    semanas,
    meses,
  };
}
