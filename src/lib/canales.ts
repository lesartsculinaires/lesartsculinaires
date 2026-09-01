/**
 * Los canales de la bandeja: WhatsApp hoy, Instagram, Messenger y TikTok
 * cuando se conecten.
 *
 * ============================================================================
 * POR QUÉ ESTO EXISTE ANTES DE QUE HAYA NADA CONECTADO
 * ============================================================================
 *
 * Porque la diferencia entre «agregar Instagram» y «rehacer la bandeja» se
 * decide ahora. La bandeja se escribió para un solo canal: los mensajes salen
 * por `enviar.ts`, la ventana de 24 horas está escrita en la pantalla, y el
 * botón de plantillas asume que existen plantillas aprobadas. Nada de eso vale
 * igual en Instagram.
 *
 * Con este archivo, cada pantalla pregunta qué puede hacer el canal en vez de
 * suponerlo. El día que llegue el token de Instagram lo que hay que escribir es
 * el envío y el webhook; la bandeja ya sabe qué mostrar y qué esconder.
 *
 * ============================================================================
 * LO QUE ACÁ SE DICE ES LO QUE DE VERDAD SE PUEDE
 * ============================================================================
 *
 * La tentación es poner los cuatro canales con las mismas casillas marcadas y
 * que se vea parejo. Sería mentira, y la mentira aparecería recién el día que
 * alguien intente usarlo: no todas las plataformas dejan hacer lo mismo, y dos
 * de las diferencias son grandes.
 *
 *   LAS PLANTILLAS SON DE WHATSAPP    Instagram y Messenger no tienen nada
 *                                     parecido a una plantilla aprobada por
 *                                     Meta. Fuera de la ventana no hay forma de
 *                                     escribir primero; hay que esperar.
 *
 *   TIKTOK NO SE CONECTA SOLO         Sus mensajes directos no se abren con un
 *                                     token como los de Meta: hay que ser un
 *                                     «Messaging Partner» aprobado por TikTok.
 *                                     Es un trámite con ellos, no una
 *                                     configuración. Está en la lista para que
 *                                     se vea, no para prometerlo.
 *
 * ============================================================================
 * QUÉ HAY QUE TOCAR EL DÍA QUE SE CONECTE UNO
 * ============================================================================
 *
 * 1. `disponible: true` acá, y las casillas que correspondan.
 * 2. Un módulo de envío al lado de `src/lib/whatsapp/enviar.ts`.
 * 3. Una entrada más en el webhook, que ya separa por tipo de mensaje.
 * 4. Las credenciales, en el servidor. Eso NO se toca desde acá.
 *
 * La pantalla no hay que tocarla: lee de este archivo.
 */

/** Cómo se guarda el canal en `conversaciones.canal`. */
export type ClaveCanal = "whatsapp" | "instagram" | "messenger" | "tiktok";

/**
 * Si una plataforma permite algo.
 *
 * Tres valores y no dos, porque «no lo sabemos» es un estado real y distinto
 * de «no se puede»: en varias de estas cosas la documentación de Meta no
 * alcanza y hay que probarlo con la cuenta de la escuela. Marcarlo como «sí»
 * por las dudas haría que la pantalla ofrezca un botón que falla.
 */
export type Soporte = "si" | "no" | "confirmar";

export interface Canal {
  clave: ClaveCanal;
  nombre: string;
  /** Para distinguirlo de un vistazo en la lista de hilos. */
  color: string;
  /** El símbolo que lo representa en la fila de pestañas. */
  icono: string;
  /**
   * El CRM sabe hablar con este canal.
   *
   * Distinto de tener las credenciales puestas: eso lo sabe el servidor y se
   * pasa aparte. Acá se dice si el código existe.
   */
  disponible: boolean;
  /** Qué falta para poder usarlo. Null cuando ya anda. */
  falta: string | null;
  puede: {
    reaccionar: Soporte;
    notaDeVoz: Soporte;
    archivos: Soporte;
    /** Escribir primero, fuera de la ventana, con algo aprobado. */
    plantillas: Soporte;
    /** Editar un mensaje ya enviado. Ninguna API lo permite hoy. */
    editar: Soporte;
  };
  /** Horas para contestar libremente desde el último mensaje de la persona. */
  ventanaHoras: number;
  /** Cómo se le explica esa ventana a quien atiende. */
  laVentana: string;
}

export const CANALES: readonly Canal[] = [
  {
    clave: "whatsapp",
    nombre: "WhatsApp",
    color: "#25A366",
    icono: "🟢",
    disponible: true,
    falta: null,
    puede: {
      reaccionar: "si",
      notaDeVoz: "si",
      archivos: "si",
      plantillas: "si",
      // No existe en la API. La aplicación del teléfono sí lo tiene; la API,
      // no. No es algo que falte programar.
      editar: "no",
    },
    ventanaHoras: 24,
    laVentana:
      "Se puede escribir libremente durante 24 horas desde el último mensaje de la " +
      "persona. Después, sólo con una plantilla aprobada por Meta.",
  },
  {
    clave: "instagram",
    nombre: "Instagram",
    color: "#C13584",
    icono: "📸",
    disponible: false,
    falta:
      "Falta conectar la cuenta de Instagram con la página de Facebook de la escuela " +
      "y darle permiso de mensajes a la aplicación. Es lo mismo que ya se hizo con " +
      "WhatsApp, en el mismo panel de Meta.",
    puede: {
      reaccionar: "confirmar",
      notaDeVoz: "si",
      archivos: "si",
      /*
       * No hay plantillas en Instagram.
       *
       * Es la diferencia más grande con WhatsApp y la que más cambia cómo se
       * trabaja: pasada la ventana no hay forma de escribir primero. Si el
       * cliente no contesta, hay que esperar a que escriba.
       */
      plantillas: "no",
      editar: "no",
    },
    /*
     * Siete días, no 24 horas.
     *
     * Meta abre 24 horas para respuestas automáticas, pero deja hasta siete
     * días cuando contesta una persona de verdad —lo llaman «human agent»—, y
     * en esta bandeja siempre contesta una persona. Es más margen que en
     * WhatsApp, y conviene que la pantalla lo diga: si dijera 24 horas, se
     * dejarían de contestar conversaciones que todavía se pueden contestar.
     */
    ventanaHoras: 24 * 7,
    laVentana:
      "Hay siete días para contestar desde el último mensaje de la persona, porque " +
      "contesta alguien del equipo y no un robot. Pasados, hay que esperar a que " +
      "vuelva a escribir: Instagram no tiene plantillas.",
  },
  {
    clave: "messenger",
    nombre: "Messenger",
    color: "#0084FF",
    icono: "💬",
    disponible: false,
    falta:
      "Falta darle a la aplicación permiso sobre la página de Facebook de la escuela. " +
      "Es el mismo panel de Meta donde está WhatsApp.",
    puede: {
      reaccionar: "confirmar",
      notaDeVoz: "si",
      archivos: "si",
      plantillas: "no",
      editar: "no",
    },
    ventanaHoras: 24 * 7,
    laVentana:
      "Siete días para contestar desde el último mensaje, por contestar una persona " +
      "y no un robot. Messenger tampoco tiene plantillas aprobadas.",
  },
  {
    clave: "tiktok",
    nombre: "TikTok",
    color: "#010101",
    icono: "🎵",
    disponible: false,
    /*
     * El único de los cuatro que no depende de nosotros.
     *
     * TikTok no abre sus mensajes directos con un token: hay que ser
     * «Messaging Partner» aprobado por ellos, que es una solicitud comercial
     * con revisión. Está en la lista para que se vea que se pensó, no para
     * prometer que se enciende.
     */
    falta:
      "TikTok no abre sus mensajes con un token como Meta: hay que ser «Messaging " +
      "Partner» aprobado por ellos, que es una solicitud con revisión de su parte. " +
      "Hasta que eso pase, los mensajes de TikTok se siguen contestando desde la " +
      "aplicación y lo que se hable se anota a mano en la ficha.",
    puede: {
      reaccionar: "confirmar",
      notaDeVoz: "confirmar",
      archivos: "confirmar",
      plantillas: "no",
      editar: "no",
    },
    ventanaHoras: 24 * 7,
    laVentana: "Todavía no se sabe: depende de las reglas que ponga TikTok al aprobar.",
  },
];

const POR_CLAVE = new Map(CANALES.map((c) => [c.clave, c]));

/**
 * El canal de una conversación.
 *
 * Cae en WhatsApp cuando el valor guardado no se reconoce, y no en un canal
 * «desconocido»: hasta hoy todas las conversaciones son de WhatsApp, y una
 * fila con un valor raro tiene que seguir viéndose y contestándose en vez de
 * quedar en un limbo sin botones.
 */
export const canalDe = (clave: string | null | undefined): Canal =>
  POR_CLAVE.get(String(clave ?? "").toLowerCase() as ClaveCanal) ?? CANALES[0];

/** Los que ya se pueden usar. */
export const conectados = (): Canal[] => CANALES.filter((c) => c.disponible);

/** Los que están en la lista pero todavía no se pueden usar. */
export const porConectar = (): Canal[] => CANALES.filter((c) => !c.disponible);

/**
 * Cómo se dice una capacidad en la pantalla.
 *
 * «Hay que confirmarlo» y no «tal vez»: lo primero dice que hay algo que
 * hacer y quién lo tiene que hacer; lo segundo suena a que el CRM no sabe qué
 * hace.
 */
export const COMO_SE_DICE: Record<Soporte, string> = {
  si: "sí",
  // En minúscula y con «API» en mayúscula: van pegadas al nombre de la
  // capacidad —«Editar un mensaje enviado — no lo permite la API»— así que
  // empezar con mayúscula cortaría la frase, y bajar el caso de todo dejaría
  // «api», que se lee como una palabra que no es.
  no: "no lo permite la API",
  confirmar: "hay que confirmarlo al conectar",
};

/** Las capacidades, en el orden en que se muestran. */
export const CAPACIDADES: { clave: keyof Canal["puede"]; nombre: string }[] = [
  { clave: "archivos", nombre: "Fotos y documentos" },
  { clave: "notaDeVoz", nombre: "Notas de voz" },
  { clave: "reaccionar", nombre: "Reacciones a los mensajes" },
  { clave: "plantillas", nombre: "Escribir primero, fuera de la ventana" },
  { clave: "editar", nombre: "Editar un mensaje enviado" },
];
