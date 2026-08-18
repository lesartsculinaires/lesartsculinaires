/**
 * A qué cliente pertenece cada fila de un lote de importación.
 *
 * Vive acá y no dentro de la acción del servidor por dos razones. La primera
 * es que un archivo `"use server"` sólo puede exportar funciones asíncronas,
 * así que un ayudante puro no tiene lugar allá. La segunda es que esto es
 * justo lo que hay que poder probar: si se equivoca, una persona entra dos
 * veces, que es el problema que toda la pantalla de importación existe para
 * evitar.
 */

/** Lo único que hace falta mirar de una fila para repartirla. */
export interface FilaConDestino {
  /** Cliente del CRM al que se suma, si ya existe. */
  unificar_con?: number | null;
  /** Filas que comparten esta clave crean UNA ficha entre todas. */
  grupo?: string | null;
}

export interface Reparto {
  /**
   * Un grupo por cada ficha nueva a crear, en orden. La posición manda: el
   * cliente que devuelva la base para el grupo 0 es el de `grupos[0]`.
   */
  grupos: string[];
  /** Para cada fila, a qué grupo va. Null si se une a un cliente existente. */
  claves: (string | null)[];
  /**
   * Índice de la fila que representa a cada grupo. Es la que aporta los datos
   * del contacto cuando se inserta la ficha.
   */
  cabeceras: number[];
}

/**
 * Reparte las filas en grupos.
 *
 * La clave de una fila sin grupo lleva su posición, para que nunca choque con
 * la de otra: sin eso, dos filas sueltas caerían en el mismo balde y entrarían
 * como una sola persona.
 */
export function repartir(filas: readonly FilaConDestino[]): Reparto {
  const grupos: string[] = [];
  const cabeceras: number[] = [];

  const claves = filas.map((f, i) => {
    if (f.unificar_con != null) return null;

    const clave = f.grupo && f.grupo.trim() ? `g:${f.grupo.trim()}` : `sola:${i}`;
    if (!grupos.includes(clave)) {
      grupos.push(clave);
      cabeceras.push(i);
    }
    return clave;
  });

  return { grupos, claves, cabeceras };
}

/**
 * Con los ids que devolvió la base, a qué cliente apunta cada fila.
 *
 * `creados[i]` es el cliente del grupo `grupos[i]`, en el mismo orden en que
 * se insertaron.
 */
export function asignarClientes(
  filas: readonly FilaConDestino[],
  reparto: Reparto,
  creados: readonly { id: number }[],
): number[] {
  const porGrupo = new Map<string, number>();
  reparto.grupos.forEach((clave, i) => porGrupo.set(clave, creados[i].id));

  return filas.map((f, i) => {
    if (f.unificar_con != null) return f.unificar_con;
    return porGrupo.get(reparto.claves[i] as string) as number;
  });
}
