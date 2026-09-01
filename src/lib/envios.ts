/**
 * Las reglas de un envío masivo, sin base de datos ni pantalla.
 *
 * Viven acá para poder probarlas solas: son las que deciden a quién NO se le
 * manda, y equivocarse ahí no da un error —da un mensaje enviado a alguien que
 * pidió que no le escriban, que es exactamente lo que hace que Meta le baje la
 * calificación al número de la escuela—.
 */

import { tituloEspanol } from "@/lib/texto";

/**
 * Lo que se escribe en un hueco de la plantilla.
 *
 * Dos formas, y la segunda es la que hace que un envío masivo no se lea como
 * un envío masivo: el mismo hueco lleva un texto fijo para todos, o el nombre
 * de cada quien.
 */
export type Valor =
  | { de: "texto"; texto: string }
  | { de: "nombre" };

/** Cómo se ve un valor en la pantalla de armado. */
export const comoSeLlama = (v: Valor): string =>
  v.de === "nombre" ? "el nombre del cliente" : v.texto;

/**
 * El nombre de pila, para poder saludar.
 *
 * «Marco Tulio Castellanos Orellana» saludado entero suena a carta del banco.
 * Se toma la primera palabra, que es lo que uno diría en persona.
 *
 * Se acomoda el caso porque las bases vienen en mayúsculas: «MARCO» gritando
 * al principio de un mensaje se lee como un error, y es lo primero que ve
 * quien lo recibe.
 */
export function nombreDePila(nombre: string | null | undefined): string {
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  return tituloEspanol(limpio.split(" ")[0]);
}

/** Los valores ya resueltos para una persona concreta. */
export const valoresPara = (
  valores: readonly Valor[],
  nombre: string | null,
): string[] =>
  valores.map((v) => (v.de === "nombre" ? nombreDePila(nombre) : v.texto));

/** Alguien a quien se podría mandar. */
export interface Candidato {
  clienteId: number;
  oportunidadId: number | null;
  nombre: string | null;
  telefono: string | null;
  noMolestar: boolean;
}

/** Por qué alguien queda afuera. */
export type Descarte =
  | "sin_telefono"
  | "no_molestar"
  | "repetido"
  | "reciente";

export const POR_QUE: Record<Descarte, string> = {
  sin_telefono: "sin teléfono",
  no_molestar: "pidió que no le escriban",
  repetido: "estaba dos veces en la selección",
  reciente: "ya recibió un envío hace poco",
};

export interface Reparto {
  /** A quiénes se les va a mandar, sin repetir. */
  van: Candidato[];
  /** Quiénes quedan afuera y por qué. */
  fuera: { candidato: Candidato; porque: Descarte }[];
}

/**
 * Quién entra en el envío y quién no.
 *
 * ============================================================================
 * EL ORDEN DE LAS REGLAS IMPORTA
 * ============================================================================
 *
 * Se mira primero «no molestar» y después el resto. Alguien que pidió que no
 * le escriban tiene que aparecer en el resumen POR ESA RAZÓN, aunque además no
 * tenga teléfono: si saliera como «sin teléfono», cargarle el número mañana lo
 * volvería a meter en la lista.
 *
 * ============================================================================
 * POR QUÉ SE DEVUELVE QUIÉN QUEDÓ AFUERA Y NO SÓLO CUÁNTOS
 * ============================================================================
 *
 * Porque «se van a mandar 240 de 300» es un número que no se puede revisar.
 * Con el detalle, quien manda ve que faltan sesenta por no tener teléfono y
 * puede decidir si eso está bien o si la base se cargó mal.
 */
export function repartir(
  candidatos: readonly Candidato[],
  /** Clientes a los que ya se les mandó algo hace poco. */
  recientes: ReadonlySet<number> = new Set(),
): Reparto {
  const van: Candidato[] = [];
  const fuera: { candidato: Candidato; porque: Descarte }[] = [];
  const vistos = new Set<number>();

  for (const c of candidatos) {
    if (c.noMolestar) {
      fuera.push({ candidato: c, porque: "no_molestar" });
      continue;
    }
    // Una persona puede tener tres leads, y seleccionar los tres es lo normal.
    // Mandarle tres veces el mismo mensaje, no.
    if (vistos.has(c.clienteId)) {
      fuera.push({ candidato: c, porque: "repetido" });
      continue;
    }
    if (!telefonoUtil(c.telefono)) {
      vistos.add(c.clienteId);
      fuera.push({ candidato: c, porque: "sin_telefono" });
      continue;
    }
    if (recientes.has(c.clienteId)) {
      vistos.add(c.clienteId);
      fuera.push({ candidato: c, porque: "reciente" });
      continue;
    }

    vistos.add(c.clienteId);
    van.push(c);
  }

  return { van, fuera };
}

/**
 * ¿Este teléfono sirve para mandarle a alguien?
 *
 * Ocho dígitos es el largo de un número salvadoreño. Con menos no es un
 * teléfono: es una celda a medio llenar, y mandarlo hace que Meta devuelva un
 * error por cada uno. Muchos errores seguidos también bajan la calificación
 * del número, así que descartarlos antes no es prolijidad.
 */
export const telefonoUtil = (t: string | null | undefined): boolean =>
  String(t ?? "").replace(/\D/g, "").length >= 8;

/**
 * El número como lo quiere Meta: sólo dígitos, con código de país.
 *
 * Los teléfonos de la base están escritos de todas las formas —«7797-2598»,
 * «+503 7797 2598», «50377972598»— y Meta acepta uno solo. Los de ocho
 * dígitos son de El Salvador y les falta el 503 adelante; los que ya vienen
 * con código se dejan como están.
 */
export function paraMeta(telefono: string): string {
  const d = String(telefono).replace(/\D/g, "");
  if (d.length === 8) return `503${d}`;
  // Un 0 o dos delante son la forma vieja de marcar internacional.
  return d.replace(/^0+/, "");
}

/**
 * Cuántos se pueden mandar todavía hoy.
 *
 * Meta le pone a cada número un tope de destinatarios únicos cada 24 horas
 * —1.000, 10.000 o 100.000 según el nivel— y pasarse no da un error claro: los
 * mensajes empiezan a fallar y la calificación baja. Se deja un margen para lo
 * que salga por el chat normal, que también cuenta.
 */
export const MARGEN = 0.9;

export const cuantosQuedan = (tope: number, mandadosHoy: number): number =>
  Math.max(0, Math.floor(tope * MARGEN) - mandadosHoy);

/** Los niveles que usa Meta, para poder elegirlo en la pantalla. */
export const NIVELES = [1000, 10000, 100000] as const;
