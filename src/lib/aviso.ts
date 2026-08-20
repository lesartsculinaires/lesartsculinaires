/**
 * Qué merece un sonido y qué no.
 *
 * Por el websocket entra todo lo que cambia en la base: cada fila de una
 * importación, cada estado de entrega que devuelve Meta, cada vez que alguien
 * guarda una ficha. Sonar en todo eso sería un ruido constante, y un aviso que
 * suena siempre se termina apagando —o peor, se ignora, que es lo mismo pero
 * sin poder volver a prenderlo.
 *
 * Así que acá se decide, y se decide poco: suena un mensaje de un cliente, y
 * suena que alguien más mueva un lead. Nada más.
 *
 * Es una función pura a propósito. La regla de «qué es importante» es la parte
 * que se va a discutir y cambiar con el tiempo; teniéndola separada del audio
 * se puede leer y comprobar sin navegador.
 */

/** Los dos sonidos que existen. Distintos entre sí para no tener que mirar. */
export type Aviso = "mensaje" | "cambio";

/** Un aviso del websocket, ya sin la envoltura de Supabase. */
export interface CambioEnVivo {
  tabla: string;
  evento: "INSERT" | "UPDATE" | "DELETE";
  /** La fila nueva. En los borrados viene vacía. */
  fila: Record<string, unknown> | null;
}

/**
 * Los campos de una oportunidad que, al cambiar, valen un aviso.
 *
 * Etapa y dueño mueven el trabajo de alguien: si a media mañana una ficha pasó
 * a Negociación o cambió de asesor, quien la venía atendiendo tiene que
 * enterarse sin ir a buscarlo. El resto —el teléfono corregido, una nota, el
 * valor ajustado— se ve igual en la pantalla, que se refresca sola, y no
 * justifica interrumpir.
 */
const CAMPOS_QUE_IMPORTAN = ["etapa_id", "vendedor_id"];

/**
 * ¿Este cambio suena? ¿Y cómo?
 *
 * `yo` es el id de quien está mirando. Sirve para lo más importante de acá: no
 * sonarle a alguien por lo que acaba de hacer él mismo. Arrastrar una tarjeta
 * en el Pipeline y que la computadora conteste con un campanazo es una
 * pequeña burla, y pasaría en cada movimiento.
 *
 * Cuando `actor_id` viene nulo no es un descuido: significa que escribió una
 * integración —n8n cargando un lead, el webhook de WhatsApp— y ahí el aviso es
 * justamente lo que se quiere, porque no hay nadie mirando esa ventana.
 *
 * Lo que no hace falta comprobar acá es de quién es la ficha. Los avisos del
 * websocket ya vienen filtrados por las mismas políticas que filtran las
 * pantallas, así que a un asesor no le llega —ni suena— nada de un lead
 * ajeno.
 */
export function queSuena(c: CambioEnVivo, yo: string | null): Aviso | null {
  const fila = c.fila;
  if (!fila || c.evento === "DELETE") return null;

  // ------------------------------------------------- un mensaje de WhatsApp
  if (c.tabla === "mensajes") {
    // Sólo los que llegan. Los salientes también insertan fila —los escribe
    // el propio CRM al responder— y sonarían al apretar Enter.
    if (c.evento !== "INSERT") return null;
    return fila.direccion === "entrante" ? "mensaje" : null;
  }

  // ------------------------------------------------------ un cambio del CRM
  //
  // Se escucha `actividad` y no las tablas de verdad porque es la única que
  // guarda quién hizo cada cosa. Sin eso no habría forma de callar los
  // movimientos propios, que son la mayoría de los que uno ve.
  if (c.tabla === "actividad") {
    if (c.evento !== "INSERT") return null;

    const actor = fila.actor_id;
    if (typeof actor === "string" && yo != null && actor === yo) return null;

    if (fila.entidad !== "oportunidad") return null;
    if (fila.accion === "creo") return "cambio";
    if (fila.accion !== "edito") return null;

    const campos = fila.campos;
    if (campos == null || typeof campos !== "object") return null;
    return CAMPOS_QUE_IMPORTAN.some((k) => k in campos) ? "cambio" : null;
  }

  return null;
}

/**
 * Cuánto hay que esperar antes de volver a tocar el mismo sonido.
 *
 * Diez mensajes seguidos de la misma persona son un aviso, no diez. Y una
 * importación de quinientos contactos inserta quinientas filas en unos
 * segundos: sin esta pausa serían quinientos campanazos.
 */
export const PAUSA_MS = 2500;

/**
 * Cuánto se espera para ver si viene algo más importante junto.
 *
 * Un cliente que escribe por primera vez dispara dos avisos en el mismo
 * instante: el mensaje, y el lead que el webhook acaba de crear con su número.
 * Sin esta pausa se oirían los dos sonidos encimados. Un cuarto de segundo no
 * se nota y alcanza para quedarse con uno solo.
 */
export const JUNTAR_MS = 250;

/**
 * Si los dos caen juntos, gana el mensaje.
 *
 * Un cliente escribiendo es lo único que pide una respuesta ahora; que un lead
 * haya cambiado de etapa puede esperar a que uno mire la pantalla.
 */
export const PRIORIDAD: Record<Aviso, number> = { mensaje: 2, cambio: 1 };
