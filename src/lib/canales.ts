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
/**
 * Qué tanto se puede hacer algo en un canal.
 *
 * `pendiente` es distinto de `no`, y la diferencia importa: `no` quiere decir
 * que la API no lo ofrece y no hay nada que esperar; `pendiente` quiere decir
 * que la API SÍ lo ofrece y lo que falta es un permiso que Meta tiene que dar.
 * Decir «no» en los dos casos haría que nadie pida lo que ya se puede pedir.
 */
export type Soporte = "si" | "no" | "confirmar" | "pendiente";

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
    /**
     * Dar formato al texto: negrita, cursiva, tachado, monoespaciado.
     *
     * --------------------------------------------------------------------
     * NO ES TEXTO CON FORMATO, SON MARCAS
     * --------------------------------------------------------------------
     *
     * Ninguna de estas APIs manda texto enriquecido. WhatsApp manda texto
     * pelado con unas marcas —`*negrita*`, `_cursiva_`, `~tachado~` y
     * ```monoespaciado```— y es la aplicación de la persona la que las
     * dibuja. Son cuatro: NO HAY SUBRAYADO, no existe la marca.
     *
     * Instagram y Messenger no dibujan ninguna: los asteriscos le llegan al
     * cliente como asteriscos. Por eso va `no` y no `confirmar`; ofrecer la
     * barra ahí sería ofrecer un botón que ensucia el mensaje.
     */
    formato: Soporte;
    /**
     * Llamar y atender llamadas desde el CRM.
     *
     * ------------------------------------------------------------------------
     * LO QUE SE MIDIÓ, CANAL POR CANAL
     * ------------------------------------------------------------------------
     *
     * WhatsApp anda y está en producción. Messenger es el caso interesante: la
     * API existe —`POST /{page-id}/calls` acepta ACCEPT, CONNECT, MEDIA_UPDATE,
     * REJECT y TERMINATE— pero contra la página de la escuela las CINCO
     * acciones devuelven lo mismo:
     *
     *     (#-1, subcódigo 2018389) Page is not allowlisted to access this feature
     *
     * O sea que no es sólo el botón de llamar: tampoco se pueden ATENDER las
     * entrantes. Por eso `pendiente` y no `si`.
     *
     * ------------------------------------------------------------------------
     * LO QUE SÍ SE PUEDE HOY, Y ES LA MITAD DEL CAMINO
     * ------------------------------------------------------------------------
     *
     * El permiso del cliente NO está bloqueado por la lista blanca. Consultado
     * el mismo día contra dos personas reales de la página:
     *
     *     GET /{page-id}/messenger_call_permissions?psid={psid}
     *     → {"permission":{"status":"NO_PERMISSION"},
     *        "actions":[
     *          {"action_name":"send_call_permission_request","can_perform":true,
     *           "limits":[{"time_period":"PT24H","max_allowed":2,"current_usage":0}]},
     *          {"action_name":"start_call","can_perform":false}]}
     *
     * Es el mismo modelo que WhatsApp —la persona tiene que aceptar antes— con
     * un límite propio: DOS solicitudes por persona cada 24 horas. El CRM ya
     * tiene toda esa lógica escrita en `lib/permisoDeLlamada.ts`.
     *
     * ------------------------------------------------------------------------
     * QUÉ HAY QUE TOCAR EL DÍA QUE META HABILITE LA PÁGINA
     * ------------------------------------------------------------------------
     *
     * 1. Comprobar que se levantó, sin escribir código:
     *
     *      POST /{page-id}/calls  action=CONNECT  to={psid inventado}
     *
     *    Mientras devuelva 2018389 sigue bloqueado. Cuando devuelva un error de
     *    DESTINATARIO —como el #100 de Instagram— está habilitada.
     *
     * 2. Suscribir el campo de llamadas en el webhook de la página. Hoy están
     *    `messages`, `message_echoes`, `message_reads` y compañía, y ninguno de
     *    llamadas: sin eso, una entrante no llega al CRM aunque todo lo demás
     *    funcione.
     *
     * 3. Cambiar esta palabra a `"si"`. La pantalla entera lee de acá —el panel
     *    del canal, la bandeja, el cartel de la lista blanca— así que con eso
     *    deja de decir que falta.
     *
     * 4. Escribir `lib/messenger/llamadas.ts` al lado de `lib/whatsapp/llamadas.ts`.
     *    La forma es la misma: las cinco acciones y SDP por WebRTC. La interfaz
     *    —el pop-up, la tarjeta de la esquina, el micrófono— no hay que
     *    tocarla: ya está en `components/Llamada.tsx` y no sabe de qué canal
     *    viene la llamada.
     */
    llamadas: Soporte;
  };
  /** Horas para contestar libremente desde el último mensaje de la persona. */
  ventanaHoras: number;
  /** Cómo se le explica esa ventana a quien atiende. */
  laVentana: string;
  /**
   * Por dónde entra un mensaje de este canal, dicho como se le habla a alguien.
   *
   * Se completa una frase del estilo «cuando llegue el primer mensaje ___».
   * Vive acá y no escrito en la pantalla porque la bandeja se filtra por canal:
   * con el filtro en Instagram, un aviso que diga «al número de WhatsApp» manda
   * a revisar la integración equivocada, que es justo lo que pasó.
   */
  porDondeLlega: string;
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
      formato: "si",
      // Anda y está en producción: es el único de los cuatro.
      llamadas: "si",
    },
    ventanaHoras: 24,
    laVentana:
      "Se puede escribir libremente durante 24 horas desde el último mensaje de la " +
      "persona. Después, sólo con una plantilla aprobada por Meta.",
    porDondeLlega: "al número de WhatsApp de la escuela",
  },
  {
    clave: "instagram",
    nombre: "Instagram",
    color: "#C13584",
    icono: "📸",
    /*
     * El CRM ya sabe hablar Instagram.
     *
     * Están el webhook —`api/instagram/webhook`—, el envío
     * —`lib/instagram/enviar.ts`— y la identidad del hilo en la base. Que
     * además esté ENCENDIDO depende de que las credenciales estén puestas en el
     * servidor, y eso no se sabe desde acá: lo dice `hayInstagram()`, que corre
     * donde viven los tokens. Son dos cosas distintas a propósito —ver el
     * comentario de `disponible`— y la bandeja mira las dos.
     */
    disponible: true,
    falta: null,
    puede: {
      /*
       * Se ven, no se ponen.
       *
       * Meta AVISA por el webhook cuando alguien reacciona a un mensaje nuestro
       * —y esas reacciones aparecen en el hilo— pero la API no deja mandar una
       * desde afuera de la aplicación. No es algo que falte programar, así que
       * el botón no se ofrece en vez de ofrecerlo y fallar.
       */
      reaccionar: "no",
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
      formato: "no",
      // La API de mensajería de Instagram no ofrece llamadas.
      llamadas: "no",
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
    porDondeLlega: "a la cuenta de Instagram de la escuela",
  },
  {
    clave: "messenger",
    nombre: "Messenger",
    color: "#0084FF",
    icono: "💬",
    /*
     * El CRM ya sabe hablar Messenger.
     *
     * Están el webhook —`api/messenger/webhook`—, el envío
     * —`lib/messenger/enviar.ts`— y la identidad del hilo en la base. Que además
     * esté ENCHUFADO depende de que el token esté puesto en el servidor, y eso
     * no se sabe desde acá: lo dice `hayMessenger()`. Son dos cosas distintas a
     * propósito, y la bandeja mira las dos.
     */
    disponible: true,
    falta: null,
    puede: {
      /*
       * Se ven, no se ponen.
       *
       * Meta AVISA por el webhook cuando alguien reacciona a un mensaje nuestro
       * —y esas reacciones aparecen en el hilo— pero su API no deja mandar una
       * desde afuera de la aplicación. Igual que Instagram. Antes acá decía
       * «confirmar» porque no se había probado; ya se probó.
       */
      reaccionar: "no",
      notaDeVoz: "si",
      archivos: "si",
      /*
       * No hay plantillas en Messenger.
       *
       * Existen las «etiquetas» —`HUMAN_AGENT` es la que usa el CRM— pero no
       * sirven para escribir primero: abren la ventana a siete días para
       * CONTESTAR. A quien nunca escribió no se le puede escribir.
       */
      plantillas: "no",
      editar: "no",
      formato: "no",
      /*
       * La API existe; la página no está habilitada. Medido el 23 de
       * septiembre de 2026: las cinco acciones de `POST /{page}/calls`
       * devuelven «(#-1) Page is not allowlisted to access this feature».
       * Ver el comentario del tipo `Canal["puede"]["llamadas"]`.
       */
      llamadas: "pendiente",
    },
    ventanaHoras: 24 * 7,
    laVentana:
      "Siete días para contestar desde el último mensaje, por contestar una persona " +
      "y no un robot. Messenger tampoco tiene plantillas aprobadas.",
    porDondeLlega: "a la página de Facebook de la escuela",
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
      formato: "no",
      // TikTok no ofrece llamadas por API.
      llamadas: "no",
    },
    ventanaHoras: 24 * 7,
    laVentana: "Todavía no se sabe: depende de las reglas que ponga TikTok al aprobar.",
    porDondeLlega: "a la cuenta de TikTok de la escuela",
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

/**
 * Cómo se titula un hilo en la bandeja.
 *
 * ============================================================================
 * EL ORDEN, Y POR QUÉ EL ÚLTIMO ESCALÓN NO ES EL IDENTIFICADOR PELADO
 * ============================================================================
 *
 * Primero el nombre, después el @usuario. Hasta ahí no hay discusión.
 *
 * Lo que sí hubo que pensar es el tercer escalón, para Instagram y Messenger
 * cuando Meta todavía no deja leer el perfil. Antes se mostraba el identificador
 * crudo, y una bandeja con dieciocho hilos titulados «29566976779558028» no se
 * lee: son todos parecidos, empiezan igual y no se distinguen de un vistazo.
 *
 * Pero reemplazarlo por «Contacto de Instagram» a secas es peor todavía: los
 * dieciocho quedarían IDÉNTICOS, y con eso no se puede ni pedirle a una
 * compañera que abra uno en particular.
 *
 * Así que van las dos cosas: el canal, que es lo que ubica, y los últimos cuatro
 * dígitos, que es lo que distingue. «Contacto de Instagram · 8028» se dice en
 * voz alta, se busca con los ojos y no miente sobre lo que se sabe de esa
 * persona, que es nada todavía.
 *
 * WhatsApp no pasa por acá con este problema: su identificador ES el teléfono,
 * y un teléfono sí es un dato que sirve, así que se muestra entero.
 */
export function tituloDeHilo(hilo: {
  nombrePerfil?: string | null;
  usuario?: string | null;
  identificador?: string | null;
  canal?: string | null;
}): string {
  const nombre = (hilo.nombrePerfil ?? "").trim();
  if (nombre) return nombre;

  const usuario = (hilo.usuario ?? "").trim();
  if (usuario) return usuario.startsWith("@") ? usuario : `@${usuario}`;

  const id = (hilo.identificador ?? "").trim();
  const canal = canalDe(hilo.canal);

  // Sin identificador no hay nada que decir salvo por dónde entró.
  if (!id) return `Contacto de ${canal.nombre}`;

  // El de WhatsApp es un teléfono: se muestra tal cual, que es como lo buscan.
  if (canal.clave === "whatsapp") return id;

  return `Contacto de ${canal.nombre} · ${id.slice(-4)}`;
}

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
  pendiente: "la API lo permite, falta que Meta habilite la cuenta",
};

/** Las capacidades, en el orden en que se muestran. */
export const CAPACIDADES: { clave: keyof Canal["puede"]; nombre: string }[] = [
  { clave: "archivos", nombre: "Fotos y documentos" },
  { clave: "notaDeVoz", nombre: "Notas de voz" },
  { clave: "reaccionar", nombre: "Reacciones a los mensajes" },
  { clave: "plantillas", nombre: "Escribir primero, fuera de la ventana" },
  { clave: "editar", nombre: "Editar un mensaje enviado" },
  { clave: "llamadas", nombre: "Llamadas desde el CRM" },
];
