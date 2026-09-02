/**
 * Lectura de los avisos de llamada del webhook de Meta.
 *
 * Va aparte y sin nada del servidor, igual que `mensajes.ts`, para poder
 * probarlo con cargas reales sin levantar nada. Y por la misma razón de
 * siempre: el formato de Meta es hondo y lleno de arreglos que a veces vienen
 * y a veces no, así que cada acceso asume lo mínimo.
 *
 * ============================================================================
 * QUÉ MANDA META Y QUÉ NO
 * ============================================================================
 *
 * Una llamada no es un mensaje. El audio nunca pasa por acá: va por WebRTC
 * entre el navegador de quien atiende y Meta, y de Meta al teléfono del
 * cliente. Lo único que llega por el webhook son dos avisos:
 *
 *   connect     Empieza. Trae el SDP —el papelito con el que las dos puntas se
 *               ponen de acuerdo sobre códecs y direcciones—. En una llamada
 *               que empezó el cliente es una OFERTA que hay que contestar; en
 *               una que empezamos nosotros es la RESPUESTA a nuestra oferta.
 *
 *   terminate   Se acabó, y con qué resultado. Es lo único que dice cuánto
 *               duró de verdad: el reloj de Meta cuenta desde que se estableció
 *               el audio, no desde que empezó a sonar.
 *
 * ============================================================================
 * EL RELOJ
 * ============================================================================
 *
 * Desde el `connect` hay entre 30 y 60 segundos para contestar antes de que
 * Meta la dé por no atendida. Todo lo de este archivo tiene que ser instantáneo
 * —es leer un objeto— porque el presupuesto de tiempo se gasta después:
 * escribir la fila, que salga el aviso por websocket y que alguien apriete.
 */

/** Un aviso de llamada, ya leído. */
export interface AvisoDeLlamada {
  /** El id que le puso Meta. Es con lo que se le contesta. */
  callId: string;
  /** El teléfono del CLIENTE, sea quien sea el que llamó. Sólo dígitos. */
  telefono: string;
  nombrePerfil: string | null;
  evento: "connect" | "terminate";
  /** `true` cuando llamó el cliente; `false` cuando llamamos nosotros. */
  laEmpezoElCliente: boolean;
  /** Sólo en `connect`. Es lo que el navegador necesita para armar el audio. */
  sdp: { tipo: "offer" | "answer"; texto: string } | null;
  cuando: Date;
  /** Sólo en `terminate`. */
  cierre: Cierre | null;
  /** El objeto tal cual vino, para no perder lo que hoy no se usa. */
  crudo: unknown;
}

export interface Cierre {
  /** Lo que dice Meta: `COMPLETED`, `FAILED`… en mayúsculas y tal cual. */
  resultado: string | null;
  /** Segundos de audio. Nulo si nunca llegó a establecerse. */
  duracionSeg: number | null;
  /** El texto del error, cuando lo hay. */
  motivo: string | null;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const digitos = (v: string): string => v.replace(/\D/g, "");

/**
 * Saca los avisos de llamada de una carga del webhook.
 *
 * Lo que no se entiende se salta en silencio, como en el resto del webhook: si
 * devolviéramos error, Meta reintenta y termina desactivando la integración
 * entera, y por un aviso de llamada raro se perderían también los mensajes.
 *
 * Una misma carga puede traer varias: Meta agrupa cuando llegan juntas.
 */
export function leerLlamadas(carga: unknown): AvisoDeLlamada[] {
  const salida: AvisoDeLlamada[] = [];

  const raiz = obj(carga);
  if (!raiz) return salida;

  for (const entrada of lista(raiz.entry)) {
    for (const cambio of lista(obj(entrada)?.changes)) {
      const valor = obj(obj(cambio)?.value);
      if (!valor) continue;

      // Los nombres de perfil vienen aparte, emparejados por teléfono, igual
      // que en los mensajes. Se indexan una vez y no por llamada.
      const nombres = new Map<string, string>();
      for (const c of lista(valor.contacts)) {
        const contacto = obj(c);
        const wa = texto(contacto?.wa_id);
        const nombre = texto(obj(contacto?.profile)?.name);
        if (wa && nombre) nombres.set(digitos(wa), nombre);
      }

      for (const c of lista(valor.calls)) {
        const leida = leerUna(c, nombres);
        if (leida) salida.push(leida);
      }
    }
  }

  return salida;
}

function leerUna(
  cruda: unknown,
  nombres: Map<string, string>,
): AvisoDeLlamada | null {
  const c = obj(cruda);
  const callId = texto(c?.id);
  if (!c || !callId) return null;

  const evento = texto(c.event)?.toLowerCase();
  if (evento !== "connect" && evento !== "terminate") return null;

  /*
   * De quién es el teléfono que nos interesa.
   *
   * En `from` y `to` está la llamada tal como la ve Meta, y cuál de los dos es
   * el cliente depende de quién marcó. Tomar siempre `from` dejaría las
   * salientes guardadas contra NUESTRO propio número, y el hilo de la bandeja
   * al que pertenecen no se encontraría nunca.
   */
  const laEmpezoElCliente = !/business/i.test(texto(c.direction) ?? "");
  const suyo = laEmpezoElCliente ? texto(c.from) : texto(c.to);
  const telefono = digitos(suyo ?? "");
  if (!telefono) return null;

  const marca = texto(c.timestamp);
  // Meta manda segundos desde epoch, no milisegundos.
  const cuando = marca ? new Date(Number(marca) * 1000) : new Date();

  return {
    callId,
    telefono,
    nombrePerfil: nombres.get(telefono) ?? null,
    evento,
    laEmpezoElCliente,
    sdp: evento === "connect" ? leerSdp(c.session) : null,
    cuando,
    cierre: evento === "terminate" ? leerCierre(c) : null,
    crudo: cruda,
  };
}

/**
 * El SDP de la otra punta.
 *
 * Sin esto no hay llamada: es lo único con lo que el navegador puede armar el
 * audio. Un `connect` que llegue sin SDP no es atendible, y devolver null es
 * lo que después permite decirlo —«no se pudo establecer»— en vez de dejar el
 * teléfono sonando contra nada.
 */
function leerSdp(cruda: unknown): { tipo: "offer" | "answer"; texto: string } | null {
  const s = obj(cruda);
  const cuerpo = texto(s?.sdp);
  if (!cuerpo) return null;

  const tipo = texto(s?.sdp_type)?.toLowerCase();
  if (tipo !== "offer" && tipo !== "answer") return null;

  return { tipo, texto: cuerpo };
}

function leerCierre(c: Record<string, unknown>): Cierre {
  const primerError = obj(lista(c.errors)[0]);
  const duracion = c.duration;

  return {
    resultado: texto(c.status)?.toUpperCase() ?? null,
    duracionSeg: typeof duracion === "number" && Number.isFinite(duracion) ? duracion : null,
    motivo: texto(primerError?.title) ?? texto(primerError?.message),
  };
}

/**
 * Cómo se guarda una llamada que terminó.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ NO ALCANZA CON LO QUE DICE META
 * ----------------------------------------------------------------------------
 *
 * Para Meta una llamada que nadie atendió y una que se rechazó terminan igual:
 * las dos son «no hubo audio». Para la escuela no son lo mismo. Una perdida es
 * trabajo pendiente —hay que devolverla— y una rechazada es una decisión que
 * alguien ya tomó.
 *
 * La diferencia la sabe el CRM, no Meta: la sabe porque tiene anotado si
 * alguien llegó a agarrarla antes de que se cortara.
 */
export function comoTermino(
  resultado: string | null,
  seLlegoAAtender: boolean,
): "terminada" | "perdida" | "fallida" {
  if (seLlegoAAtender) return resultado === "FAILED" ? "fallida" : "terminada";
  // Nadie la agarró: para quien mira la bandeja eso es una llamada perdida,
  // se haya cortado el cliente o vencido el plazo de Meta.
  return "perdida";
}
