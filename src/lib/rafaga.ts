/**
 * Junta una ráfaga de avisos en una sola acción.
 *
 * Cada fila que cambia manda su propio aviso. Subir una base de 500 contactos
 * son 500 avisos en unos segundos, y actuar en cada uno sería recargar la
 * pantalla 500 veces.
 *
 * La regla tiene dos partes, y las dos hacen falta:
 *
 * - Tras cada aviso se espera `esperaMs`. Si llega otro antes, la espera
 *   vuelve a empezar. Así una ráfaga corta se cobra una sola vez.
 * - Pero si los avisos no paran, esa espera se correría para siempre y no se
 *   actuaría nunca. Por eso, pasados `topeMs` desde el primer aviso de la
 *   ráfaga, se actúa aunque siga entrando.
 */
export interface Rafaga {
  /** Registra un aviso. */
  avisar: () => void;
  /** Cancela lo pendiente. Llamar al desmontar. */
  cancelar: () => void;
}

export interface OpcionesRafaga {
  esperaMs: number;
  topeMs: number;
  /** Reloj y temporizadores, inyectables para poder probarlos. */
  ahora?: () => number;
  programar?: (fn: () => void, ms: number) => number;
  cancelarProgramado?: (id: number) => void;
}

export function crearRafaga(accion: () => void, opciones: OpcionesRafaga): Rafaga {
  const {
    esperaMs,
    topeMs,
    ahora = () => Date.now(),
    programar = (fn, ms) => window.setTimeout(fn, ms) as unknown as number,
    cancelarProgramado = (id) => window.clearTimeout(id),
  } = opciones;

  let pendiente: number | null = null;
  let inicio: number | null = null;

  const disparar = () => {
    pendiente = null;
    inicio = null;
    accion();
  };

  return {
    avisar() {
      const t = ahora();
      inicio ??= t;

      if (pendiente != null) cancelarProgramado(pendiente);

      // Se compara contra el tope antes de reprogramar: si la ráfaga ya lleva
      // demasiado, se actúa de una en vez de seguir posponiendo.
      if (t - inicio >= topeMs) {
        disparar();
        return;
      }

      // Nunca se programa más allá del tope. Sin este recorte, el tope sólo
      // serviría si llegara otro aviso después de vencido: una ráfaga que
      // para justo antes dejaría la pantalla esperando de más.
      const restante = topeMs - (t - inicio);
      pendiente = programar(disparar, Math.min(esperaMs, restante));
    },

    cancelar() {
      if (pendiente != null) cancelarProgramado(pendiente);
      pendiente = null;
      inicio = null;
    },
  };
}
