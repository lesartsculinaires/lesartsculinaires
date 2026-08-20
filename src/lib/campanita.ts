import type { Aviso } from "@/lib/aviso";

/**
 * El sonido, sintetizado en el momento.
 *
 * No hay archivo de audio. Dos notas de seno con su caída son cuatro líneas de
 * código y suenan igual en todas partes; un mp3 sería un binario en el
 * repositorio, una descarga más al abrir el CRM y algo que puede llegar tarde
 * —o no llegar— justo cuando hay que avisar. Además así se puede afinar el
 * tono sin volver a grabar nada.
 *
 * EL PERMISO DEL NAVEGADOR
 *
 * Ningún navegador deja sonar nada hasta que la persona toque la página al
 * menos una vez. Es una regla del navegador, no algo que se pueda pedir: no
 * existe un «permitir sonido» como el de la cámara. Por eso el contexto de
 * audio nace dormido y hay que despertarlo desde un clic o una tecla —de eso
 * se encarga quien use esto—, y por eso `listo()` existe: la pantalla tiene
 * que poder decir la verdad sobre si el aviso va a sonar o no.
 */

/**
 * Las notas de cada aviso, en hercios, y cuándo entra cada una.
 *
 * El mensaje sube (la → mi): dos notas que suben se leen como «llegó algo».
 * El cambio es una sola y más grave, para que no se confunda de reojo con el
 * otro estando en otra pestaña.
 */
const TONOS: Record<Aviso, { hz: number; en: number }[]> = {
  mensaje: [
    { hz: 880, en: 0 },
    { hz: 1318.5, en: 0.11 },
  ],
  cambio: [{ hz: 587.33, en: 0 }],
};

/** Cuánto dura cada nota y qué tan fuerte suena. Bajo a propósito: es una oficina. */
const DURACION = 0.42;
const VOLUMEN = 0.11;

export interface Campanita {
  /**
   * Intenta dejar el audio listo. Hay que llamarla desde un gesto de la
   * persona —un clic, una tecla— o el navegador la ignora.
   */
  despertar: () => Promise<boolean>;
  /** ¿Va a sonar si se le pide? */
  listo: () => boolean;
  sonar: (aviso: Aviso) => void;
  cerrar: () => void;
}

type ConWebkit = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Arma la campanita.
 *
 * El contexto de audio se crea recién la primera vez que hace falta. Crearlo
 * al cargar la página deja un recurso abierto en todas las pestañas de todo el
 * equipo aunque nadie llegue a escuchar un solo aviso.
 */
export function crearCampanita(): Campanita {
  let ctx: AudioContext | null = null;

  const conseguirCtx = (): AudioContext | null => {
    if (ctx) return ctx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (globalThis as ConWebkit).webkitAudioContext;
    if (!Ctor) return null; // Navegador sin WebAudio: se queda mudo, no rompe.
    ctx = new Ctor();
    return ctx;
  };

  /**
   * Se pregunta por función y no leyendo `c.state` derecho porque el
   * compilador da por muerto el segundo chequeo: no sabe que `resume()`
   * cambia el estado justo en el medio.
   */
  const corriendo = (c: AudioContext): boolean => c.state === "running";

  const despertar = async (): Promise<boolean> => {
    const c = conseguirCtx();
    if (!c) return false;
    if (!corriendo(c)) {
      try {
        await c.resume();
      } catch {
        // Pasa cuando no se llamó desde un gesto. No es un error que
        // reportar: el siguiente clic vuelve a intentarlo.
      }
    }
    return corriendo(c);
  };

  return {
    despertar,
    listo: () => ctx?.state === "running",

    sonar(aviso) {
      const c = conseguirCtx();
      // Dormido: no se encola nada. Un aviso que suena tres minutos tarde, al
      // primer clic, avisa de algo que ya pasó y confunde más de lo que ayuda.
      if (!c || c.state !== "running") return;

      for (const nota of TONOS[aviso]) {
        const osc = c.createOscillator();
        const vol = c.createGain();
        osc.type = "sine";
        osc.frequency.value = nota.hz;

        // La rampa arranca en un valor mínimo y no en cero porque la
        // exponencial no puede pasar por cero; y arranca con rampa y no de
        // golpe porque un seno que empieza en su máximo hace «clic».
        const t0 = c.currentTime + nota.en;
        vol.gain.setValueAtTime(0.0001, t0);
        vol.gain.exponentialRampToValueAtTime(VOLUMEN, t0 + 0.012);
        vol.gain.exponentialRampToValueAtTime(0.0001, t0 + DURACION);

        osc.connect(vol).connect(c.destination);
        osc.start(t0);
        // Se apaga sola: un oscilador que no se detiene queda sonando para
        // siempre, en silencio, gastando.
        osc.stop(t0 + DURACION + 0.03);
      }
    },

    cerrar() {
      void ctx?.close();
      ctx = null;
    },
  };
}
