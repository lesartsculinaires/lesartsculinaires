/**
 * Qué conversación queda pendiente de contestar.
 *
 * ============================================================================
 * POR QUÉ ESTA REGLA VIVE EN UN SOLO LUGAR
 * ============================================================================
 *
 * Porque son DOS cosas distintas las que dejan un hilo pendiente, y hay que
 * acordarse de las dos cada vez:
 *
 *   MENSAJES SIN ABRIR   `sinLeer` los cuenta: alguien escribió y nadie entró
 *                        al hilo.
 *
 *   MARCADA A MANO       `noLeida` la pone una persona que SÍ leyó y decidió
 *                        que todavía le debe algo a ese cliente. Es la que se
 *                        pierde más fácil: el hilo se ve igual que cualquier
 *                        otro y el contador dice cero.
 *
 * La bandeja ya usaba esta misma condición en tres lugares —el punto de la
 * lista, la negrita del nombre, el número por red— escrita a mano cada vez.
 * Con el filtro nuevo serían cuatro, y para cuatro copias alcanza con que una
 * se olvide de `noLeida` para que la pestaña «Pendientes» esconda justo los
 * hilos que alguien dejó marcados a propósito.
 */

/** Lo mínimo que hace falta saber de un hilo para decir si está pendiente. */
export interface HiloPendiente {
  /** Cuántos mensajes entraron sin que nadie abriera el hilo. */
  sinLeer: number;
  /** Alguien la marcó a mano para volver después. */
  noLeida: boolean;
  archivada: boolean;
}

/**
 * ¿Este hilo espera algo de nosotros?
 *
 * No mira `archivada`: archivar es una decisión aparte y quien pide «los
 * pendientes archivados» tiene derecho a verlos. Quién decide eso es la
 * pantalla, con su pestaña de archivadas.
 */
export const estaPendiente = (c: HiloPendiente): boolean => c.sinLeer > 0 || c.noLeida;

/**
 * Cuántos hilos ACTIVOS están pendientes. Es el número de la pestaña.
 *
 * Los archivados quedan afuera a propósito: se archivan para sacarlos de la
 * vista, y un número que los contara mandaría a buscar un hilo que la pestaña
 * «Activas» no muestra.
 */
export const cuantosPendientes = (hilos: readonly HiloPendiente[]): number =>
  hilos.filter((c) => !c.archivada && estaPendiente(c)).length;
