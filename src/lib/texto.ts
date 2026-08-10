/**
 * Ayudas para escribir nombres y notas con la ortografía correcta.
 *
 * La base guarda exactamente lo que se escribe —mayúsculas, tildes y eñes
 * incluidas—; lo que falta es poder ponerlas cómodamente desde cualquier
 * teclado, y darse cuenta cuando un nombre entró mal escrito.
 */

/** Caracteres que el teclado inglés no tiene a mano. */
export const ACENTOS_MINUSCULA = ["á", "é", "í", "ó", "ú", "ñ", "ü"] as const;
export const ACENTOS_MAYUSCULA = ["Á", "É", "Í", "Ó", "Ú", "Ñ", "Ü"] as const;
/** Signos de apertura, que tampoco están en el teclado inglés. */
export const SIGNOS = ["¿", "¡"] as const;

/**
 * Partículas que van en minúscula dentro de un nombre.
 *
 * "María de los Ángeles del Valle" — capitalizar cada palabra daría "De Los
 * Ángeles Del Valle", que está mal en castellano.
 */
const PARTICULAS = new Set([
  "de", "del", "la", "las", "los", "y", "e", "da", "das", "do", "dos", "van", "von",
]);

/** Palabras que se escriben enteras en mayúscula. */
const SIGLAS = new Set(["sa", "srl", "sas", "cv", "ii", "iii", "iv"]);

/**
 * Nombre propio con la capitalización del castellano.
 *
 * La primera palabra siempre va capitalizada, aunque sea una partícula: un
 * apellido puede empezar por "De la Cruz".
 */
export function tituloEspanol(s: string): string {
  const palabras = s.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return palabras
    .map((p, i) => {
      if (SIGLAS.has(p.replace(/\./g, ""))) return p.toUpperCase();
      if (i > 0 && PARTICULAS.has(p)) return p;

      // Capitaliza también después de apóstrofo o guion: "D'Angelo",
      // "Pérez-Gómez".
      return p.replace(/(^|['’-])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase());
    })
    .join(" ");
}

/** Cómo está escrito un texto, mirando sólo sus letras. */
export type FormaEscritura = "vacio" | "mayusculas" | "minusculas" | "mixto";

export function formaDeEscritura(s: string): FormaEscritura {
  const letras = s.replace(/[^\p{L}]/gu, "");
  if (!letras) return "vacio";
  if (letras === letras.toUpperCase()) return "mayusculas";
  if (letras === letras.toLowerCase()) return "minusculas";
  return "mixto";
}

/**
 * Aviso cuando un nombre parece mal escrito, o null si está bien.
 *
 * Es una sugerencia, nunca un bloqueo: "AST SURF HOTEL" está en mayúsculas a
 * propósito, y hay nombres que legítimamente no llevan ninguna.
 */
export function revisarNombre(s: string): string | null {
  const forma = formaDeEscritura(s);
  if (forma === "mayusculas" && s.trim().length > 3) {
    return "Está todo en mayúsculas.";
  }
  if (forma === "minusculas") return "Está todo en minúsculas.";
  return null;
}

/**
 * Inserta texto en la posición del cursor.
 *
 * Devuelve el valor nuevo y dónde debe quedar el cursor: sin lo segundo, el
 * cursor salta al final y escribir un nombre con dos tildes se vuelve un
 * ejercicio de paciencia.
 */
export function insertarEnCursor(
  valor: string,
  inicio: number,
  fin: number,
  texto: string,
): { valor: string; cursor: number } {
  return {
    valor: valor.slice(0, inicio) + texto + valor.slice(fin),
    cursor: inicio + texto.length,
  };
}
