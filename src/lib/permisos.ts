import type { Accion, Permiso } from "@/lib/types";

/**
 * ¿Este rol tiene esta casilla en este módulo?
 *
 * ------------------------------------------------------------------------
 * ES LA MISMA REGLA QUE LA DE LA BASE, ESCRITA DOS VECES
 * ------------------------------------------------------------------------
 *
 * En la base vive `public.puede(modulo, accion)`, y es la que manda: la
 * pantalla se puede saltar, la política no. Esta copia existe para que el CRM
 * pueda esconder un botón antes de que alguien lo apriete, porque un botón que
 * siempre falla se lee como que el sistema está roto, no como que no te
 * corresponde.
 *
 * Que estén las dos obliga a que digan lo mismo. Por eso los dos valores por
 * omisión están escritos acá abajo con el mismo cuidado, y por eso la prueba
 * de `supabase/pruebas/banco/prueba-permisos-bases.mjs` compara las dos
 * respuestas contra los mismos casos.
 *
 * ------------------------------------------------------------------------
 * LOS DOS VALORES POR OMISIÓN, Y POR QUÉ SON DISTINTOS
 * ------------------------------------------------------------------------
 *
 *   SIN FILA, «VER» ES SÍ      No haber decidido no es haber dicho que no. Con
 *                              la regla al revés, el día que se agrega una
 *                              pantalla desaparecería para todos hasta que
 *                              alguien la habilite rol por rol, y nadie sabría
 *                              por qué.
 *
 *   SIN FILA, EL RESTO ES NO   Hacer algo requiere que alguien lo haya
 *                              habilitado. Subir una base crea cientos de
 *                              fichas de una vez; eso no puede quedar
 *                              habilitado por descuido.
 *
 * Y una tercera, que no es un valor por omisión sino una definición:
 * dirección puede todo. No es un privilegio suelto: es lo que impide que
 * alguien se destilde a sí mismo la pantalla donde se arreglan los permisos y
 * deje el CRM sin nadie que pueda volver a entrar.
 */
export function puede(
  permisos: readonly Permiso[],
  rolId: number | null,
  esAdmin: boolean,
  modulo: string,
  accion: Accion,
): boolean {
  if (esAdmin) return true;
  if (rolId == null) return false;

  const fila = permisos.find((p) => p.rolId === rolId && p.modulo === modulo);
  if (!fila) return accion === "ver";

  return fila[accion];
}

/** Las claves de los módulos en el catálogo de la base. */
export const MOD_BASES = "bases";
export const MOD_FORMULARIOS = "formularios";

/**
 * Las cuatro casillas de un módulo, resueltas de una vez.
 *
 * Van juntas y no sueltas porque cada pantalla necesita varias a la vez
 * —Bases usa tres, Formularios usa tres— y pasarlas de a una serían cuatro
 * propiedades donde alcanza con una. Se resuelven acá arriba, una sola vez,
 * porque el mismo botón aparece en dos pantallas y calcularlo dos veces es la
 * forma más segura de tenerlo mal en una.
 */
export interface PermisosDeModulo {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
}

export function permisosDeModulo(
  permisos: readonly Permiso[],
  rolId: number | null,
  esAdmin: boolean,
  modulo: string,
): PermisosDeModulo {
  return {
    ver: puede(permisos, rolId, esAdmin, modulo, "ver"),
    crear: puede(permisos, rolId, esAdmin, modulo, "crear"),
    editar: puede(permisos, rolId, esAdmin, modulo, "editar"),
    eliminar: puede(permisos, rolId, esAdmin, modulo, "eliminar"),
  };
}
