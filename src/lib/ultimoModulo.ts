/**
 * Volver a donde uno estaba.
 *
 * Antes, cualquier recarga —la del navegador, la de un despliegue nuevo, la
 * que hace el CRM solo cada diez minutos— devolvía a Dashboard. Quien estaba
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
}): string | undefined {
  const { guardado, pidePanelAdmin, permitidos, panelAdmin } = opciones;

  const limpio = decodificar(guardado);
  if (limpio && permitidos.includes(limpio)) return limpio;

  if (pidePanelAdmin && permitidos.includes(panelAdmin)) return panelAdmin;

  return undefined;
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
