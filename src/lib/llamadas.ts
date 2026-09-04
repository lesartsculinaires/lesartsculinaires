/**
 * Cuándo una llamada interrumpe y cuándo se queda en la esquina.
 *
 * ============================================================================
 * LA CONDICIÓN QUE PUSO LA ESCUELA
 * ============================================================================
 *
 * «Aquí lo que no quiero es que vayan a afectar las llamadas entrantes al
 *  momento que estén escribiendo o interactuando en el CRM. Me gustaría que
 *  apareciera como pop up la llamada y contestarla, pero en los demás
 *  dispositivos se minimice y se visualice en una esquina.»
 *
 * Son dos pedidos y hay que cumplir los dos a la vez:
 *
 *   UNA SOLA PANTALLA INTERRUMPE   El número de WhatsApp es uno y el equipo es
 *                                  varias personas. Si el pop-up saliera en las
 *                                  cinco pantallas abiertas, una llamada
 *                                  cortaría el trabajo de cinco para que
 *                                  conteste una.
 *
 *   Y NI ÉSA, SI ESTÁ ESCRIBIENDO  Un pop-up que aparece en la mitad de una
 *                                  cotización se lleva puesto el foco y lo
 *                                  escrito. Mientras haya dedos en el teclado
 *                                  la llamada espera en la esquina, sonando,
 *                                  y sube a pop-up recién cuando la persona
 *                                  levanta las manos.
 *
 * Nada de este archivo dibuja: decide. Se prueba solo, sin navegador, que es lo
 * único que permite estar seguro de una regla que en pantalla sólo se ve
 * cuando entra una llamada de verdad.
 */

/** Cómo se le muestra una llamada a una persona. */
export type Presencia =
  /** Pop-up: interrumpe. Es de esta persona y está libre para atender. */
  | "pop-up"
  /** Tarjeta chica en una esquina: se ve y suena, pero no tapa nada. */
  | "esquina"
  /** No se muestra: no es asunto de esta persona, o ya terminó. */
  | "nada";

/** Los mismos siete que acepta la columna. Ver la migración de `llamadas`. */
export type EstadoLlamada =
  | "sonando"
  | "contestando"
  | "en_curso"
  | "terminada"
  | "rechazada"
  | "perdida"
  | "fallida";

export interface LlamadaEnVivo {
  callId: string;
  telefono: string;
  conversacionId: number | null;
  /**
   * De quién es el hilo, copiado en la fila de la llamada.
   *
   * Va acá y no se busca en `conversaciones` porque esa tabla no se ve entera:
   * una asesora no ve los hilos de otra. Buscándolo ahí, la pantalla de quien
   * no puede ver el hilo no encontraría dueño, lo trataría como sin asignar y
   * le tiraría el pop-up encima —que es justo lo contrario de lo pedido—.
   */
  vendedorId: number | null;
  /** Cómo se conoce a quien llama. También copiado, y por lo mismo. */
  nombre: string | null;
  direccion: "entrante" | "saliente";
  estado: EstadoLlamada;
  /** El usuario que la agarró. Nulo mientras suena. */
  atendidaPor: string | null;
  /** Cuándo entró. Con esto se descartan las que quedaron colgadas. */
  creadoEn: string;
}

export interface Quien {
  /** El id de la cuenta, que es contra el que se compara `atendidaPor`. */
  usuarioId: string | null;
  /** Su fila de asesor, si tiene. Dirección puede no tener. */
  vendedorId: number | null;
}

export interface QueEstaHaciendo {
  /**
   * Hace cuántos milisegundos tocó una tecla. Nulo si no tocó ninguna desde
   * que abrió la pantalla.
   */
  tecleoHaceMs: number | null;
  /** Está arrastrando un lead en el pipeline, o algo parecido. */
  arrastrando: boolean;
}

/**
 * Cuánto silencio hace falta para dar por terminada una frase.
 *
 * Escribiendo normal no se pasan dos segundos y medio entre tecla y tecla, ni
 * siquiera pensando la palabra siguiente. Pasarlos quiere decir que la persona
 * levantó las manos, y ahí el pop-up ya no le rompe nada.
 *
 * Más corto interrumpiría a media frase, que es exactamente lo que la escuela
 * pidió que no pasara. Más largo haría esperar de más a la llamada, y el plazo
 * de Meta no da para eso.
 */
export const PAUSA_PARA_INTERRUMPIR_MS = 2_500;

/**
 * Cuánto puede estar sonando una llamada antes de darla por muerta.
 *
 * Meta la corta sola entre los 30 y los 60 segundos. El aviso de que se cortó
 * llega por el webhook, pero puede no llegar: se cae la red, el reintento se
 * pierde. Sin este tope, una fila que quedó en «sonando» haría sonar el
 * teléfono para siempre en todas las pantallas, por una llamada que se cortó
 * hace media hora.
 */
export const SEGUNDOS_QUE_SUENA = 75;

const FINALES = new Set(["terminada", "rechazada", "perdida", "fallida"]);

/** Terminó: no se muestra más, venga como venga. */
export const yaTermino = (l: LlamadaEnVivo): boolean => FINALES.has(l.estado);

/**
 * Se colgó sola: quedó sonando y pasó el plazo sin que llegara el aviso de
 * corte. Se trata como terminada aunque la fila diga otra cosa.
 */
export function quedoColgada(l: LlamadaEnVivo, ahora: number): boolean {
  if (l.estado !== "sonando") return false;
  const entro = Date.parse(l.creadoEn);
  if (Number.isNaN(entro)) return false;
  return ahora - entro > SEGUNDOS_QUE_SUENA * 1000;
}

/** La persona está en algo que un pop-up echaría a perder. */
export function estaOcupado(q: QueEstaHaciendo): boolean {
  if (q.arrastrando) return true;
  return q.tecleoHaceMs != null && q.tecleoHaceMs < PAUSA_PARA_INTERRUMPIR_MS;
}

export interface Veredicto {
  presencia: Presencia;
  /**
   * Por qué. No es decorado: es lo que la tarjeta de la esquina dice en una
   * línea —«Es de Katya», «Sin asignar»— para que quien la ve sepa si le toca
   * o si sólo está mirando.
   */
  porque:
    | "es-mia"
    | "sin-asignar"
    | "es-de-otro"
    | "la-estoy-atendiendo"
    | "la-atiende-otro"
    | "estoy-escribiendo"
    | "yo-la-hice"
    | "termino";
}

/**
 * Qué hacer con esta llamada, en ESTA pantalla y en este momento.
 *
 * ----------------------------------------------------------------------------
 * EL ORDEN DE LAS PREGUNTAS IMPORTA
 * ----------------------------------------------------------------------------
 *
 * 1. ¿Terminó? Entonces nada, y no se sigue preguntando. Es lo primero porque
 *    es lo que hace desaparecer la tarjeta en las otras cuatro pantallas en
 *    cuanto una persona atiende, sin que nadie tenga que cerrarla a mano.
 *
 * 2. ¿Es una que marqué yo y todavía suena? Entonces a la esquina, diciendo
 *    «Llamando…». Va antes que la siguiente porque una saliente nace ya
 *    atendida por quien la marcó, y sin esta pregunta caería en la de abajo y
 *    diría «En llamada» mientras al cliente recién le suena el teléfono.
 *
 * 3. ¿Ya la agarró alguien? Si fui yo, la sigo viendo —tengo que poder colgar—;
 *    si fue otro, se me va de la pantalla.
 *
 * 4. ¿Es mía? El hilo tiene dueño y el dueño es quien la contesta. Un hilo sin
 *    dueño es de todos: ahí sí interrumpe en todas las pantallas, porque si no
 *    interrumpiera en ninguna no la atendería nadie.
 *
 * 5. ¿Estoy escribiendo? Aunque sea mía, no me la tires encima ahora. Se queda
 *    en la esquina sonando y sube sola cuando pare.
 */
export function comoSeMuestra(
  llamada: LlamadaEnVivo,
  yo: Quien,
  duenoDelHilo: number | null,
  haciendo: QueEstaHaciendo,
  ahora: number = Date.now(),
): Veredicto {
  if (yaTermino(llamada) || quedoColgada(llamada, ahora)) {
    return { presencia: "nada", porque: "termino" };
  }

  /*
   * La que marqué yo y todavía está sonando del otro lado.
   *
   * Va ANTES de «ya la agarró alguien», y ese orden es el arreglo.
   *
   * Una saliente nace con `atendidaPor` puesto: la escribe así `llamarA`,
   * porque quien apretó «Llamar» ya la está atendiendo y nadie más tiene que
   * verla sonar. El efecto no buscado era que caía en la rama de abajo y la
   * tarjeta decía «En llamada.» desde el primer segundo, mientras al cliente
   * recién le estaba sonando el teléfono. Quien marcaba leía que ya estaba
   * hablando y no escuchaba a nadie.
   *
   * Con esto dice «Llamando…» hasta que Meta contesta —ahí la fila pasa a
   * `en_curso`— y recién entonces «En llamada».
   */
  if (llamada.direccion === "saliente" && llamada.estado === "sonando") {
    /*
     * Sin `atendidaPor` la fila no dice quién marcó, y ahí la ve cualquiera
     * que tenga sesión: es como se comportaba antes y no hay con qué hacerlo
     * mejor. Pasa sólo con filas escritas a mano o de antes de que `llamarA`
     * lo pusiera; las de verdad siempre lo traen.
     */
    const laMarqueYo =
      llamada.atendidaPor == null
        ? yo.usuarioId != null
        : llamada.atendidaPor === yo.usuarioId;

    return laMarqueYo
      ? { presencia: "esquina", porque: "yo-la-hice" }
      : { presencia: "nada", porque: "es-de-otro" };
  }

  // Ya la agarró alguien.
  if (llamada.atendidaPor != null) {
    return llamada.atendidaPor === yo.usuarioId
      ? // En curso va SIEMPRE a la esquina, incluso siendo mía: se está
        // hablando, y tapar la pantalla con un pop-up mientras se habla es
        // justo lo contrario de lo que hace falta —hay que poder mirar la
        // ficha del cliente con el que uno está hablando.
        { presencia: "esquina", porque: "la-estoy-atendiendo" }
      : { presencia: "nada", porque: "la-atiende-otro" };
  }

  /*
   * Una saliente que no está sonando y que nadie tomó.
   *
   * Queda para el caso raro de una fila saliente sin `atendidaPor` —una
   * escrita a mano, o una vieja de antes de que `llamarA` lo pusiera—. Las
   * normales las agarra la regla de arriba mientras suenan, y la de «ya la
   * agarró alguien» una vez que están en curso.
   *
   * Sale de la pantalla de quien la hizo y de ninguna otra: nadie más necesita
   * ver sonar una llamada que no va a atender. Y siempre en la esquina, porque
   * quien acaba de apretar «Llamar» ya sabe que está llamando; un pop-up
   * encima no le agrega nada y le tapa la ficha que estaba leyendo.
   */
  if (llamada.direccion === "saliente") {
    return yo.usuarioId != null && llamada.atendidaPor === null
      ? { presencia: "esquina", porque: "yo-la-hice" }
      : { presencia: "nada", porque: "es-de-otro" };
  }

  const sinAsignar = duenoDelHilo == null;
  const esMia = duenoDelHilo != null && duenoDelHilo === yo.vendedorId;

  /*
   * Ni mía ni de nadie: a la esquina.
   *
   * Se ve igual, y a propósito. Que suene en la pantalla de todo el equipo es
   * lo que permite que alguien la agarre cuando la dueña del hilo salió a
   * almorzar; que suene chiquito es lo que evita que la agarren cinco.
   */
  if (!esMia && !sinAsignar) {
    return { presencia: "esquina", porque: "es-de-otro" };
  }

  /*
   * Sin asignar y yo no atiendo clientes —dirección, sin fila de asesor—:
   * también a la esquina. El pop-up es para quien puede contestar.
   */
  if (sinAsignar && yo.vendedorId == null) {
    return { presencia: "esquina", porque: "sin-asignar" };
  }

  // Es para mí. Falta la última pregunta, que es la que pidió la escuela.
  if (estaOcupado(haciendo)) {
    return { presencia: "esquina", porque: "estoy-escribiendo" };
  }

  return { presencia: "pop-up", porque: esMia ? "es-mia" : "sin-asignar" };
}

/** La línea que va en la tarjeta, debajo del nombre. */
export function porQueLoVeo(porque: Veredicto["porque"], dueno: string | null): string {
  switch (porque) {
    case "es-mia":
      return "Te toca a vos.";
    case "sin-asignar":
      return "El hilo no tiene asesora asignada: puede atenderla cualquiera.";
    case "es-de-otro":
      return dueno ? `El hilo es de ${dueno}. Podés atenderla si no puede.` : "El hilo es de otra persona.";
    case "la-estoy-atendiendo":
      return "En llamada.";
    case "estoy-escribiendo":
      return "Está sonando. Terminá lo que estás escribiendo y se abre sola.";
    case "yo-la-hice":
      return "Llamando…";
    default:
      return "";
  }
}

/**
 * El reloj de la llamada: «0:07», «1:42», «12:05».
 *
 * Sin horas a propósito. Una llamada de venta que pase de una hora es un caso
 * que no existe, y dejar «00:07:32» en una tarjeta del tamaño de un botón
 * gasta el ancho que necesita el nombre del cliente.
 */
export function comoReloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Cómo se cuenta una llamada en la ficha y en el hilo.
 *
 * La diferencia entre «perdida» y «rechazada» es la que le importa a quien
 * mira la bandeja al otro día: una perdida es trabajo pendiente —hay que
 * devolverla— y una rechazada ya la decidió alguien.
 */
export function comoSeLee(l: Pick<LlamadaEnVivo, "estado" | "direccion">, duracionSeg: number | null): string {
  const cuanto = duracionSeg != null && duracionSeg > 0 ? ` · ${comoReloj(duracionSeg)}` : "";
  switch (l.estado) {
    case "terminada":
      return (l.direccion === "entrante" ? "Llamada recibida" : "Llamada realizada") + cuanto;
    case "perdida":
      return l.direccion === "entrante" ? "Llamada perdida" : "No contestó";
    case "rechazada":
      return "Llamada rechazada";
    case "fallida":
      return "La llamada no se pudo establecer";
    case "en_curso":
    case "contestando":
      return "En llamada";
    default:
      return l.direccion === "entrante" ? "Llamada entrante" : "Llamando";
  }
}
