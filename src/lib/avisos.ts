import type { Recordatorio } from "@/lib/recordatorios";
import type { SeguimientoPendiente } from "@/lib/seguimientos";

/**
 * Los números rojos de la barra lateral.
 *
 * ------------------------------------------------------------------------
 * QUÉ CUENTA COMO AVISO Y QUÉ NO
 * ------------------------------------------------------------------------
 *
 * Un número rojo dice una sola cosa: «acá hay algo esperándote a vos». Eso lo
 * vuelve útil o lo vuelve ruido, y la diferencia es qué se decide contar.
 *
 * La regla es: se cuenta lo que está sin atender y tiene fecha vencida o de
 * hoy. Nada más.
 *
 *   SE CUENTA        un mensaje sin leer, un recordatorio de hoy o atrasado,
 *                    un pedido de autorización sin resolver.
 *
 *   NO SE CUENTA     cuántos leads hay en el pipeline, cuántos clientes hay,
 *                    cuántos programas están cargados. Son cantidades, no
 *                    pendientes: no bajan nunca porque nadie las «atiende», y
 *                    un número rojo permanente al lado de Clientes deja de
 *                    mirarse en dos días y de paso enseña a ignorar los otros.
 *
 *   TAMPOCO          lo que vence la semana que viene. Si todo lo futuro
 *                    contara, el número nunca llegaría a cero y no habría
 *                    forma de saber si hay algo urgente.
 *
 * Por eso hay módulos sin número, y está bien que así sea: son los que no
 * tienen nada que se pueda dejar sin atender.
 */

/** Lo que hace falta saber para armar los números, sin depender de pantallas. */
export interface ParaAvisar {
  /** Mensajes de WhatsApp sin leer, ya sumados. */
  mensajesSinLeer: number;
  /** Reservas por vencer que interrumpen: vencidas y de hoy. */
  reservasUrgentes: readonly Recordatorio[];
  /** Seguimientos que salieron de las notas, con su urgencia ya calculada. */
  seguimientos: readonly SeguimientoPendiente[];
  /** Pedidos de autorización sin resolver que esta persona puede ver. */
  autorizacionesPendientes: number;
}

/**
 * Los avisos, por nombre de módulo.
 *
 * Devuelve sólo los que tienen algo: la barra dibuja el globito cuando el
 * número es mayor que cero, y dejar ceros en el mapa sería obligar a cada
 * lector a acordarse de esa regla.
 */
export function avisosDeLaBarra(datos: ParaAvisar): Record<string, number> {
  const avisos: Record<string, number> = {};

  if (datos.mensajesSinLeer > 0) avisos.Inbox = datos.mensajesSinLeer;

  /*
   * Recordatorios junta las dos cosas que muestra esa pantalla.
   *
   * Son de origen distinto —una reserva a punto de vencer y un seguimiento que
   * salió de una nota— pero para quien mira la barra son lo mismo: cosas que
   * tenía que hacer hoy y todavía no hizo. Dos números separados obligarían a
   * sumarlos de cabeza para saber cuánto falta.
   *
   * «Pronto» queda afuera a propósito. Lo que vence en tres días no es algo
   * que haya que atender ahora, y contarlo dejaría el número siempre encendido.
   */
  const paraHoy =
    datos.reservasUrgentes.length +
    datos.seguimientos.filter(
      (s) => s.urgencia === "vencido" || s.urgencia === "hoy",
    ).length;

  if (paraHoy > 0) avisos.Recordatorios = paraHoy;

  if (datos.autorizacionesPendientes > 0) {
    avisos.Autorizaciones = datos.autorizacionesPendientes;
  }

  return avisos;
}
