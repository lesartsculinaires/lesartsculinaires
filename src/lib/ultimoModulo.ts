/**
 * Volver a donde uno estaba.
 *
 * Antes, cualquier recarga —la del navegador, la de un despliegue nuevo, la
 * que hace el CRM solo cada minuto— devolvía a Dashboard. Quien estaba
 * revisando la tabla de Clientes tenía que volver a entrar a Clientes, y si
 * había entrado en modo administrador aparecía otra vez en Usuarios y Roles,
 * que es todavía más lejos de donde estaba trabajando.
 *
 * SE GUARDA EN UNA COOKIE, NO EN `localStorage`
 *
 * Porque el servidor tiene que poder leerlo. Con `localStorage` la pantalla se
 * dibujaría primero en Dashboard y recién después saltaría al módulo bueno:
 * un parpadeo en cada recarga, y encima el navegador se quejaría de que lo
 * dibujado no coincide con lo que mandó el servidor. Leyendo una cookie, la
 * primera pantalla que se pinta ya es la correcta.
 *
 * ES DEL NAVEGADOR, Y SE BORRA AL ENTRAR
 *
 * La cookie no lleva de quién es. No hace falta: al iniciar sesión se borra,
 * así que si en la misma computadora entra otra persona, arranca limpia. Sin
 * ese borrado, alguien heredaría la última pantalla del anterior —y ésa es la
 * única manera en que esto podría decir algo de otro.
 */

export const COOKIE_MODULO = "lac.mod";

/** Un mes. Lo que dura la costumbre de trabajar siempre en la misma pantalla. */
const DURACION = 60 * 60 * 24 * 30;

/**
 * Deja anotado el módulo. Se llama desde el navegador.
 *
 * El valor va codificado porque los nombres llevan espacios y acentos
 * —«Usuarios y Roles», «Calendario»— y una cookie con un espacio adentro se
 * corta en la mitad.
 */
export function recordarModulo(mod: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${COOKIE_MODULO}=${encodeURIComponent(mod)}; path=/; max-age=${DURACION}; samesite=lax`;
}

/** Olvida dónde estaba. Al entrar y al salir. */
export function olvidarModulo(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_MODULO}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Con qué módulo abrir, mirando las tres cosas que pueden pedirlo.
 *
 * El orden importa y no es obvio:
 *
 * 1. Lo guardado gana, porque es lo que la persona estaba haciendo.
 * 2. Si no hay nada guardado y la dirección pide el panel de administración
 *    —eso pasa al entrar eligiendo «administrador»—, se abre ahí. Va segundo y
 *    no primero justamente para que recargar no devuelva a esa pantalla una y
 *    otra vez: `?mod=admin` se queda pegado en la barra de direcciones, así
 *    que si mandara siempre, ninguna recarga respetaría dónde estaba.
 * 3. Y si no, Dashboard, que es lo que decide quien llama.
 *
 * Lo guardado se comprueba contra la lista de módulos permitidos. Una cookie
 * es texto que el navegador puede tener cambiado a mano, y sin comprobarlo se
 * podría pedir una pantalla que no existe —quedaría todo en blanco— o la de
 * administración sin ser administrador. Que esa pantalla además se gatee sola
 * no alcanza: acá se decide con la misma lista que se le muestra a la persona.
 */
export function moduloInicial(opciones: {
  /** El valor crudo de la cookie, tal como llegó. */
  guardado: string | null | undefined;
  /** La dirección trae `?mod=admin`. */
  pidePanelAdmin: boolean;
  permitidos: readonly string[];
  /** A dónde ir cuando pide el panel de administración. */
  panelAdmin: string;
  /**
   * Una pantalla pedida por la dirección: `?mod=Canales`.
   *
   * ==========================================================================
   * POR QUÉ GANA SOBRE LA COOKIE
   * ==========================================================================
   *
   * Porque es una intención de ahora y la cookie es un recuerdo. Si la cookie
   * ganara, un enlace a una pantalla concreta llevaría a otra, que es lo que
   * pasaba: al volver de conectar una cuenta de Meta, el CRM abría donde
   * hubieras estado la última vez y el aviso de «cuenta conectada» no se veía
   * nunca. Para quien revisa la aplicación desde Meta, eso se lee como que no
   * pasó nada.
   *
   * Pedir no es poder: se comprueba contra `permitidos`, que ya trae sólo las
   * pantallas de ese rol. Una dirección no concede lo que el rol no concede.
   */
  pedido?: string | null;
}): string | undefined {
  const { guardado, pidePanelAdmin, permitidos, panelAdmin, pedido } = opciones;

  const pide = decodificar(pedido);
  if (pide && permitidos.includes(pide)) return pide;

  const limpio = decodificar(guardado);
  if (limpio && permitidos.includes(limpio)) return limpio;

  if (pidePanelAdmin && permitidos.includes(panelAdmin)) return panelAdmin;

  return undefined;
}

/**
 * Con qué pantalla se va a abrir, SIN mirar permisos.
 *
 * ============================================================================
 * PARA QUÉ HACE FALTA UNA SEGUNDA RESPUESTA A LA MISMA PREGUNTA
 * ============================================================================
 *
 * `moduloInicial` necesita `permitidos`, y eso sale de los accesos, que salen
 * de la base. O sea que para saber la pantalla hay que esperar una consulta.
 *
 * Y la pantalla decide qué datos pedir. Encadenadas, son dos viajes a la base
 * uno detrás del otro: primero los accesos, y recién después los datos de la
 * pantalla. Con la base rápida no se nota; con la base lenta se suma entero.
 * Medido en el banco con cinco segundos por consulta, la bandeja pasaba de
 * contestar a no contestar NUNCA —se cortó la medición al minuto—.
 *
 * Esto contesta lo mismo sin esperar a nadie, mirando sólo lo que ya está en
 * la petición. Así los datos se piden JUNTO con los accesos y no después.
 *
 * ============================================================================
 * QUÉ PASA CUANDO LE ERRA
 * ============================================================================
 *
 * Le erra sólo si la galleta nombra una pantalla que el rol no puede ver, que
 * es raro: la galleta la escribe el propio CRM al entrar a una pantalla que ya
 * le dejó ver. Y cuando le erra no rompe nada:
 *
 *   PIDIÓ DE MÁS   Se cargaron datos que la pantalla buena no usa. Se tiran.
 *                  No se filtró nada: cada consulta corre como esa persona y
 *                  la base aplica sus políticas igual.
 *
 *   PIDIÓ DE MENOS El navegador ve que falta y lo pide. Se ve un «Cargando…»
 *                  de medio segundo la primera vez.
 */
export function pantallaProbable(
  pedido: string | null | undefined,
  guardado: string | null | undefined,
  porOmision: string,
): string {
  return decodificar(pedido) ?? decodificar(guardado) ?? porOmision;
}

/**
 * El valor codificado, de vuelta a texto.
 *
 * `decodeURIComponent` lanza con un `%` suelto, que es lo que queda si alguien
 * editó la cookie a mano o si otra herramienta la reescribió. Ahí vale más
 * arrancar en Dashboard que reventar la página entera.
 */
function decodificar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    return decodeURIComponent(valor);
  } catch {
    return null;
  }
}
