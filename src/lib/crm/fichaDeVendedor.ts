/**
 * Quién necesita ficha de vendedor, y por qué.
 *
 * ============================================================================
 * LAS DOS MITADES DE UNA PERSONA EN EL CRM
 * ============================================================================
 *
 * Entrar al CRM y poder atender leads son dos cosas distintas, guardadas en dos
 * tablas distintas:
 *
 *   `usuarios`     La cuenta: el correo con el que entra y el rol que tiene.
 *   `vendedores`   La ficha: de ella cuelgan las oportunidades, los eventos del
 *                  calendario, la asignación de la bandeja y el reparto.
 *
 * Las une `vendedores.usuario_id`. Alguien con cuenta y sin ficha ENTRA AL CRM
 * SIN PROBLEMA —ve el armazón, las pantallas, el menú— y no se le puede asignar
 * ni un lead, porque no existe como vendedor. Nada falla, nada avisa.
 *
 * ============================================================================
 * ESTO PASÓ, Y PASÓ CALLADO
 * ============================================================================
 *
 * El 7 de octubre de 2026 se dio de alta a una asesora nueva. Entró al CRM el
 * mismo día. Pero no tenía ficha, así que:
 *
 *   - no aparecía en ningún desplegable de «asignar a»,
 *   - `vendedores_para_reparto()` la salteaba, o sea que el reparto automático
 *     no le mandaba nada,
 *   - y su tablero mostraba los leads SIN ASIGNAR de todo el mundo, porque la
 *     política dice «los míos o los de nadie» y sin ficha no hay míos.
 *
 * Y no era sólo ella. De doce cuentas, ocho estaban así, y el reparto
 * automático terminaba SIEMPRE en la misma persona: era la única con rol que
 * recibe leads Y ficha. Mil cuarenta leads contra tres, uno y dieciséis.
 *
 * ============================================================================
 * POR QUÉ EL AVISO QUE YA HABÍA NO LO AGARRABA
 * ============================================================================
 *
 * La pantalla de Usuarios ya marcaba a quién le falta la ficha, pero eximía a
 * quien tiene `ve_todo` —con el razonamiento de que dirección y coordinación
 * entran sin atender a nadie—. Y resulta que «Ventas» y «Jefe de ventas» tienen
 * las DOS cosas: ven todo Y reciben leads. O sea que el aviso estaba apagado
 * justo para quienes más lo necesitaban.
 *
 * Por eso acá la pregunta se hace al revés: no «¿es de los que miran?» sino
 * «¿hay algo que dependa de que tenga ficha?».
 */

/** Lo que hace falta saber de un rol para decidir. */
export interface RolParaFicha {
  /** Puede todo y no se puede borrar. */
  esAdmin: boolean;
  /** Ve las oportunidades de todos, no sólo las suyas. */
  veTodo: boolean;
  /** Entra en el reparto automático de leads nuevos. */
  recibeLeads: boolean;
}

/** Por qué una persona necesita ficha —o por qué no—. */
export type MotivoDeFicha =
  | "ya-la-tiene"
  | "esta-inactiva"
  | "recibe-leads"
  | "solo-ve-lo-suyo"
  | "no-la-necesita";

/**
 * El motivo, que es lo que después se le dice a quien administra.
 *
 * Devuelve el motivo y no un `boolean` a propósito: «le falta la ficha» no
 * ayuda a nadie si no dice qué se rompe sin ella, y son dos cosas distintas
 * —no le llegan leads, o no ve los suyos—.
 */
export function motivoDeFicha(
  rol: RolParaFicha | null | undefined,
  tieneFicha: boolean,
  activa: boolean,
): MotivoDeFicha {
  if (tieneFicha) return "ya-la-tiene";
  if (!activa) return "esta-inactiva";

  /*
   * Primero el reparto, porque es el que falla sin ruido.
   *
   * `vendedores_para_reparto()` hace un `join` contra `vendedores`: a quien no
   * tiene ficha no la saltea con un error, directamente no está en la lista. El
   * reparto sigue andando y repartiendo, sólo que entre menos gente.
   */
  if (rol?.recibeLeads) return "recibe-leads";

  /*
   * Y después quien sólo ve lo suyo: sin ficha, «lo suyo» es el conjunto vacío
   * y su tablero queda con los leads sin asignar de todo el mundo.
   *
   * Dirección y coordinación —`esAdmin` o `veTodo`, y que no reciben leads—
   * entran al CRM sin atender a nadie: para ellos no tener ficha es lo normal y
   * crearles una sólo ensuciaría los desplegables de «asignar a».
   */
  if (!(rol?.esAdmin || rol?.veTodo)) return "solo-ve-lo-suyo";

  return "no-la-necesita";
}

/** La versión corta, para decidir si hay que avisar. */
export function faltaLaFicha(
  rol: RolParaFicha | null | undefined,
  tieneFicha: boolean,
  activa: boolean,
): boolean {
  const m = motivoDeFicha(rol, tieneFicha, activa);
  return m === "recibe-leads" || m === "solo-ve-lo-suyo";
}

/** Lo que se le muestra a quien administra, dicho en lo que se rompe. */
export function comoSeExplica(motivo: MotivoDeFicha): string | null {
  if (motivo === "recibe-leads") {
    return "Sin ficha de vendedor no entra en el reparto: los leads nuevos se van a repartir entre los demás y a esta persona no le va a llegar ninguno.";
  }
  if (motivo === "solo-ve-lo-suyo") {
    return "Sin ficha de vendedor no se le puede asignar ningún lead, y su tablero muestra los que no son de nadie en vez de los suyos.";
  }
  return null;
}

/**
 * ¿Conviene crearle la ficha al dar de alta la cuenta?
 *
 * Es la casilla que viene marcada en el alta. Se marca sola para quien la va a
 * necesitar, y se puede desmarcar: la decisión sigue siendo de quien
 * administra, pero por omisión no se crea a medias.
 */
export function convieneFichaAlCrear(rol: RolParaFicha | null | undefined): boolean {
  return faltaLaFicha(rol, false, true);
}
