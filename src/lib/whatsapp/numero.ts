/**
 * Teléfonos en el formato que espera WhatsApp.
 *
 * EL PROBLEMA
 *
 * Los teléfonos de los clientes vienen de planillas y de gente escribiendo a
 * mano: «7100-2233», «+503 7100 2233», «(503) 71002233». WhatsApp quiere una
 * sola forma: dígitos, con código de país, sin nada más. Si se manda otra cosa,
 * Meta contesta que el número no tiene WhatsApp —que suena a que la persona no
 * lo usa, cuando en realidad el número estaba mal armado.
 *
 * LA DECISIÓN QUE HAY QUE VER
 *
 * Un número de ocho dígitos en El Salvador es local y le falta el 503. Uno más
 * largo casi siempre ya lo trae. Eso es una suposición, y equivocarse significa
 * escribirle a un desconocido, así que la pantalla muestra el número ya armado
 * y deja corregirlo antes de abrir el chat. Acá sólo se propone.
 */

/** El Salvador. Es de donde son casi todos los contactos de la escuela. */
export const PAIS_POR_DEFECTO = "503";

/** Cuántos dígitos tiene un número local salvadoreño. */
const LARGO_LOCAL = 8;

export interface NumeroPropuesto {
  /** Sólo dígitos, listo para Meta. Null si no se pudo armar nada usable. */
  numero: string | null;
  /** Qué se hizo, para poder decirlo en pantalla en vez de hacerlo callado. */
  nota: string | null;
}

/**
 * Propone el número internacional a partir de lo que haya guardado.
 *
 * Nunca inventa dígitos que no estaban: lo único que agrega es el código de
 * país, y sólo cuando el largo dice que falta.
 */
export function aInternacional(
  telefono: string | null | undefined,
  pais = PAIS_POR_DEFECTO,
): NumeroPropuesto {
  const digitos = (telefono ?? "").replace(/\D/g, "");

  if (!digitos) return { numero: null, nota: "Este contacto no tiene teléfono cargado." };

  // Un 00 adelante es el prefijo internacional escrito a la vieja usanza.
  const sinCeros = digitos.replace(/^00+/, "");

  if (sinCeros.length < LARGO_LOCAL) {
    return {
      numero: null,
      nota: `El teléfono guardado tiene ${sinCeros.length} dígitos: le faltan números.`,
    };
  }

  if (sinCeros.length === LARGO_LOCAL) {
    return {
      numero: `${pais}${sinCeros}`,
      nota: `Se le agregó el código de país ${pais}.`,
    };
  }

  // Ya trae código de país. El caso más común de más: alguien que escribió el
  // país dos veces («503503…»), que Meta rechazaría.
  if (sinCeros.startsWith(pais + pais)) {
    return {
      numero: sinCeros.slice(pais.length),
      nota: `Tenía el código ${pais} repetido; se quitó uno.`,
    };
  }

  if (sinCeros.length > 15) {
    return {
      numero: null,
      nota: `El teléfono guardado tiene ${sinCeros.length} dígitos: son demasiados.`,
    };
  }

  return { numero: sinCeros, nota: null };
}

/**
 * ¿Estos dos números son de la misma persona?
 *
 * Se comparan los últimos ocho dígitos, igual que hace el webhook al vincular
 * un mensaje entrante con una ficha. Comparar completo fallaría justo en el
 * caso normal: la ficha guardada sin código de país y el mensaje que llega con
 * él son la misma persona.
 */
export function mismoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").replace(/\D/g, "");
  const y = (b ?? "").replace(/\D/g, "");
  if (x.length < LARGO_LOCAL || y.length < LARGO_LOCAL) return false;
  return x.slice(-LARGO_LOCAL) === y.slice(-LARGO_LOCAL);
}

/** Para mostrarlo legible: +503 7100 2233. */
export function bonito(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (d.length <= LARGO_LOCAL) return d.replace(/(\d{4})(\d{4})/, "$1 $2");
  const pais = d.slice(0, d.length - LARGO_LOCAL);
  const local = d.slice(-LARGO_LOCAL);
  return `+${pais} ${local.replace(/(\d{4})(\d{4})/, "$1 $2")}`;
}
