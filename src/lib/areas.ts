/**
 * Las dos áreas de la bandeja: ventas y académico.
 *
 * Lo pidió la escuela el 29/10/2026: que Sussy vea sólo lo suyo y que los
 * chats del área académica no se les mezclen a las asesoras de ventas, todo
 * desde el mismo número de WhatsApp.
 *
 * ============================================================================
 * DE QUÉ ÁREA ES UN CHAT
 * ============================================================================
 *
 * De la ficha a la que está asignado. Asignado a una ficha académica (la
 * casilla «Área académica» de Equipos) es de académico; todo lo demás, sin
 * asignar incluido, es de ventas. Un número nuevo que escribe es de ventas,
 * como siempre: académico sólo recibe lo que se le asigna, a mano o por un
 * masivo con «Las atiendo yo».
 *
 * Pasar un chat de un área a la otra es reasignarlo, con el botón de siempre.
 *
 * ============================================================================
 * ES UNA DIVISIÓN DE PANTALLA, NO DE PERMISOS
 * ============================================================================
 *
 * La base le sigue dando a cada rol lo que le da hoy. Esto decide qué se
 * muestra en la bandeja y qué se cuenta en el número rojo; buscar un nombre
 * sigue encontrando a todos, para que nadie le conteste a un cliente «no
 * estás» cuando está en la otra área.
 */

export type Area = "ventas" | "academico";

/**
 * El área de quien entró. Null = la ve entera, como hasta ahora: un
 * administrador, o alguien sin ficha.
 */
export function areaDe(
  esAdmin: boolean,
  miVendedorId: number | null,
  vendedores: readonly { id: number; academico?: boolean }[],
): Area | null {
  if (esAdmin || miVendedorId == null) return null;
  const ficha = vendedores.find((v) => v.id === miVendedorId);
  if (!ficha) return null;
  return ficha.academico === true ? "academico" : "ventas";
}

/** Las fichas académicas, para preguntar rápido. */
export function fichasAcademicas(
  vendedores: readonly { id: number; academico?: boolean }[],
): ReadonlySet<number> {
  return new Set(vendedores.filter((v) => v.academico === true).map((v) => v.id));
}

/** Si un chat asignado a `vendedorId` le toca a `area`. Null = a todas. */
export function esDelArea(
  area: Area | null,
  vendedorId: number | null,
  academicas: ReadonlySet<number>,
): boolean {
  if (area == null) return true;
  const deAcademico = vendedorId != null && academicas.has(vendedorId);
  return area === "academico" ? deAcademico : !deAcademico;
}

/** Lo sin leer de cada ficha, como lo cuenta `contarSinLeer()`. */
export type SinLeerPorFicha = readonly { vendedorId: number | null; sinLeer: number }[];

/** El número rojo de la bandeja para un área. */
export function sinLeerDelArea(
  porFicha: SinLeerPorFicha,
  area: Area | null,
  academicas: ReadonlySet<number>,
): number {
  return porFicha
    .filter((f) => esDelArea(area, f.vendedorId, academicas))
    .reduce((s, f) => s + f.sinLeer, 0);
}
