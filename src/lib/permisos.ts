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

/** La clave del módulo de Bases en el catálogo. */
export const MOD_BASES = "bases";

/**
 * Lo que se puede hacer en Bases, resuelto de una vez.
 *
 * Va junto y no suelto porque las tres las necesitan las mismas dos pantallas
 * —Bases y Clientes, que comparte el botón de subir— y pasarlas de a una sería
 * tres propiedades donde alcanza con una.
 */
export interface PermisosDeBases {
  /** Aparece el módulo. */
  ver: boolean;
  /** Aparece el botón «Subir base» y la importación se acepta. */
  subir: boolean;
  /** Se puede abrir una base y ver los registros que trajo. */
  abrir: boolean;
}

export function permisosDeBases(
  permisos: readonly Permiso[],
  rolId: number | null,
  esAdmin: boolean,
): PermisosDeBases {
  return {
    ver: puede(permisos, rolId, esAdmin, MOD_BASES, "ver"),
    subir: puede(permisos, rolId, esAdmin, MOD_BASES, "crear"),
    abrir: puede(permisos, rolId, esAdmin, MOD_BASES, "editar"),
  };
}
