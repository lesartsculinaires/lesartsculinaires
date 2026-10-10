import type { CambioEnVivo } from "@/lib/aviso";

/**
 * Qué cambios de otras personas valen un refresco de la pantalla que se mira.
 *
 * ============================================================================
 * POR QUÉ NO TODOS
 * ============================================================================
 *
 * Cada refresco vuelve a pedir la portada entera: unas veinticinco consultas y
 * el embudo completo —2,3 MB con los 2592 leads del 10 de octubre de 2026—. Y
 * un cambio no refresca UNA pantalla: refresca TODAS las pestañas abiertas del
 * equipo a la vez. O sea que el costo crece con la gente dos veces: más gente
 * hace más cambios, y cada cambio lo pagan más pestañas.
 *
 * Los que más se repiten no le cambian nada a casi nadie. Por cada mensaje que
 * sale, WhatsApp avisa tres veces —enviado, entregado, leído— y cada aviso
 * actualiza el mensaje y su conversación: seis refrescos de todo el equipo por
 * los tildes de un mensaje. Ese 10 de octubre fueron 249 de cada uno en la
 * mañana, la mitad de todos los cambios del día.
 *
 * ============================================================================
 * LA REGLA
 * ============================================================================
 *
 * Que un mensaje o una conversación CAMBIE —no que llegue uno nuevo— sólo se
 * mira en la bandeja, que muestra los tildes, y en Envíos, que cuenta cuántos
 * llegaron. En el resto no se ve. Lo que sí se ve en todas, el globito de no
 * leídos, sube con el mensaje NUEVO, y ése sigue refrescando en todas.
 *
 * Lo que se deja de refrescar no queda viejo para siempre: el refresco
 * automático de cada minuto lo trae igual. Esto sólo evita que el equipo
 * entero vuelva a pedir el embudo por un tilde.
 */
const MIRAN_CADA_MENSAJE = new Set(["Inbox", "Envíos"]);

export function pideRefresco(c: CambioEnVivo, pantalla: string): boolean {
  const deLaBandeja = c.tabla === "mensajes" || c.tabla === "conversaciones";
  if (deLaBandeja && c.evento === "UPDATE") return MIRAN_CADA_MENSAJE.has(pantalla);
  return true;
}

/**
 * Hasta cuánto se demora, al azar, cada pestaña en refrescar.
 *
 * Sin esto, un cambio hace que todas las pestañas del equipo le pidan la
 * portada al servidor en el mismo instante —se ve en los registros: cinco y
 * seis armados de la portada dentro del mismo segundo—. Repartidos en un
 * segundo y medio, la base los atiende de a poco en vez de todos en fila
 * detrás del primero. Para quien mira no cambia nada: lo nuevo aparece un
 * instante después.
 */
export const DISPERSION_MS = 1_500;
