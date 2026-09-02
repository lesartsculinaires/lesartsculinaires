/**
 * A quién se le puede llamar, y a quién hay que pedirle permiso primero.
 *
 * ============================================================================
 * POR QUÉ EXISTE ESTA REGLA
 * ============================================================================
 *
 * WhatsApp no deja llamarle a cualquiera. La persona tiene que haber aceptado
 * antes, desde su teléfono, y el permiso se vence.
 *
 * Sin esto, la bandeja mostraría siempre el mismo botón «Llamar» y el equipo
 * descubriría el permiso de la peor manera: apretándolo, esperando a que el
 * navegador pida el micrófono, y recibiendo un error con el cliente del otro
 * lado. La regla de acá es la que hace que el botón que se ve sea siempre el
 * que va a funcionar.
 *
 * ============================================================================
 * LA OTRA MITAD: PEDIRLO TAMPOCO ES GRATIS
 * ============================================================================
 *
 * La solicitud de permiso viaja como un mensaje, así que le aplican las dos
 * reglas de los mensajes: no se le puede escribir a alguien que hace más de 24
 * horas que no escribe, y Meta limita cuántas veces se puede pedir.
 *
 * Y hay una regla nuestra que ninguna de las dos cubre: en la escuela hay
 * varias asesoras mirando la misma bandeja. Sin un freno, tres personas le
 * mandan la misma solicitud a la misma señora en la misma tarde.
 */

export interface PermisoDelHilo {
  /** Hasta cuándo se puede llamar, según Meta. Nulo si nunca aceptó. */
  hasta: string | null;
  /** Cuándo se le mandó la última solicitud. */
  pedidoEn: string | null;
  /** Qué contestó la última vez. */
  respuesta: "acepto" | "rechazo" | null;
}

/**
 * Cuánto se espera antes de volver a pedirle el permiso a la misma persona.
 *
 * Un día. No sale de un límite de Meta —ése existe y es aparte—: sale de que
 * en la escuela son varias asesoras sobre la misma bandeja, y sin freno la
 * misma señora recibiría tres solicitudes iguales en una tarde de tres
 * personas distintas. Para el cliente eso no se lee como interés; se lee como
 * que le están escribiendo de más, y lo que hace es bloquear el número.
 */
export const ESPERA_PARA_VOLVER_A_PEDIR_HORAS = 24;

/**
 * La ventana de WhatsApp para escribirle a alguien sin plantilla.
 *
 * La solicitud de permiso es un mensaje, así que cae adentro de ésta. Pasadas
 * las 24 horas desde el último mensaje de la persona, Meta la rechaza.
 */
export const VENTANA_HORAS = 24;

const cuando = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const horasDesde = (iso: string | null | undefined, ahora: number): number | null => {
  const t = cuando(iso);
  return t == null ? null : (ahora - t) / 3_600_000;
};

/** Hay permiso vigente: se puede llamar ahora mismo. */
export function sePuedeLlamar(p: PermisoDelHilo, ahora: number = Date.now()): boolean {
  const vence = cuando(p.hasta);
  return vence != null && vence > ahora;
}

/**
 * Qué se le puede ofrecer a quien está mirando este hilo.
 *
 * Uno solo, y es a propósito: dos botones que hacen cosas parecidas —«Llamar»
 * y «Pedir permiso»— obligan a quien atiende a saber cuál toca, que es
 * justamente lo que esta regla existe para no tener que saber.
 */
export type QueOfrecer =
  /** Hay permiso: el botón llama. */
  | "llamar"
  /** No hay: el botón pide el permiso. */
  | "pedir"
  /** Ya se le pidió hace poco y todavía no contestó: se espera. */
  | "esperando"
  /** Dijo que no. No se le insiste. */
  | "dijo-que-no"
  /** Hace más de 24 h que no escribe: ni siquiera se le puede pedir. */
  | "ventana-cerrada";

/**
 * El orden de las preguntas es la regla.
 *
 * 1. ¿Hay permiso vigente? Entonces llamar, y no se pregunta nada más. Vale
 *    aunque antes hubiera dicho que no: si volvió a aceptar, la última palabra
 *    es la que manda.
 *
 * 2. ¿Ya se le pidió hace poco? Se espera. Va ANTES que «dijo que no» porque
 *    un pedido reciente sin respuesta es lo más común de todo, y decirle a la
 *    asesora «esperá» es más útil que dejarla apretar un botón que va a
 *    mandarle un segundo mensaje idéntico.
 *
 * 3. ¿Dijo que no? No se le insiste desde el CRM. Si hace falta, se habla por
 *    chat y la persona puede aceptar desde el mensaje que ya tiene.
 *
 * 4. ¿Se le puede escribir? La solicitud es un mensaje: pasadas las 24 horas
 *    desde el último suyo, Meta la rechaza y el botón sería una promesa falsa.
 */
export function queOfrecer(
  p: PermisoDelHilo,
  /** Cuándo escribió el cliente por última vez. Nulo si nunca escribió. */
  ultimoEntranteEn: string | null,
  ahora: number = Date.now(),
): QueOfrecer {
  if (sePuedeLlamar(p, ahora)) return "llamar";

  const desdeElPedido = horasDesde(p.pedidoEn, ahora);
  if (desdeElPedido != null && desdeElPedido < ESPERA_PARA_VOLVER_A_PEDIR_HORAS) {
    // Salvo que ya haya contestado que no: ahí no se está esperando nada.
    if (p.respuesta !== "rechazo") return "esperando";
  }

  if (p.respuesta === "rechazo") return "dijo-que-no";

  const desdeQueEscribio = horasDesde(ultimoEntranteEn, ahora);
  if (desdeQueEscribio == null || desdeQueEscribio >= VENTANA_HORAS) {
    return "ventana-cerrada";
  }

  return "pedir";
}

/**
 * Cómo se lo cuenta la bandeja a quien está atendiendo.
 *
 * En una línea y sin tecnicismos: quien atiende no tiene por qué saber qué es
 * una ventana de 24 horas ni un permiso de llamada de la API. Lo que necesita
 * saber es qué puede hacer ahora y qué no.
 */
export function comoSeExplica(q: QueOfrecer, p: PermisoDelHilo): string {
  switch (q) {
    case "llamar": {
      const vence = cuando(p.hasta);
      if (vence == null) return "Se le puede llamar por WhatsApp.";
      const dias = Math.floor((vence - Date.now()) / 86_400_000);
      if (dias >= 1) return `Aceptó que lo llamemos. El permiso vale ${dias} día${dias === 1 ? "" : "s"} más.`;
      return "Aceptó que lo llamemos. El permiso vence hoy.";
    }
    case "pedir":
      return "Para llamarlo hace falta que él lo acepte. Se le manda la solicitud y le llega como un mensaje con un botón.";
    case "esperando":
      return "Ya se le mandó la solicitud y todavía no contestó. Cuando acepte, el botón cambia a «Llamar» solo.";
    case "dijo-que-no":
      return "No aceptó que lo llamemos, así que el CRM no se lo vuelve a pedir. Se puede seguir por chat.";
    case "ventana-cerrada":
      return "Hace más de 24 horas que no escribe, y WhatsApp no deja mandarle la solicitud hasta que vuelva a escribir.";
  }
}

/** Lo que dice el botón. Null cuando no hay botón que ofrecer. */
export function comoSeLlamaElBoton(q: QueOfrecer): string | null {
  switch (q) {
    case "llamar":
      return "Llamar";
    case "pedir":
      return "Pedir permiso para llamar";
    default:
      // «Esperando», «dijo que no» y «ventana cerrada» no tienen botón: no hay
      // nada que apretar que vaya a funcionar, y ofrecerlo igual sería mentir.
      return null;
  }
}
