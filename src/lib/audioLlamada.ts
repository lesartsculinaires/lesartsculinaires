/**
 * El audio de una llamada de WhatsApp, del lado del navegador.
 *
 * ============================================================================
 * DÓNDE PASA LA VOZ
 * ============================================================================
 *
 * Del navegador a Meta y de Meta al teléfono del cliente. NO por nuestro
 * servidor. Meta habla WebRTC —el mismo protocolo de las videollamadas del
 * navegador— y eso es lo que hace que todo esto sea posible en Netlify: una
 * función serverless tiene diez segundos de vida y no podría sostener una
 * llamada de cinco minutos, pero sí pasar un texto de dos kilobytes.
 *
 * Ese texto es el SDP: la lista de por dónde y con qué códec se puede hablar.
 * Se manda una vez, al principio, y después el audio va por su cuenta.
 */

/**
 * Los servidores que le dicen al navegador cuál es su dirección vista desde
 * afuera.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ HACEN FALTA
 * ----------------------------------------------------------------------------
 *
 * Detrás del router de la escuela, la computadora se llama a sí misma
 * 192.168.algo, que no significa nada fuera de esa oficina. Mandarle eso a
 * Meta sería darle una dirección a la que no puede llegar, y la llamada se
 * conectaría en silencio: los dos lados creyendo que están hablando y ninguno
 * escuchando al otro.
 *
 * Un servidor STUN existe sólo para contestar «te veo entrando desde tal
 * dirección». No pasa audio ni ve nada de la conversación.
 *
 * ----------------------------------------------------------------------------
 * SI ALGÚN DÍA NO ALCANZA
 * ----------------------------------------------------------------------------
 *
 * En una red muy cerrada —algunas redes corporativas, algunos hoteles— STUN no
 * alcanza y hace falta un TURN, que sí retransmite el audio y por eso se paga.
 * Se cambia por `NEXT_PUBLIC_ICE_SERVERS` sin tocar el código: una lista de
 * URLs separadas por coma. Es pública a propósito —el navegador la necesita— y
 * por eso no debe llevar credenciales de un TURN pago; para eso habría que
 * pedirlas al servidor, y hoy no hace falta.
 */
const POR_OMISION = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

const servidores = (): RTCIceServer[] => {
  const puesto = process.env.NEXT_PUBLIC_ICE_SERVERS;
  const urls = puesto
    ? puesto.split(",").map((s) => s.trim()).filter(Boolean)
    : POR_OMISION;
  return urls.length > 0 ? [{ urls }] : [];
};

/** ¿Este navegador puede llamar? */
export const hayWebRTC = (): boolean =>
  typeof window !== "undefined" &&
  typeof RTCPeerConnection !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

export function crearConexion(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: servidores() });
}

/**
 * Espera a que el navegador termine de juntar por dónde se puede hablar.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE ESPERA EN VEZ DE MANDAR Y SEGUIR
 * ----------------------------------------------------------------------------
 *
 * Lo normal en WebRTC es ir mandando los caminos de a uno a medida que
 * aparecen —«trickle ICE»—, porque conecta antes. Eso necesita un canal
 * abierto con la otra punta para irlos pasando, y con Meta no lo hay: el SDP
 * se manda UNA vez, dentro de la orden de contestar. Lo que no esté ahí, no
 * llega nunca.
 *
 * ----------------------------------------------------------------------------
 * Y POR QUÉ HAY UN TOPE
 * ----------------------------------------------------------------------------
 *
 * Porque el que manda es el reloj de Meta: entre 30 y 60 segundos desde que
 * suena hasta que la da por no contestada, y buena parte ya se gastó llegando
 * hasta acá. Si un servidor STUN no responde —red que lo bloquea, DNS lento—,
 * `complete` no llega nunca y esperarlo sería perder la llamada por buscar un
 * camino de más.
 *
 * A los dos segundos ya están los caminos locales y casi siempre el de afuera.
 * Se manda con lo que haya, que es mejor que no mandar.
 */
export function esperarCandidatos(pc: RTCPeerConnection, topeMs = 2_000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((listo) => {
    let terminado = false;
    const acabar = () => {
      if (terminado) return;
      terminado = true;
      pc.removeEventListener("icegatheringstatechange", mirar);
      window.clearTimeout(reloj);
      listo();
    };

    const mirar = () => {
      if (pc.iceGatheringState === "complete") acabar();
    };

    pc.addEventListener("icegatheringstatechange", mirar);
    const reloj = window.setTimeout(acabar, topeMs);
  });
}

/**
 * Cierra todo lo del audio: el micrófono, la conexión y el parlante.
 *
 * El micrófono importa más que lo demás. Una pista que no se detiene deja la
 * lucecita del micrófono prendida y el navegador escuchando después de colgar,
 * y eso en una oficina donde se habla de otros clientes no es un descuido
 * menor.
 */
export function cerrarTodo(
  pc: RTCPeerConnection | null,
  micro: MediaStream | null,
  parlante: HTMLAudioElement | null,
): void {
  for (const pista of micro?.getTracks() ?? []) pista.stop();

  if (pc) {
    // Los manejadores se sueltan antes de cerrar: si no, el cierre dispara un
    // último cambio de estado y quien lo escucha intenta actuar sobre una
    // conexión que ya no existe.
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    try {
      pc.close();
    } catch {
      // Ya estaba cerrada. No hay nada que hacer ni nada que avisar.
    }
  }

  if (parlante) parlante.srcObject = null;
}

/**
 * Traduce al castellano lo que puede salir mal al pedir el micrófono.
 *
 * Los nombres que tira el navegador son de especificación —`NotAllowedError`—
 * y no le dicen nada a quien está atendiendo. Cada uno de éstos tiene un
 * arreglo distinto, y decirlo mal manda a buscar el problema donde no está.
 */
export function porQueNoHayMicrofono(e: unknown): string {
  const nombre = e instanceof Error ? e.name : "";

  switch (nombre) {
    case "NotAllowedError":
    case "SecurityError":
      return (
        "El navegador no dejó usar el micrófono. Hay que darle permiso desde el " +
        "candado de la barra de direcciones y volver a intentar."
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró ningún micrófono en esta computadora.";
    case "NotReadableError":
      return "El micrófono lo está usando otro programa. Cerrá la otra llamada y probá de nuevo.";
    default:
      return e instanceof Error && e.message
        ? e.message
        : "No se pudo abrir el micrófono en este navegador.";
  }
}
