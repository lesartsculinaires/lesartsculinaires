/**
 * Cambios en espera de confirmación.
 *
 * Antes, cada campo de la ficha se guardaba solo al salir de él. Cómodo para
 * corregir un teléfono, pero no deja revisar nada: para cuando uno se da
 * cuenta de que se equivocó de casilla, ya está escrito. Ahora los cambios se
 * juntan acá y no tocan la base hasta que la persona los acepta.
 *
 * Un detalle que evita confusiones: si alguien edita un campo y después lo
 * deja como estaba, deja de contar como cambio. Si no, la pantalla de
 * confirmación mostraría «Teléfono: 7000-0000 a 7000-0000», que no es un
 * cambio y sólo haría dudar.
 */
export interface Cambio {
  /** Identifica el campo. Volver a editarlo reemplaza el cambio anterior. */
  clave: string;
  etiqueta: string;
  /** Valor guardado hoy, tal como se muestra. */
  antes: string;
  /** Valor que quedaría, tal como se muestra. */
  despues: string;
  /** Manda el cambio a la base. Se llama sólo al aceptar. */
  aplicar: () => void;
}

export type Pendientes = ReadonlyMap<string, Cambio>;

export const VACIOS: Pendientes = new Map();

/** Cómo se muestra un valor sin llenar. */
export const SIN_VALOR = "(vacío)";

export const paraMostrar = (v: string): string => (v.trim() === "" ? SIN_VALOR : v);

/**
 * Anota un cambio, o lo retira si el valor volvió al original.
 *
 * Compara con `antes`, no con el valor anterior del borrador: lo que importa
 * es si difiere de lo guardado, no cuántas vueltas dio para llegar.
 */
export function anotar(actuales: Pendientes, cambio: Cambio): Pendientes {
  const siguiente = new Map(actuales);
  if (cambio.antes === cambio.despues) siguiente.delete(cambio.clave);
  else siguiente.set(cambio.clave, cambio);
  return siguiente;
}

/** Quita un cambio concreto, para poder descartarlo desde la confirmación. */
export function quitar(actuales: Pendientes, clave: string): Pendientes {
  const siguiente = new Map(actuales);
  siguiente.delete(clave);
  return siguiente;
}

/**
 * Los cambios en el orden en que se hicieron.
 *
 * `Map` conserva el orden de inserción, y volver a editar un campo ya anotado
 * no lo mueve al final: la lista no baila mientras se la lee.
 */
export const listar = (actuales: Pendientes): Cambio[] => [...actuales.values()];

export const hayCambios = (actuales: Pendientes): boolean => actuales.size > 0;

/** El valor a mostrar en un campo: el borrador si lo hay, si no lo guardado. */
export const valorVisible = (
  actuales: Pendientes,
  clave: string,
  guardado: string,
): string => actuales.get(clave)?.despues ?? guardado;
