/**
 * Por qué no se pudo atender una llamada, dicho para quien atiende.
 *
 * ============================================================================
 * EL AVISO DECÍA SIEMPRE LO MISMO, Y CASI SIEMPRE ERA MENTIRA
 * ============================================================================
 *
 * Tomar una llamada es un `update` con candado: sólo funciona si la llamada
 * sigue sonando y nadie la agarró antes. Cuando no toca ninguna fila hay cuatro
 * motivos posibles, y la pantalla mostraba uno solo para todos:
 *
 *     «Otra persona atendió esta llamada.»
 *
 * El 8 de octubre de 2026 a las 9:06 entró una llamada y la clienta colgó a los
 * 26 segundos. En la base quedó `perdida`, con `atendida_por` en NULO: nadie la
 * atendió. Y la asesora que apretó contestar leyó que se la habían ganado.
 *
 * Eso no es un detalle de redacción. Manda a buscar a la compañera que atendió
 * en vez de devolver la llamada, que es lo único que había que hacer. Esa vez
 * se perdió minuto y medio hasta que alguien se dio cuenta.
 */

/** Lo que contesta la base cuando no se pudo tomar la llamada. */
export type PorqueNo = "la_tomo_otro" | "ya_no_sonaba" | "no_existe" | null;

/**
 * El aviso que se muestra.
 *
 * `quien` es el nombre de quien la atendió, si se sabe: decir «la atendió
 * Katya» ahorra la pregunta de a quién hay que buscar.
 */
export function avisoDeNoAtendida(porque: PorqueNo, quien?: string | null): string {
  if (porque === "ya_no_sonaba") {
    /*
     * El caso que se contaba mal, y el más común de todos: quien llama se
     * cansa antes de que alguien alcance a contestar. Se dice qué hacer
     * —devolver la llamada— porque es lo único que queda por hacer.
     */
    return "La persona colgó antes de que se pudiera contestar. Devolvele la llamada.";
  }

  if (porque === "no_existe") {
    return "Esa llamada ya no está. Si era importante, devolvele la llamada.";
  }

  if (porque === "la_tomo_otro") {
    return quien ? `${quien} atendió esta llamada.` : "Otra persona atendió esta llamada.";
  }

  /*
   * Sin motivo: es lo que contesta la base vieja, antes de correr la migración
   * que agrega `porque`. Se deja el texto de siempre en vez de inventar uno
   * nuevo —desplegar antes que el SQL es lo normal, y ese rato tiene que ser
   * inofensivo—.
   */
  return "No se pudo contestar la llamada.";
}

/**
 * ¿Conviene ofrecer devolver la llamada?
 *
 * Sólo cuando nadie la atendió. Si la tomó una compañera, ofrecer llamar
 * sería invitar a molestar a un cliente que ya está hablando con alguien.
 */
export function convieneDevolverla(porque: PorqueNo): boolean {
  return porque === "ya_no_sonaba" || porque === "no_existe";
}
