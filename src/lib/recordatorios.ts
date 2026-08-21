import type { Oportunidad } from "@/lib/types";

/**
 * El recordatorio de la reserva.
 *
 * La regla del negocio: quien deja un anticipo para apartar el cupo tiene
 * quince días para completar el pago. Pasado eso el cupo se libera, así que lo
 * que hay que hacer es llamarlo antes, no enterarse después.
 *
 * Todo esto es cálculo puro sobre lo que ya está en pantalla. No hay una
 * consulta aparte de recordatorios: son las mismas oportunidades, miradas por
 * la fecha del anticipo. Eso además hace que un asesor vea recordatorios sólo
 * de sus fichas sin escribir una línea para conseguirlo —la base ya le manda
 * nada más las suyas—, y que la gerencia vea los del equipo por el mismo
 * motivo.
 */

/** Los días que tiene el cliente para completar el pago. */
export const PLAZO_DIAS = 15;

/** A partir de cuántos días restantes se considera que apura. */
const APURA = 3;

export type Urgencia =
  /** Se pasó el plazo. */
  | "vencido"
  /** Vence hoy. */
  | "hoy"
  /** Quedan tres días o menos. */
  | "pronto"
  /** Todavía hay tiempo. */
  | "en curso"
  /** Tiene anticipo pero nadie sabe de cuándo: no se puede contar el plazo. */
  | "sin fecha";

export interface Recordatorio {
  oportunidad: Oportunidad;
  urgencia: Urgencia;
  /** Cuándo se cumplen los quince días. Nulo si no se sabe cuándo se reservó. */
  vence: Date | null;
  /** Negativo si ya se pasó. Nulo si no hay fecha. */
  diasRestantes: number | null;
  /** Está pospuesto hasta después de ahora: no molesta, pero sigue en la lista. */
  pospuesto: boolean;
}

/** Cuándo se cumple el plazo de un anticipo. */
export function vencimiento(reservaEn: string | null): Date | null {
  if (!reservaEn) return null;
  const d = new Date(reservaEn);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + PLAZO_DIAS);
  return d;
}

/**
 * Cuántos días faltan, contando días de calendario y no de veinticuatro horas.
 *
 * Importa más de lo que parece: una reserva de las nueve de la mañana y otra
 * de las once de la noche del mismo día vencen el mismo día, y contando por
 * horas una diría «faltan 2» y la otra «falta 1». La gente cuenta en días, y
 * el aviso tiene que decir lo mismo que diría un calendario colgado en la
 * pared.
 */
export function diasHasta(vence: Date, hoy: Date): number {
  const aMedianoche = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((aMedianoche(vence) - aMedianoche(hoy)) / 86_400_000);
}

const urgenciaDe = (dias: number): Urgencia =>
  dias < 0 ? "vencido" : dias === 0 ? "hoy" : dias <= APURA ? "pronto" : "en curso";

/**
 * ¿Esta ficha necesita recordatorio?
 *
 * Sólo las que tienen anticipo, y sólo mientras el pago siga pendiente. Se
 * excluyen dos cosas:
 *
 * - Las cerradas —ganadas o perdidas—: en las primeras ya se pagó, en las
 *   segundas no hay a quién llamar.
 * - Las que ya tienen venta cerrada anotada, aunque el estado se haya quedado
 *   sin actualizar. Recordarle a un asesor que cobre algo que ya cobró es la
 *   manera más rápida de que deje de leer los recordatorios.
 */
export function necesitaRecordatorio(o: Oportunidad): boolean {
  if ((o.reserva ?? 0) <= 0) return false;
  if (o.esFinal) return false;
  if ((o.cerrada ?? 0) > 0) return false;
  return true;
}

/** El orden en que se muestran: primero lo que ya se pasó. */
const PESO: Record<Urgencia, number> = {
  vencido: 0,
  hoy: 1,
  pronto: 2,
  "en curso": 3,
  "sin fecha": 4,
};

/**
 * Arma la lista de recordatorios, ya ordenada.
 *
 * `pospuestos` mapea id de oportunidad a hasta cuándo la persona pidió no
 * verla. Los pospuestos no se sacan de la lista: se marcan. El módulo los
 * muestra igual —alguien que pospuso diez avisos tiene que poder ver los diez—
 * y lo que se calla es el aviso emergente, que es lo que interrumpe.
 */
export function recordatoriosDe(
  oportunidades: readonly Oportunidad[],
  hoy: Date,
  pospuestos: Readonly<Record<number, string>> = {},
): Recordatorio[] {
  const lista = oportunidades.filter(necesitaRecordatorio).map((o): Recordatorio => {
    const vence = vencimiento(o.reservaEn);
    const dias = vence ? diasHasta(vence, hoy) : null;
    const hasta = pospuestos[o.id];

    return {
      oportunidad: o,
      vence,
      diasRestantes: dias,
      urgencia: dias == null ? "sin fecha" : urgenciaDe(dias),
      pospuesto: hasta != null && new Date(hasta) > hoy,
    };
  });

  return lista.sort((a, b) => {
    const p = PESO[a.urgencia] - PESO[b.urgencia];
    if (p !== 0) return p;
    // Dentro del mismo grupo, lo que vence antes primero. Los «sin fecha» no
    // tienen con qué compararse, así que se desempatan por id para que la
    // lista no baile entre un dibujado y el siguiente.
    if (a.vence && b.vence) return a.vence.getTime() - b.vence.getTime();
    return b.oportunidad.id - a.oportunidad.id;
  });
}

/**
 * Los que ameritan interrumpir con una ventana.
 *
 * Vencidos y los de hoy, y sólo los que no están pospuestos. Los «pronto» no
 * entran: quedan tres días, alcanza con el número en el reloj de la cabecera.
 * Una ventana que salta por algo que no es de hoy enseña a cerrarla sin leer.
 */
export const paraInterrumpir = (lista: readonly Recordatorio[]): Recordatorio[] =>
  lista.filter((r) => !r.pospuesto && (r.urgencia === "vencido" || r.urgencia === "hoy"));

/**
 * Los que cuentan para el número del reloj.
 *
 * Acá sí entran los «pronto»: el reloj no interrumpe, informa, y saber que hay
 * cuatro por vencer esta semana es justamente para lo que se lo mira. Los
 * pospuestos no cuentan —la persona ya dijo que los mira más adelante— y los
 * «sin fecha» tampoco, porque no se sabe si urgen.
 */
export const porAtender = (lista: readonly Recordatorio[]): Recordatorio[] =>
  lista.filter(
    (r) => !r.pospuesto && r.urgencia !== "en curso" && r.urgencia !== "sin fecha",
  );

/** Cómo se lee el plazo en pantalla. */
export function comoSeLee(r: Recordatorio): string {
  if (r.diasRestantes == null) return "Sin fecha de reserva";
  const d = r.diasRestantes;
  if (d < 0) return d === -1 ? "Venció ayer" : `Venció hace ${-d} días`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `Vencen en ${d} días`;
}
