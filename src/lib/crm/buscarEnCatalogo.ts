/**
 * Encontrar en un catálogo lo que escribió una pauta.
 *
 * ============================================================================
 * EL PROBLEMA
 * ============================================================================
 *
 * El formulario dice «Pastelería Saludable» y en el catálogo el programa se
 * llama «Curso corto Pastelería Saludable». Son el mismo, y una comparación
 * exacta no los junta. Quien armó el anuncio escribió lo que le pareció; nadie
 * copió el nombre del CRM.
 *
 * ============================================================================
 * Y EL RIESGO, QUE ES MAYOR
 * ============================================================================
 *
 * Adivinar mal pone en la ficha un programa que la persona no pidió, y a un
 * campo que se llenó solo nadie lo revisa. Un hueco se nota y se completa
 * mirando el hilo; un dato equivocado se propaga a los reportes.
 *
 * Por eso esto es deliberadamente cobarde:
 *
 *   SÓLO SI ES UNO      Con dos candidatos no elige ninguno. «Pastelería» no
 *                       puede decidir entre «Pastelería Saludable» y
 *                       «Pastelería Francesa», así que no decide.
 *
 *   SÓLO SI ES LARGO    Menos de cuatro letras no busca por parecido. «Noe»
 *                       aparece dentro de demasiadas cosas.
 *
 * Devuelve null cuando no está seguro, y null significa que el campo queda
 * vacío para que lo llene la asesora. Que es exactamente lo que pasaba antes,
 * o sea: no se pierde nada por no adivinar.
 */

/** Sin tildes, sin mayúsculas y sin espacios de más. */
const plano = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface DelCatalogo {
  id: number;
  nombre: string;
}

/** Cuántas letras hace falta tener para buscar por parecido. */
const MINIMO = 4;

/**
 * El único que corresponde, o null.
 *
 * Primero busca el nombre igual; si no hay, el único que lo contenga —o al
 * revés—. «Único» es la palabra importante: con más de uno devuelve null.
 */
export function cualEsDelCatalogo(
  buscado: string | null | undefined,
  catalogo: readonly DelCatalogo[],
): number | null {
  const q = plano(buscado ?? "");
  if (q === "") return null;

  const iguales = catalogo.filter((c) => plano(c.nombre) === q);
  if (iguales.length === 1) return iguales[0].id;
  /*
   * Dos entradas del catálogo con el MISMO nombre: no se elige ninguna.
   *
   * Pasa cuando un programa se cargó dos veces. Elegir la primera pondría el
   * lead en la copia equivocada la mitad de las veces, y sin ninguna señal.
   */
  if (iguales.length > 1) return null;

  if (q.length < MINIMO) return null;

  const parecidos = catalogo.filter((c) => {
    const n = plano(c.nombre);
    return n.length >= MINIMO && (n.includes(q) || q.includes(n));
  });

  return parecidos.length === 1 ? parecidos[0].id : null;
}
