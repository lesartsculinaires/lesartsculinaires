/**
 * Los hilos que cambiaron, puestos encima de la bandeja que ya está en pantalla.
 *
 * ============================================================================
 * POR QUÉ
 * ============================================================================
 *
 * Medido en el banco el 27/10/2026 con el volumen de producción (1.000 chats,
 * 3.000 leads): cada vez que entraba un mensaje —o llegaba un tilde de
 * entregado o leído— cada Inbox abierto volvía a pedir la pantalla entera,
 * 3,8 MB. Abrir un chat sin leer bajaba 15 MB. En la oficina eso es lo que el
 * equipo sentía como «el CRM se pega».
 *
 * Ahora la pestaña pide sólo los hilos que cambiaron —unos KB— y esto los
 * acomoda sobre lo que ya tenía. Lo demás de la pantalla no se toca.
 *
 * ============================================================================
 * LAS REGLAS
 * ============================================================================
 *
 *   UN HILO QUE VOLVIÓ     reemplaza al que había, con todos sus mensajes.
 *   UN HILO NUEVO          se agrega.
 *   UNO PEDIDO QUE NO      se saca: se borró, o esta persona ya no lo puede
 *   VOLVIÓ                 ver (se lo reasignaron a otra).
 *   EL ORDEN               el mismo que trae el servidor: lo más reciente
 *                          arriba, y a igual hora el id más alto.
 *
 * Cuando el servidor vuelve a dibujar la pantalla entera, el parche se tira:
 * lo que trae el servidor ya incluye todo.
 */

import type { Conversacion, Mensaje } from "@/lib/types";

/**
 * Cuántos hilos se piden de una vez, como mucho. Con más, se refresca la
 * pantalla entera: es una ráfaga, y la red de siempre la cubre mejor.
 */
export const MAX_HILOS_POR_PEDIDO = 50;

export interface ParcheBandeja {
  /** Los hilos que se pidieron, hayan vuelto o no. */
  ids: number[];
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
}

/** Junta dos parches: el más nuevo manda sobre los hilos que comparten. */
export function sumarParches(antes: ParcheBandeja | null, ahora: ParcheBandeja): ParcheBandeja {
  if (!antes) return ahora;
  const nuevos = new Set(ahora.ids);
  return {
    ids: [...new Set([...antes.ids, ...ahora.ids])],
    conversaciones: [...antes.conversaciones.filter((c) => !nuevos.has(c.id)), ...ahora.conversaciones],
    mensajes: [...antes.mensajes.filter((m) => !nuevos.has(m.conversacionId)), ...ahora.mensajes],
  };
}

const masReciente = (a: Conversacion, b: Conversacion) =>
  b.ultimoMensajeEn.localeCompare(a.ultimoMensajeEn) || b.id - a.id;

/** La bandeja con el parche puesto. Sin parche, la misma de siempre. */
export function conParche(
  conversaciones: readonly Conversacion[],
  mensajes: readonly Mensaje[],
  parche: ParcheBandeja | null,
): { conversaciones: Conversacion[]; mensajes: Mensaje[] } {
  if (!parche || parche.ids.length === 0) {
    return { conversaciones: conversaciones as Conversacion[], mensajes: mensajes as Mensaje[] };
  }
  const tocados = new Set(parche.ids);
  return {
    conversaciones: [
      ...conversaciones.filter((c) => !tocados.has(c.id)),
      ...parche.conversaciones,
    ].sort(masReciente),
    mensajes: [...mensajes.filter((m) => !tocados.has(m.conversacionId)), ...parche.mensajes],
  };
}

/**
 * Qué hilo cambió, según el aviso en vivo. Null si no se puede saber —un
 * borrado, que llega sin fila—: ahí manda el refresco de siempre.
 */
export function hiloDelAviso(tabla: string, fila: Record<string, unknown> | null): number | null {
  if (!fila) return null;
  const crudo = tabla === "mensajes" ? fila.conversacion_id : tabla === "conversaciones" ? fila.id : null;
  const n = Number(crudo);
  return Number.isFinite(n) && n > 0 ? n : null;
}
