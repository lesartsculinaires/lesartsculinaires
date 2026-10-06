/**
 * Las citas que la gente agenda desde Messenger e Instagram.
 *
 * ============================================================================
 * YA ESTABAN LLEGANDO, Y SE PERDÍAN EN SILENCIO
 * ============================================================================
 *
 * Meta manda la cita por el mismo webhook que los mensajes, como un adjunto:
 *
 *     "attachments": [{
 *       "type": "appointment_booking",
 *       "payload": {
 *         "status": "requested",
 *         "booking_id": "1484383103529238",
 *         "start_time": 1790890200,
 *         "end_time": 1790892000,
 *         "timezone": "America/El_Salvador"
 *       }
 *     }]
 *
 * Pero el lector de adjuntos se iba con `null` cuando el adjunto no traía
 * `url` —y una cita no trae—, así que el mensaje se guardaba con tipo «text» y
 * el texto vacío. En la bandeja quedaba una burbuja en blanco.
 *
 * Eso pasó de verdad: el 1 de octubre de 2026 alguien pidió cita para las 3:30
 * de la tarde y en el CRM no se vio nada. La cita estaba en la base desde el
 * primer día, entera, dentro de `payload`.
 *
 * ============================================================================
 * LAS HORAS SON UNIX, Y LA ZONA VIENE APARTE
 * ============================================================================
 *
 * `start_time` y `end_time` son segundos, no milisegundos: multiplicarlos mal
 * manda la cita al año 58.700 y nadie lo nota hasta que alguien abre la agenda.
 *
 * Y la zona importa. El servidor corre en UTC, así que una cita de las 3:30 de
 * la tarde en San Salvador se leería como las 9:30 de la noche si se formatea
 * con la zona de la máquina. Meta manda la zona en el mismo bulto, y es la que
 * se usa.
 */

/** Una cita, ya leída. */
export interface Cita {
  /** El id que le puso Meta. Es lo que hila la solicitud con su confirmación. */
  bookingId: string;
  /** Tal como lo manda Meta: `requested`, `confirmed`, `canceled`… */
  estado: string;
  inicia: Date;
  /** Meta no siempre lo manda. */
  termina: Date | null;
  /** La zona de la cita, no la del servidor. */
  zona: string;
}

/** Si Meta no dice la zona, la de la escuela. */
export const ZONA_POR_DEFECTO = "America/El_Salvador";

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Los segundos de Meta, pasados a fecha.
 *
 * Meta los manda como número, pero por el webhook han llegado como texto más de
 * una vez —`"1790890200"`—, así que se aceptan los dos. Lo que no se acepta es
 * cualquier cosa: sin una fecha de inicio no hay cita que mostrar, y media cita
 * en la agenda es peor que ninguna.
 */
function cuando(v: unknown): Date | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const f = new Date(n * 1000);
  return Number.isNaN(f.getTime()) ? null : f;
}

/**
 * La cita que venía en los adjuntos de un mensaje, si venía alguna.
 *
 * Recorre todos y no sólo el primero: un mensaje con una foto Y una cita existe
 * en el papel de Meta, y mirar sólo el primer adjunto la perdería según en qué
 * orden los mande.
 */
export function leerCita(attachments: unknown): Cita | null {
  const lista = Array.isArray(attachments) ? attachments : [];

  for (const a of lista) {
    const adjunto = obj(a);
    if (!adjunto || texto(adjunto.type) !== "appointment_booking") continue;

    const p = obj(adjunto.payload);
    if (!p) continue;

    const inicia = cuando(p.start_time);
    if (!inicia) continue;

    return {
      bookingId: texto(p.booking_id) ?? "",
      estado: texto(p.status) ?? "requested",
      inicia,
      termina: cuando(p.end_time),
      zona: texto(p.timezone) ?? ZONA_POR_DEFECTO,
    };
  }

  return null;
}

/**
 * Cuánto dura, en minutos.
 *
 * Sin hora de fin se asume media hora, que es lo que Meta pone por omisión.
 * Devolver cero haría que la agenda la dibuje como una raya sin alto.
 */
export function duracionEnMinutos(c: Cita): number {
  if (!c.termina) return 30;
  const min = Math.round((c.termina.getTime() - c.inicia.getTime()) / 60000);
  return min > 0 ? min : 30;
}

/**
 * Cómo se llama cada estado acá.
 *
 * Los que Meta usa hoy. Uno que no esté en la tabla se muestra tal cual en vez
 * de esconderse detrás de «Cita»: si Meta agrega un estado, quien atiende tiene
 * que poder verlo y pedir que se arregle, no quedarse con una palabra genérica.
 */
const COMO_SE_DICE: Record<string, string> = {
  requested: "Cita solicitada",
  confirmed: "Cita confirmada",
  canceled: "Cita cancelada",
  cancelled: "Cita cancelada",
  rescheduled: "Cita reagendada",
  completed: "Cita realizada",
};

export function estadoEnCastellano(estado: string): string {
  return COMO_SE_DICE[estado.toLowerCase()] ?? `Cita (${estado})`;
}

/** Si la cita sigue en pie, o ya se cayó. */
export function sigueEnPie(c: Cita): boolean {
  const e = c.estado.toLowerCase();
  return e !== "canceled" && e !== "cancelled";
}

/**
 * El día y la hora, en la zona de la cita.
 *
 * `es-SV` y no `es`: en El Salvador se escribe «3:30 p. m.» y la fecha va
 * día-mes. Es lo que la asesora va a copiar en un mensaje.
 */
export function cuandoSeLee(c: Cita): string {
  const f = new Intl.DateTimeFormat("es-SV", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: c.zona,
  });
  return f.format(c.inicia);
}

/**
 * La línea que se guarda como texto del mensaje.
 *
 * Se guarda en la base y no se arma sólo al dibujar, a propósito: es lo que ve
 * la lista de conversaciones, lo que encuentra el buscador y lo que queda en la
 * bitácora. Una cita que sólo existiera como tarjeta no aparecería buscando
 * «cita».
 */
export function comoSeLee(c: Cita): string {
  return `${estadoEnCastellano(c.estado)}${SEPARADOR}${cuandoSeLee(c)}`;
}

/** Lo que separa el qué del cuándo dentro de la línea guardada. */
export const SEPARADOR = ": ";

/**
 * La línea guardada, partida en sus dos mitades para dibujarla.
 *
 * La tarjeta del hilo quiere el estado arriba y la fecha abajo, en otro cuerpo.
 * Podría partir el texto por su cuenta, pero entonces la pantalla sabría cómo
 * se arma la línea y `comoSeLee` no podría cambiarla sin romperla en silencio.
 * Partir acá deja las dos puntas en el mismo archivo, con la misma prueba.
 *
 * Es a propósito que no vuelva a leer la cita de `payload`: eso obligaría a
 * mandarle al navegador la carga cruda de Meta —el id interno de la persona
 * entre otras cosas— para dibujar dos renglones.
 */
export function partirLoDicho(linea: string): { que: string; cuando: string | null } {
  const corte = linea.indexOf(SEPARADOR);
  if (corte < 0) return { que: linea, cuando: null };
  return {
    que: linea.slice(0, corte),
    cuando: linea.slice(corte + SEPARADOR.length) || null,
  };
}
