/**
 * Recordatorios que nacen de lo que se escribe en la bitácora.
 *
 * ------------------------------------------------------------------------
 * QUÉ RESUELVE
 * ------------------------------------------------------------------------
 *
 * El asesor cuelga el teléfono y anota lo que pasó. Ahí queda dicho cuándo
 * hay que volver a llamar —«me dijo que le marque el 15 de cada mes»— y ahí
 * se queda: dentro de un párrafo que nadie vuelve a leer hasta que el cliente
 * se enfría. Anotar y agendar terminan siendo dos trabajos, y el segundo es el
 * que se salta cuando hay fila en el stand.
 *
 * Esto lee la nota mientras se guarda. Si dice «seguimiento de pago» o
 * «seguimiento de cierre», saca la fecha del propio texto y arma el
 * recordatorio solo.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ NO ADIVINA MÁS DE LA CUENTA
 * ------------------------------------------------------------------------
 *
 * Hacen falta las dos cosas: la frase y —ojalá— una fecha. La frase es la que
 * pone el asesor a propósito, y es lo que separa «anoté lo que hablamos» de
 * «esto hay que volver a mirarlo». Sin ese freno, cualquier nota que
 * mencionara un día de paso —«me contó que viaja el 20»— crearía un
 * recordatorio que nadie pidió, y una lista con basura se deja de leer entera.
 *
 * Todo lo de este archivo es cálculo puro sobre texto: no toca la base ni
 * conoce al usuario. Eso lo hace probable línea por línea, que es lo que hay
 * que poder hacer cuando el resultado es «te llamo el día equivocado».
 */

import type { Urgencia } from "@/lib/recordatorios";

/**
 * De qué es el seguimiento.
 *
 * Los dos primeros los pone el asesor escribiendo la frase en una nota. El
 * tercero no sale de ninguna nota: lo deja el CRM cuando alguien marca un lead
 * como perdido por falta de interés, para volver a escribirle más adelante.
 */
export type TipoSeguimiento = "pago" | "cierre" | "reactivacion" | "recuperacion";

/** Cuándo hay que volver: una vez, o el mismo día de cada mes. */
export type Cuando =
  | { clase: "fecha"; fecha: string }
  | { clase: "mensual"; dia: number; hasta: number | null };

export interface Detectado {
  tipo: TipoSeguimiento;
  /** La frase tal como quedó escrita, para poder mostrar lo que se entendió. */
  frase: string;
  /**
   * Cuándo volver. Nulo cuando la nota pide seguimiento pero no dice cuándo:
   * el recordatorio se crea igual, para hoy. Callarse sería peor —el asesor
   * escribió la frase creyendo que quedaba agendado— y para eso está el aviso
   * de lo que se entendió.
   */
  cuando: Cuando | null;
  /** El primer día en que hay que volver, en formato YYYY-MM-DD. */
  proxima: string;
}

// --------------------------------------------------------------- normalizar

/**
 * Sin tildes, sin mayúsculas y sin espacios de más.
 *
 * Las notas se escriben rápido y a una mano: «Seguimiento De Pago», «mañana»,
 * «manana». Comparar contra una sola forma es la diferencia entre una función
 * que anda siempre y una que anda cuando el asesor escribe con cuidado.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------- fechas

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** «setiembre» se escribe tanto como «septiembre». */
const MES_ALIAS: Record<string, number> = { setiembre: 8 };

const DIAS_SEMANA = [
  "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado",
];

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, treinta: 30,
};

/**
 * El día de hoy en El Salvador, no en el reloj del servidor.
 *
 * El CRM corre en Netlify, que trabaja en UTC. A las siete de la tarde de un
 * martes en San Salvador allá ya es miércoles, y una nota que dice «mañana»
 * quedaría agendada para el jueves. El país no cambia de horario en todo el
 * año, así que alcanza con restar las seis horas: no hace falta arrastrar una
 * biblioteca de zonas horarias para esto.
 */
export function hoyEnSalvador(ahora: Date = new Date()): string {
  const d = new Date(ahora.getTime() - 6 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** Partir un YYYY-MM-DD sin que la zona horaria lo corra un día. */
const partes = (iso: string): [number, number, number] => {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
};

const ceroIzq = (n: number) => String(n).padStart(2, "0");

const armar = (a: number, m: number, d: number) => `${a}-${ceroIzq(m)}-${ceroIzq(d)}`;

/** Cuántos días tiene un mes, contando febrero de año bisiesto. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Sumar días a una fecha en formato YYYY-MM-DD.
 *
 * Se hace en UTC a propósito: sumar sobre una fecha local cruza el cambio de
 * día y devuelve el 14 cuando se pidió el 15.
 */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/** Diferencia en días de calendario. Negativa si `fecha` ya pasó. */
export function diasEntre(fecha: string, desde: string): number {
  const [a1, m1, d1] = partes(fecha);
  const [a2, m2, d2] = partes(desde);
  return Math.round(
    (Date.UTC(a1, m1 - 1, d1) - Date.UTC(a2, m2 - 1, d2)) / 86_400_000,
  );
}

/**
 * El día `dia` de este mes o del siguiente, lo que venga primero sin haber
 * pasado.
 *
 * El recorte del final es por los meses cortos: quien pide «el 31 de cada
 * mes» en febrero espera que lo llamen el 28, no que ese mes no pase nada.
 */
export function proximoDiaDelMes(dia: number, hoy: string): string {
  const [a, m, d] = partes(hoy);
  const enEste = Math.min(dia, diasDelMes(a, m));
  if (enEste >= d) return armar(a, m, enEste);

  const sigMes = m === 12 ? 1 : m + 1;
  const sigAnio = m === 12 ? a + 1 : a;
  return armar(sigAnio, sigMes, Math.min(dia, diasDelMes(sigAnio, sigMes)));
}

/** El mes que viene, para cuando el asesor marca uno mensual como atendido. */
export function siguienteMes(dia: number, desde: string): string {
  const [a, m] = partes(desde);
  const sigMes = m === 12 ? 1 : m + 1;
  const sigAnio = m === 12 ? a + 1 : a;
  return armar(sigAnio, sigMes, Math.min(dia, diasDelMes(sigAnio, sigMes)));
}

/**
 * Una fecha de día y mes, empujada al año que corresponde.
 *
 * Quien en octubre escribe «el 5 de marzo» habla del marzo que viene, no de
 * uno que ya pasó. Sin este empujón el recordatorio nacería vencido y
 * aparecería en rojo el mismo día en que se creó.
 */
function conAnioRazonable(dia: number, mes: number, hoy: string): string | null {
  const [a] = partes(hoy);
  if (mes < 1 || mes > 12) return null;
  if (dia < 1 || dia > diasDelMes(a, mes)) return null;

  const esteAnio = armar(a, mes, dia);
  if (diasEntre(esteAnio, hoy) >= 0) return esteAnio;

  const sig = a + 1;
  if (dia > diasDelMes(sig, mes)) return null;
  return armar(sig, mes, dia);
}

// ------------------------------------------------------------- la búsqueda

/**
 * Las formas de decir cuándo, de la más específica a la más general.
 *
 * El orden importa y no es un detalle de estilo: «del 15 al 30 de cada mes»
 * contiene un «30 de cada mes» adentro. Si la regla suelta se probara primero,
 * el rango se leería como un mensual del 30 y se perdería justo la mitad que
 * el asesor quiso decir.
 */
function buscarCuando(t: string, hoy: string): Cuando | null {
  // ------------------------------------------------------ rangos mensuales
  const rango =
    /\bdel? (\d{1,2}) (?:al|hasta el) (\d{1,2}) de cada mes\b/.exec(t) ??
    /\b(\d{1,2}) de cada mes (?:al|hasta el) (\d{1,2})\b/.exec(t);
  if (rango) {
    const dia = Number(rango[1]);
    const hasta = Number(rango[2]);
    if (dia >= 1 && dia <= 31 && hasta >= 1 && hasta <= 31) {
      return { clase: "mensual", dia, hasta };
    }
  }

  // ------------------------------------------------------------- mensuales
  const mensual =
    /\b(?:el|los|cada|todos los) (\d{1,2}) de cada mes\b/.exec(t) ??
    /\bcada mes (?:el|los) (\d{1,2})\b/.exec(t) ??
    /\b(\d{1,2}) de cada mes\b/.exec(t) ??
    /\btodos los (\d{1,2})\b/.exec(t);
  if (mensual) {
    const dia = Number(mensual[1]);
    if (dia >= 1 && dia <= 31) return { clase: "mensual", dia, hasta: null };
  }

  // ------------------------------------------------- día y mes con nombre
  const conMes = /\b(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?\b/.exec(t);
  if (conMes) {
    const nombre = conMes[2];
    const mes = MES_ALIAS[nombre] ?? MESES.indexOf(nombre);
    if (mes >= 0) {
      const dia = Number(conMes[1]);
      const anio = conMes[3] ? Number(conMes[3]) : null;
      const fecha = anio
        ? dia >= 1 && dia <= diasDelMes(anio, mes + 1)
          ? armar(anio, mes + 1, dia)
          : null
        : conAnioRazonable(dia, mes + 1, hoy);
      if (fecha) return { clase: "fecha", fecha };
    }
  }

  // ------------------------------------------------------ 15/09, 15-09-2026
  const barras = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
  if (barras) {
    const dia = Number(barras[1]);
    const mes = Number(barras[2]);
    const crudo = barras[3] ? Number(barras[3]) : null;
    // Un año de dos cifras es este siglo: «26» es 2026 y no 26 después de Cristo.
    const anio = crudo == null ? null : crudo < 100 ? 2000 + crudo : crudo;
    const fecha =
      anio == null
        ? conAnioRazonable(dia, mes, hoy)
        : mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes)
          ? armar(anio, mes, dia)
          : null;
    if (fecha) return { clase: "fecha", fecha };
  }

  // --------------------------------------------------------------- cercanas
  if (/\bpasado manana\b/.test(t)) return { clase: "fecha", fecha: sumarDias(hoy, 2) };
  if (/\bmanana\b/.test(t)) return { clase: "fecha", fecha: sumarDias(hoy, 1) };
  if (/\bhoy\b/.test(t)) return { clase: "fecha", fecha: hoy };

  // ------------------------------------------------------- «en tres días»
  const dentro = /\ben (\d{1,3}|[a-z]+) (dias?|semanas?|meses?|mes)\b/.exec(t);
  if (dentro) {
    const n = /^\d+$/.test(dentro[1]) ? Number(dentro[1]) : NUMEROS[dentro[1]];
    if (n && n > 0) {
      const unidad = dentro[2];
      if (unidad.startsWith("dia")) return { clase: "fecha", fecha: sumarDias(hoy, n) };
      if (unidad.startsWith("semana")) return { clase: "fecha", fecha: sumarDias(hoy, n * 7) };
      // Los meses se cuentan por calendario: «en un mes» desde el 31 de enero
      // es el 28 de febrero, no el 3 de marzo.
      const [a, m, d] = partes(hoy);
      const total = m - 1 + n;
      const anio = a + Math.floor(total / 12);
      const mes = (total % 12) + 1;
      return { clase: "fecha", fecha: armar(anio, mes, Math.min(d, diasDelMes(anio, mes))) };
    }
  }

  // -------------------------------------------------------- día de semana
  const semana = /\b(?:el |este |proximo |el proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.exec(t);
  if (semana) {
    const objetivo = DIAS_SEMANA.indexOf(semana[1]);
    const [a, m, d] = partes(hoy);
    const actual = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    // Siempre hacia adelante: escribir «el viernes» un viernes es hablar del
    // que viene. Nadie anota un recordatorio para dentro de cero días.
    const faltan = ((objetivo - actual + 7) % 7) || 7;
    return { clase: "fecha", fecha: sumarDias(hoy, faltan) };
  }

  return null;
}

/** El primer día en que hay que volver. */
export function primeraFecha(cuando: Cuando | null, hoy: string): string {
  if (cuando == null) return hoy;
  if (cuando.clase === "fecha") return cuando.fecha;
  return proximoDiaDelMes(cuando.dia, hoy);
}

/**
 * Cuántos días se dejan pasar antes de llamar a quien hay que recuperar.
 *
 * Una semana. Va como constante y no escrito en el medio de la función porque
 * es una regla del negocio, no un detalle: el día que la escuela decida que
 * son cinco o diez, se cambia acá y la prueba lo sigue solo.
 */
export const DIAS_PARA_RECUPERAR = 7;

/**
 * ¿Esta nota pide un seguimiento? Y si lo pide, ¿para cuándo?
 *
 * Devuelve nulo cuando la nota no lleva ninguna de las dos frases, que es el
 * caso de la enorme mayoría: acá lo normal es no hacer nada.
 */
export function detectarSeguimiento(nota: string, hoy: string): Detectado | null {
  const t = normalizar(nota);

  /*
   * «Recuperación» se mira primero, y se mira distinto.
   *
   * Las otras dos son frases con fecha adentro —«seguimiento de pago el 15»—.
   * Esta es una palabra sola: el asesor escribe «recuperación» en la nota y lo
   * que quiere decir es «volver a este dentro de una semana». No hay fecha que
   * leer, así que no se busca ninguna.
   *
   * Una semana y no menos porque recuperar es volver a alguien que se enfrió;
   * llamarlo al otro día es demasiado pronto y termina en el mismo «no».
   *
   * `normalizar` ya sacó tildes y mayúsculas, así que esto atrapa
   * «RECUPERACIÓN», «Recuperacion» y «recuperación» por igual.
   */
  if (/\brecuperacion(es)?\b/.test(t)) {
    const fecha = sumarDias(hoy, DIAS_PARA_RECUPERAR);
    return {
      tipo: "recuperacion",
      frase: "recuperación",
      cuando: { clase: "fecha", fecha },
      proxima: fecha,
    };
  }

  const frase = /\bseguimiento de (pago|cierre)\b/.exec(t);
  if (!frase) return null;

  const tipo = frase[1] as TipoSeguimiento;
  const cuando = buscarCuando(t, hoy);

  return {
    tipo,
    frase: frase[0],
    cuando,
    proxima: primeraFecha(cuando, hoy),
  };
}

// -------------------------------------------------------------- lo que se lee

/** El nombre del recordatorio. */
export const tituloDe = (tipo: TipoSeguimiento): string =>
  tipo === "pago"
    ? "Seguimiento de pago"
    : tipo === "cierre"
      ? "Seguimiento de cierre"
      : tipo === "recuperacion"
        ? "Llamar para recuperar"
        : "Volver a escribirle";

/** El rótulo corto, el de la pastilla en la lista. */
export const rotuloDe = (tipo: TipoSeguimiento): string =>
  tipo === "pago"
    ? "Pago"
    : tipo === "cierre"
      ? "Cierre"
      : tipo === "recuperacion"
        ? "Recuperación"
        : "Reactivación";

/**
 * Lo que la nota decía, recortado.
 *
 * El recordatorio se llama según la nota, así que tiene que traerse el texto:
 * «Seguimiento de pago» a secas no le dice al asesor qué habían quedado. Se
 * corta porque en la lista va una línea, no un párrafo.
 */
export function detalleDe(nota: string, tope = 160): string {
  const limpio = nota.replace(/\s+/g, " ").trim();
  if (limpio.length <= tope) return limpio;
  // Se corta en el último espacio para no partir una palabra por la mitad.
  const cortado = limpio.slice(0, tope);
  const espacio = cortado.lastIndexOf(" ");
  return (espacio > tope * 0.6 ? cortado.slice(0, espacio) : cortado) + "…";
}

const DIA_MES = (d: number) => `el ${d} de cada mes`;

/** Cómo se lee la repetición: «el 15 de cada mes», «una sola vez». */
export function comoSeRepite(cuando: Cuando | null): string {
  if (cuando == null) return "sin fecha en la nota";
  if (cuando.clase === "fecha") return "una sola vez";
  if (cuando.hasta == null) return DIA_MES(cuando.dia);
  return `del ${cuando.dia} al ${cuando.hasta} de cada mes`;
}

/**
 * La frase de confirmación que ve el asesor al guardar la nota.
 *
 * Es la parte que sostiene todo lo demás. Un lector automático que acierta
 * nueve de cada diez veces sólo sirve si el asesor puede ver cuál fue la
 * décima en el momento de escribirla, cuando todavía se acuerda de qué quiso
 * decir y le cuesta un segundo corregirlo.
 */
export function loQueSeEntendio(d: Detectado, comoFecha: (iso: string) => string): string {
  const que = tituloDe(d.tipo);

  /*
   * La recuperación se dice con sus propias palabras.
   *
   * Con la frase general saldría «Llamar para recuperar anotado para el 3 de
   * septiembre», que se entiende a medias. Acá conviene decir además cuánto
   * falta: es lo que le confirma al asesor que el CRM entendió «en una
   * semana» y no otra cosa.
   */
  if (d.tipo === "recuperacion") {
    return `Recuperación anotada: llamalo el ${comoFecha(d.proxima)}, en una semana.`;
  }

  if (d.cuando == null) {
    return `${que} anotado para hoy: la nota no decía para cuándo.`;
  }
  if (d.cuando.clase === "fecha") {
    return `${que} anotado para el ${comoFecha(d.proxima)}.`;
  }
  const ventana = d.cuando.hasta == null ? "" : ` (hasta el ${d.cuando.hasta})`;
  return `${que} ${DIA_MES(d.cuando.dia)}${ventana}. El próximo, el ${comoFecha(d.proxima)}.`;
}

// ------------------------------------------------------- lo que ve la pantalla

/** Un seguimiento pendiente, ya con los datos de la ficha a la que pertenece. */
export interface Seguimiento {
  id: number;
  oportunidadId: number;
  tipo: TipoSeguimiento;
  detalle: string;
  /** El día en que hay que volver, YYYY-MM-DD. */
  proxima: string;
  /** Puesto sólo si se repite todos los meses. */
  diaDelMes: number | null;
  /** El otro extremo de la ventana mensual, si la nota daba un rango. */
  diaHasta: number | null;
  codigo: string;
  cliente: string;
  telefono: string | null;
  vendedorId: number | null;
  vendedor: string | null;
  producto: string | null;
}

export interface SeguimientoPendiente {
  seguimiento: Seguimiento;
  urgencia: Urgencia;
  /** Negativo si ya pasó el día. */
  diasRestantes: number;
}

/** A partir de cuántos días se considera que apura. El mismo criterio que las reservas. */
const APURA = 3;

/**
 * La lista ordenada: primero lo que ya se pasó.
 *
 * Los que faltan mucho no se sacan —el módulo los muestra igual, para poder
 * ver la agenda completa de un asesor— pero quedan al final, que es donde se
 * miran cuando se los busca a propósito.
 */
export function pendientesDe(
  lista: readonly Seguimiento[],
  hoy: string,
): SeguimientoPendiente[] {
  return lista
    .map((s): SeguimientoPendiente => {
      const dias = diasEntre(s.proxima, hoy);
      return {
        seguimiento: s,
        diasRestantes: dias,
        urgencia:
          dias < 0 ? "vencido" : dias === 0 ? "hoy" : dias <= APURA ? "pronto" : "en curso",
      };
    })
    .sort((a, b) => a.diasRestantes - b.diasRestantes || a.seguimiento.id - b.seguimiento.id);
}

/** Los que ameritan interrumpir con la ventana: lo vencido y lo de hoy. */
export const seguimientosParaInterrumpir = (
  lista: readonly SeguimientoPendiente[],
): SeguimientoPendiente[] =>
  lista.filter((p) => p.urgencia === "vencido" || p.urgencia === "hoy");

/** Los que cuentan para el número del reloj: se suma lo que vence pronto. */
export const seguimientosPorAtender = (
  lista: readonly SeguimientoPendiente[],
): SeguimientoPendiente[] => lista.filter((p) => p.urgencia !== "en curso");

/** Cómo se lee el plazo, con las mismas palabras que las reservas. */
export function comoSeLeeSeguimiento(p: SeguimientoPendiente): string {
  const d = p.diasRestantes;
  if (d < 0) return d === -1 ? "Era ayer" : `Era hace ${-d} días`;
  if (d === 0) return "Es hoy";
  if (d === 1) return "Es mañana";
  return `En ${d} días`;
}

/**
 * La línea que describe el seguimiento.
 *
 * Casi siempre es la nota tal cual, porque la nota ya empieza con «seguimiento
 * de pago»: eso es lo que la convirtió en recordatorio. Poner el rótulo
 * delante en ese caso deja «Seguimiento de pago · Seguimiento de pago: quedó
 * de abonar…», que es ruido. El rótulo se agrega sólo cuando la frase quedó
 * más adentro del texto y la línea sola no dice de qué es.
 */
export function resumenDe(s: Seguimiento): string {
  const rotulo = tituloDe(s.tipo);
  if (!s.detalle) return rotulo;
  return normalizar(s.detalle).startsWith(normalizar(rotulo))
    ? s.detalle
    : `${rotulo} · ${s.detalle}`;
}

/** La repetición de un seguimiento ya guardado, para mostrarla en la lista. */
export const repeticionDe = (s: Seguimiento): string =>
  s.diaDelMes == null
    ? "una sola vez"
    : s.diaHasta == null
      ? DIA_MES(s.diaDelMes)
      : `del ${s.diaDelMes} al ${s.diaHasta} de cada mes`;
