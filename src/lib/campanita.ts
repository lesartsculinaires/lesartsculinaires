import type { Aviso } from "@/lib/aviso";

/**
 * El sonido, sintetizado en el momento.
 *
 * No hay archivo de audio. Unas notas con su caída son unas líneas de código y
 * suenan igual en todas partes; un mp3 sería un binario en el repositorio, una
 * descarga más al abrir el CRM y algo que puede llegar tarde —o no llegar—
 * justo cuando hay que avisar. Además así se puede afinar el tono, el volumen
 * y hasta agregar sonidos nuevos sin volver a grabar nada.
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

// ------------------------------------------------------------------ tonos

export type Timbre = "campanita" | "campana" | "alerta" | "marimba" | "digital";

/** Una nota: qué tan aguda, cuándo entra y cuánto dura. */
interface Nota {
  hz: number;
  /** Segundos desde que arranca el aviso. */
  en: number;
  /** Segundos que tarda en apagarse. */
  dura: number;
}

interface Sonido {
  /**
   * La forma de onda, que es de dónde sale casi todo el carácter.
   *
   * `sine` es la más suave y la que peor se escucha con ruido alrededor: no
   * tiene armónicos, así que se la come cualquier conversación. `triangle` y
   * `square` traen armónicos y por eso se abren paso mucho mejor sin necesidad
   * de subir el volumen —que es lo que distorsiona—.
   */
  onda: OscillatorType;
  mensaje: Nota[];
  cambio: Nota[];
}

const nota = (hz: number, en: number, dura = 0.4): Nota => ({ hz, en, dura });

/**
 * Los sonidos que se pueden elegir, del más discreto al más insistente.
 *
 * Hay varios porque una oficina no es una sola situación: quien atiende de
 * cara al público necesita algo que no se note, y quien está en el depósito
 * con la freidora al lado necesita algo que atraviese. Con un solo sonido, uno
 * de los dos termina apagándolo, y un aviso apagado no avisa.
 *
 * En todos, el de mensaje SUBE y el de cambio no. Dos notas que suben se leen
 * como «llegó algo»; una sola y más grave, como «algo se movió». Con los ojos
 * en otra pestaña, esa diferencia es lo único que hay para distinguirlos.
 */
export const SONIDOS: Record<Timbre, Sonido> = {
  // El de siempre. Suave, dos notas de seno.
  campanita: {
    onda: "sine",
    mensaje: [nota(880, 0, 0.42), nota(1318.5, 0.11, 0.42)],
    cambio: [nota(587.33, 0, 0.42)],
  },

  // Una campana de verdad: más cuerpo y una cola más larga.
  campana: {
    onda: "triangle",
    mensaje: [nota(1046.5, 0, 0.8), nota(1568, 0.09, 0.9), nota(2093, 0.18, 0.7)],
    cambio: [nota(659.25, 0, 0.75), nota(880, 0.1, 0.6)],
  },

  // Para lugares con ruido: tres golpes cortos y secos que no se pierden.
  alerta: {
    onda: "square",
    mensaje: [nota(1174.7, 0, 0.12), nota(1174.7, 0.16, 0.12), nota(1567.98, 0.32, 0.22)],
    cambio: [nota(783.99, 0, 0.12), nota(783.99, 0.16, 0.18)],
  },

  // Madera: cálido, corto, sin filo. Molesta menos de fondo.
  marimba: {
    onda: "triangle",
    mensaje: [nota(1318.5, 0, 0.3), nota(1760, 0.08, 0.35)],
    cambio: [nota(880, 0, 0.32)],
  },

  // Dos notas limpias, tipo aplicación de mensajería.
  digital: {
    onda: "sine",
    mensaje: [nota(1567.98, 0, 0.16), nota(2093, 0.1, 0.3)],
    cambio: [nota(1046.5, 0, 0.16), nota(783.99, 0.09, 0.28)],
  },
};

/** Cómo se llaman en la pantalla, en el orden en que se ofrecen. */
export const NOMBRES: { id: Timbre; nombre: string; para: string }[] = [
  { id: "campanita", nombre: "Campanita", para: "Suave, el de siempre" },
  { id: "digital", nombre: "Digital", para: "Limpio, como una app de mensajes" },
  { id: "marimba", nombre: "Marimba", para: "Cálido, molesta poco de fondo" },
  { id: "campana", nombre: "Campana", para: "Con cuerpo, se oye desde lejos" },
  { id: "alerta", nombre: "Alerta", para: "Tres golpes, para lugares con ruido" },
];

// --------------------------------------------------------------- volumen

export type Volumen = "bajo" | "medio" | "alto";

/**
 * Cuánto suena cada nivel.
 *
 * «Bajo» es el volumen que tenía el CRM hasta ahora, y era demasiado poco para
 * casi todos. «Medio» es el nuevo punto de partida. «Alto» está bien por
 * debajo de 1 a propósito: pasado ese techo la señal se recorta y el sonido
 * pasa de fuerte a sucio, que se escucha peor y encima molesta más.
 */
const GANANCIA: Record<Volumen, number> = {
  bajo: 0.11,
  medio: 0.32,
  alto: 0.62,
};

export const VOLUMENES: { id: Volumen; nombre: string }[] = [
  { id: "bajo", nombre: "Bajo" },
  { id: "medio", nombre: "Medio" },
  { id: "alto", nombre: "Alto" },
];

export const TIMBRE_POR_OMISION: Timbre = "campanita";
export const VOLUMEN_POR_OMISION: Volumen = "medio";

// -------------------------------------------------------------- la campana

export interface Ajustes {
  timbre: Timbre;
  volumen: Volumen;
}

export interface Campanita {
  /**
   * Intenta dejar el audio listo. Hay que llamarla desde un gesto de la
   * persona —un clic, una tecla— o el navegador la ignora.
   */
  despertar: () => Promise<boolean>;
  /** ¿Va a sonar si se le pide? */
  listo: () => boolean;
  sonar: (aviso: Aviso) => void;
  /** Suena una vez con lo que se le pase, sin cambiar lo elegido. Para probar. */
  probar: (ajustes: Ajustes, aviso?: Aviso) => void;
  ajustar: (ajustes: Partial<Ajustes>) => void;
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
  let ajustes: Ajustes = {
    timbre: TIMBRE_POR_OMISION,
    volumen: VOLUMEN_POR_OMISION,
  };

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

  const tocar = (aviso: Aviso, con: Ajustes) => {
    const c = conseguirCtx();
    // Dormido: no se encola nada. Un aviso que suena tres minutos tarde, al
    // primer clic, avisa de algo que ya pasó y confunde más de lo que ayuda.
    if (!c || c.state !== "running") return;

    const sonido = SONIDOS[con.timbre] ?? SONIDOS[TIMBRE_POR_OMISION];
    const pico = GANANCIA[con.volumen] ?? GANANCIA[VOLUMEN_POR_OMISION];

    for (const n of sonido[aviso]) {
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = sonido.onda;
      osc.frequency.value = n.hz;

      // La rampa arranca en un valor mínimo y no en cero porque la
      // exponencial no puede pasar por cero; y arranca con rampa y no de
      // golpe porque una onda que empieza en su máximo hace «clic».
      const t0 = c.currentTime + n.en;
      vol.gain.setValueAtTime(0.0001, t0);
      vol.gain.exponentialRampToValueAtTime(pico, t0 + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dura);

      osc.connect(vol).connect(c.destination);
      osc.start(t0);
      // Se apaga solo: un oscilador que no se detiene queda sonando para
      // siempre, en silencio, gastando.
      osc.stop(t0 + n.dura + 0.03);
    }
  };

  return {
    despertar,
    listo: () => ctx?.state === "running",
    sonar: (aviso) => tocar(aviso, ajustes),
    probar: (con, aviso = "mensaje") => tocar(aviso, con),
    ajustar: (cambios) => {
      ajustes = { ...ajustes, ...cambios };
    },

    cerrar() {
      void ctx?.close();
      ctx = null;
    },
  };
}
