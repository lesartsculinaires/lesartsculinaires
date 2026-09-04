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
 * La regla es: se cuenta lo que está sin atender y todavía se puede atender.
 *
 *   SE CUENTA        un mensaje sin leer, todo lo que hay en Recordatorios,
 *                    un pedido de autorización sin resolver, un lead frío.
 *
 *   NO SE CUENTA     cuántos leads hay en el pipeline, cuántos clientes hay,
 *                    cuántos programas están cargados. Son cantidades, no
 *                    pendientes: no bajan nunca porque nadie las «atiende», y
 *                    un número rojo permanente al lado de Clientes deja de
 *                    mirarse en dos días y de paso enseña a ignorar los otros.
 *
 *   TAMPOCO          lo que alguien pospuso a propósito. Posponer es decir
 *                    «esto no es para hoy», y volver a contarlo sería no
 *                    haberle hecho caso.
 *
 * ----------------------------------------------------------------------------
 * ESTA REGLA SE AMPLIÓ, Y CONVIENE SABER QUÉ SE CAMBIÓ POR QUÉ
 * ----------------------------------------------------------------------------
 *
 * Antes se contaba sólo lo VENCIDO Y LO DE HOY, para que el número llegara a
 * cero seguido. La escuela miró su CRM, vio los dos módulos sin globito y
 * pidió que lo tuvieran igual. Se le explicó el costo —un número que casi
 * nunca baja a cero se deja de mirar, y de paso enseña a ignorar los demás— y
 * eligió igual que se vieran.
 *
 * Así que ahora el globito de Recordatorios cuenta TODO lo que hay en esa
 * pantalla, no sólo lo de hoy, y Fríos tiene el suyo. Lo que se conservó de la
 * regla vieja es lo que la hacía servir: los pospuestos no cuentan, y las dos
 * siguen bajando a cero cuando el trabajo se hace. Ninguna es una cantidad
 * fija disfrazada de pendiente.
 *
 * La ventana emergente del día NO cambió: sigue saltando sólo por lo vencido y
 * lo de hoy. Una cosa es un número en la barra y otra es interrumpir.
 */

/** Lo que hace falta saber para armar los números, sin depender de pantallas. */
export interface ParaAvisar {
  /** Mensajes de WhatsApp sin leer, ya sumados. */
  mensajesSinLeer: number;
  /**
   * Las reservas con plazo corriendo: TODAS las de la pantalla, no sólo las
   * de hoy.
   *
   * Las pospuestas vienen marcadas y se descuentan acá abajo, no antes: quien
   * llama a esta función no tiene por qué conocer esa regla.
   */
  reservas: readonly Recordatorio[];
  /** Seguimientos que salieron de las notas, con su urgencia ya calculada. */
  seguimientos: readonly SeguimientoPendiente[];
  /** Pedidos de autorización sin resolver que esta persona puede ver. */
  autorizacionesPendientes: number;
  /**
   * Movimientos del equipo desde la última vez que esta persona miró.
   *
   * No cuenta lo que hizo ella misma: nadie necesita un aviso rojo de lo que
   * acaba de hacer, y contándolo el número nunca bajaría a cero para quien
   * está trabajando.
   */
  actividadSinVer: number;
  /**
   * Leads vivos que nadie tocó en quince días o más.
   *
   * Es el más grande de todos —en la base de la escuela arrancó en 410— y el
   * que más se parece a una cantidad. Cuenta igual porque baja: un lead sale
   * de esa lista en cuanto alguien le escribe una nota. Es una deuda de
   * trabajo, no un inventario.
   */
  frios: number;
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
   * Son de origen distinto —una reserva con el plazo corriendo y un
   * seguimiento que salió de una nota— pero para quien mira la barra son lo
   * mismo: cosas que hay que hacer y todavía no se hicieron. Dos números
   * separados obligarían a sumarlos de cabeza para saber cuánto falta.
   *
   * El número es exactamente lo que se ve al abrir el módulo. Que no lo fuera
   * —que dijera 3 y adentro hubiera 11— es peor que no tener número: enseña a
   * no creerle.
   *
   * Lo pospuesto no cuenta. Alguien apretó «recordar más adelante», que es
   * decir «esto no es para hoy»; volver a contarlo sería no haberle hecho caso
   * y dejaría el globito encendido para siempre.
   */
  const enRecordatorios =
    datos.reservas.filter((r) => !r.pospuesto).length + datos.seguimientos.length;

  if (enRecordatorios > 0) avisos.Recordatorios = enRecordatorios;

  if (datos.frios > 0) avisos["Fríos"] = datos.frios;

  if (datos.autorizacionesPendientes > 0) {
    avisos.Autorizaciones = datos.autorizacionesPendientes;
  }

  /*
   * Notificaciones es distinto de los otros tres, y vale la pena decir por qué
   * entra igual.
   *
   * Los demás cuentan pendientes: cosas que alguien tiene que hacer. Éste
   * cuenta novedades: cosas que pasaron y todavía no se miraron. Cumple igual
   * la regla de arriba —baja a cero cuando se atiende, porque abrir el módulo
   * lo apaga— y por eso no se vuelve un número permanente de los que enseñan a
   * ignorar los otros.
   */
  if (datos.actividadSinVer > 0) avisos.Notificaciones = datos.actividadSinVer;

  return avisos;
}
