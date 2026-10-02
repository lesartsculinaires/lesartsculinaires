/**
 * Un Meta de mentira, para poder probar el envío que SALE BIEN.
 *
 *     node supabase/pruebas/banco/meta-de-mentira.mjs [puerto]
 *
 * ============================================================================
 * PARA QUÉ
 * ============================================================================
 *
 * En el banco no hay WhatsApp, así que hasta ahora del envío masivo sólo se
 * podía probar el camino del error: token de mentira, Meta rechaza, y ahí
 * termina. Todo lo que pasa DESPUÉS de un envío exitoso —que el mensaje quede
 * en el hilo del cliente, con su asesora, para poder darle seguimiento cuando
 * conteste— no se ejercía nunca. Y es justo lo que la escuela pidió.
 *
 * Esto contesta como contesta Meta y nada más. El CRM le habla porque
 * `WHATSAPP_GRAPH_URL` apunta acá, y esa variable sólo acepta direcciones de
 * esta misma máquina —ver `lib/whatsapp/enviar.ts`—, así que no hay forma de
 * que en producción mande el token a ningún lado.
 *
 * ============================================================================
 * QUÉ CONTESTA
 * ============================================================================
 *
 * Un `wamid` distinto por mensaje, como Meta. Que sean distintos importa: el
 * CRM guarda ese id con una restricción de unicidad, así que si devolviera
 * siempre el mismo, el segundo mensaje de la tanda parecería un reintento y no
 * se guardaría.
 *
 * Con `?fallar=131042` en la URL contesta el error de «falta forma de pago»,
 * que es el que tumba una campaña entera. Sirve para probar ese camino sin
 * esperar a que pase de verdad.
 */
import http from "node:http";

const puerto = Number(process.argv[2] ?? 3144);
let n = 0;

/** Lo que se le mandó, para poder revisarlo desde la prueba. */
const recibidos = [];

/**
 * Si Meta deja leer el perfil de quien escribe.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ ARRANCA EN «NO»
 * ----------------------------------------------------------------------------
 *
 * Porque es lo que hace Meta mientras la aplicación está en modo desarrollo, y
 * es el estado en el que la escuela está hoy: los mensajes entran y los nombres
 * no. Que el banco arranque igual que la realidad es lo que hace que una prueba
 * que pasa acá signifique algo.
 *
 * `POST /__perfiles {"permite":true}` lo da vuelta. Eso es exactamente lo que
 * pasa el día que Meta aprueba la revisión, y es el momento que hay que poder
 * probar: que los hilos que ya habían entrado sin nombre se arreglen, en vez de
 * quedarse con el número para siempre.
 */
let permitePerfiles = false;

/**
 * Si Meta acepta la etiqueta `HUMAN_AGENT`, que estira la ventana a 7 días.
 *
 * Arranca en `false` porque es el estado real de la escuela: el permiso se
 * pide por App Review y no está aprobado. Se prende con
 * `POST /__humanagent {"permite": true}` para probar el día que lo aprueben.
 */
let permiteHumanAgent = false;

/**
 * Y si deja leerlos por la CONVERSACIÓN, que es la otra puerta.
 *
 * Son dos interruptores porque en la realidad son dos puertas distintas y no se
 * abren juntas: hoy, contra la Página de la escuela, la consulta por persona
 * está cerrada para Messenger y la de la conversación está abierta. Con un solo
 * interruptor no se podría imitar eso, que es justo el caso que hay que probar.
 *
 * `POST /__perfiles {"permite":false,"hilos":true}` arma esa asimetría. Cuando
 * no se manda `hilos`, sigue a `permite`: las pruebas que sólo quieren decir
 * «Meta no da nada» no tienen que enterarse de que hay dos puertas.
 */
let permiteHilos = false;

/** Cada consulta de perfil que llegó. Ver más abajo por qué no va en `recibidos`. */
const perfilesPedidos = [];

/**
 * Los nombres inventados, POR LOS ÚLTIMOS CUATRO DÍGITOS del identificador.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ NO POR EL IDENTIFICADOR ENTERO
 * ----------------------------------------------------------------------------
 *
 * Para que las pruebas puedan usar un identificador distinto en cada corrida y
 * aun así saber qué nombre esperar.
 *
 * Hace falta porque el CRM se acuerda, dentro de la misma instancia, de a quién
 * ya le preguntó el perfil —así no le pregunta a Meta una vez por mensaje—. Con
 * identificadores fijos, la segunda corrida seguida de una prueba chocaba con
 * ese recuerdo y fallaba por algo que en realidad estaba bien.
 *
 * Con el sufijo, cada corrida estrena gente y la anterior no la estorba.
 */
const PERFILES = {
  "0001": { name: "Ana Beltrán", username: "anabeltran" },
  "0002": { name: "Rosa Mejía", username: "rosamejia" },
  "0003": { name: "Carlos Núñez" },
  "0004": { name: "Lucía Paz", username: "luciapaz" },
};

/** La Página y la cuenta de Instagram que devuelve el diálogo de conexión. */
const PAGINA_FALSA = "900000000000001";
const IG_FALSO = "17841400000000999";
const TOKEN_DE_PAGINA_FALSO = "TOKEN-DE-PAGINA-FALSO";

/** Cada paso del camino de conexión que llegó, para poder mirarlo. */
const conexiones = [];

/** Cuántas imágenes se subieron, para darle a cada una un id distinto. */
let subidas = 0;

/**
 * Cuánto tarda Meta en contestar, a propósito.
 *
 * ============================================================================
 * PARA QUÉ QUERRÍA NADIE UN META LENTO
 * ============================================================================
 *
 * Porque el banco es demasiado bueno. Acá Meta contesta en un milisegundo y la
 * base está en la misma máquina, así que una tanda de veinte tarda nada y TODO
 * pasa. En producción cada destinatario es una llamada a Meta por internet más
 * ocho idas y vueltas a Supabase: medio segundo largo cada uno.
 *
 * Esa diferencia escondió un problema real durante meses. `POR_TANDA = 20`
 * contaba destinatarios, la función de Netlify tiene DIEZ SEGUNDOS, y veinte
 * destinatarios reales no entran: la campaña de 168 de la escuela se murió a
 * los trece y la barra quedó girando para siempre. En el banco no se veía.
 *
 * Con esto una prueba puede ponerle a Meta la lentitud de la vida real y
 * comprobar que la tanda se corta por tiempo antes de llegar al tope de la
 * función, en vez de enterarse en producción.
 *
 *     POST /__lento {"mensaje": 500, "media": 1500}
 *     POST /__lento {}                                 ← vuelve a ser instantáneo
 */
let demoraMensaje = 0;
let demoraMedia = 0;

/** Contesta dentro de un rato, o ya mismo si no hay demora puesta. */
const enUnRato = (ms, hacer) => (ms > 0 ? setTimeout(hacer, ms) : hacer());

const servidor = http.createServer((req, res) => {
  // Un GET a `/__recibidos` devuelve lo que llegó hasta ahora. No es parte de
  // la API de Meta: es la ventana que la prueba usa para mirar adentro.
  if (req.method === "GET" && req.url.startsWith("/__recibidos")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recibidos));
    return;
  }

  // El otro interruptor: cuánto tarda en contestar. Ver `demoraMensaje`.
  if (req.method === "POST" && req.url.startsWith("/__lento")) {
    let crudo = "";
    req.on("data", (t) => (crudo += t));
    req.on("end", () => {
      try {
        const pedido = JSON.parse(crudo || "{}");
        demoraMensaje = Number(pedido.mensaje ?? 0) || 0;
        demoraMedia = Number(pedido.media ?? 0) || 0;
      } catch {
        demoraMensaje = 0;
        demoraMedia = 0;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ mensaje: demoraMensaje, media: demoraMedia }));
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/__perfiles-pedidos")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(perfilesPedidos));
    return;
  }

  // El interruptor. Tampoco es parte de la API de Meta.
  // El interruptor de la etiqueta de siete días.
  if (req.method === "POST" && req.url.startsWith("/__humanagent")) {
    let crudo = "";
    req.on("data", (t) => (crudo += t));
    req.on("end", () => {
      try {
        permiteHumanAgent = Boolean(JSON.parse(crudo || "{}").permite);
      } catch {
        permiteHumanAgent = false;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ permite: permiteHumanAgent }));
    });
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/__perfiles")) {
    let crudo = "";
    req.on("data", (t) => (crudo += t));
    req.on("end", () => {
      try {
        const pedido = JSON.parse(crudo || "{}");
        permitePerfiles = Boolean(pedido.permite);
        // Sin `hilos`, la otra puerta sigue a ésta. Ver arriba.
        permiteHilos =
          pedido.hilos === undefined ? permitePerfiles : Boolean(pedido.hilos);
      } catch {
        permitePerfiles = false;
        permiteHilos = false;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ permite: permitePerfiles, hilos: permiteHilos }),
      );
    });
    return;
  }

  /*
   * El OTRO camino para el nombre: por la conversación.
   *
   *     GET /v21.0/{pagina}/conversations?platform=…&user_id=…&fields=participants
   *
   * Existe porque en Messenger el camino normal —`GET /{psid}?fields=name`— NO
   * funciona: Meta contesta «#100 subcódigo 33, does not exist» para un PSID que
   * está escribiendo en ese mismo momento. Medido contra la Página de la escuela
   * el 22 de septiembre de 2026.
   *
   * Acá se imita esa asimetría a propósito: esta puerta tiene su propio
   * interruptor —`permiteHilos`— y una prueba puede dejarla abierta con la otra
   * cerrada, que es justo el caso real. Si las dos fueran siempre juntas, la
   * prueba del nombre dejaría de probar nada.
   */
  const porHilo =
    req.method === "GET" && /^\/v[\d.]+\/(\d+)\/conversations\?/.exec(req.url);
  if (porHilo) {
    const q = new URL(req.url, "http://x").searchParams;
    const quien = q.get("user_id") ?? "";
    const datos = PERFILES[quien.slice(-4)];

    perfilesPedidos.push(req.url);

    if (!permiteHilos) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message:
              "(#10) Application does not have permission for this action",
            type: "OAuthException",
            code: 10,
          },
        }),
      );
      return;
    }

    // Sin conversación, Meta devuelve la lista vacía y no un error.
    if (!datos) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
      return;
    }

    /*
     * Messenger no entrega `username` por ninguna puerta, ni por ésta.
     *
     * Se recorta acá y no en el CRM para que la prueba falle si algún día el
     * código empieza a inventar una arroba de Facebook, que no existe.
     */
    const suyo =
      q.get("platform") === "messenger"
        ? { id: quien, name: datos.name }
        : {
            id: quien,
            username: datos.username,
            ...(datos.name ? { name: datos.name } : {}),
          };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: [
          {
            id: `t_${quien}`,
            participants: {
              data: [suyo, { id: porHilo[1], name: "Les Arts Culinaires" }],
            },
          },
        ],
      }),
    );
    return;
  }

  /*
   * La consulta de perfil: `GET /v21.0/{id}?fields=name,username`.
   *
   * Se distingue del envío porque el envío es POST y termina en `/messages`.
   * Acá sólo llegan los GET a un identificador pelado con `fields`.
   */
  const perfil =
    req.method === "GET" && /^\/v[\d.]+\/(\d+)\?fields=/.exec(req.url);
  if (perfil) {
    const quien = perfil[1];

    /*
     * Las consultas de perfil se anotan APARTE de `recibidos`.
     *
     * Si fueran a la misma lista, las pruebas que cuentan cuántos mensajes se
     * mandaron —«antes» y «después» de apretar Enviar— contarían de más en
     * cuanto el CRM preguntara un nombre en el medio, y se pondrían rojas por
     * algo que no tiene nada que ver con lo que miden.
     */
    perfilesPedidos.push(req.url);

    if (!permitePerfiles) {
      // La forma exacta del error que devuelve Meta cuando a la aplicación le
      // falta el permiso. El CRM lo traduce por el código, así que tiene que
      // venir con código.
      res.writeHead(403, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message:
              "(#10) Application does not have permission for this action",
            type: "OAuthException",
            code: 10,
          },
        }),
      );
      return;
    }

    const datos = PERFILES[quien.slice(-4)];
    if (!datos) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Unsupported get request.",
            type: "GraphMethodException",
            code: 100,
          },
        }),
      );
      return;
    }

    // Se devuelve sólo lo pedido, como Meta: Messenger no trae `username` y el
    // CRM tiene que arreglárselas con el nombre solo.
    const pedidos =
      new URL(req.url, "http://x").searchParams.get("fields") ?? "";
    const salida = {};
    for (const campo of pedidos.split(",")) {
      if (datos[campo.trim()] != null)
        salida[campo.trim()] = datos[campo.trim()];
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(salida));
    return;
  }

  /*
   * EL CDN DE META: la imagen de muestra que quedó al aprobar una plantilla.
   *
   * Meta la devuelve en `example.header_handle` y el CRM la baja desde el
   * servidor para subírsela de vuelta. Suena redondo y no lo es: en producción
   * Meta acepta el mensaje con esa misma dirección y después NO la vuelve a
   * bajar —«Media upload error»—, que es por lo que ahora se sube.
   *
   * Acá se sirve para poder probar el camino entero. Que el banco la sirva no
   * dice nada sobre si el CDN de verdad la sirve: lo que se está probando es
   * que, cuando se puede bajar, termine subida y no mandada como dirección.
   */
  /*
   * CONECTAR UNA CUENTA: las tres puertas del diálogo de Facebook.
   *
   * ==========================================================================
   * PARA QUÉ
   * ==========================================================================
   *
   * Para aprobar los mensajes de Instagram, Meta manda a una persona a probar
   * el producto, y esa persona conecta SU PROPIA cuenta desde el CRM. Ese
   * camino —canjear el código, pedir las Páginas, suscribirlas al webhook— es
   * el que decide si la revisión se aprueba, y sin esto era imposible de probar
   * sin una cuenta real de Facebook.
   *
   * Las tres contestan lo mismo que Meta, con la forma que el CRM lee.
   */
  if (req.method === "GET" && /^\/v[\d.]+\/oauth\/access_token/.test(req.url)) {
    conexiones.push({ paso: "canje", url: req.url });
    const q = new URL(req.url, "http://x").searchParams;
    // Sin secreto no hay canje, igual que en Meta. Es lo que hace que la prueba
    // del secreto faltante signifique algo.
    if (!q.get("client_secret")) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Missing client_secret", code: 1 } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ access_token: "TOKEN-DE-USUARIO-FALSO", token_type: "bearer" }));
    return;
  }

  if (req.method === "GET" && /^\/v[\d.]+\/me\/accounts/.test(req.url)) {
    conexiones.push({ paso: "paginas", url: req.url });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: [
          {
            id: PAGINA_FALSA,
            name: "Página del Revisor",
            // El token DE LA PÁGINA, que es el que el CRM tiene que guardar.
            // Distinto del de usuario a propósito: si el CRM guardara el
            // equivocado, la prueba lo ve.
            access_token: TOKEN_DE_PAGINA_FALSO,
            instagram_business_account: { id: IG_FALSO, username: "cuenta_del_revisor" },
          },
        ],
      }),
    );
    return;
  }

  if (req.method === "POST" && /^\/v[\d.]+\/\d+\/subscribed_apps/.test(req.url)) {
    let crudo = "";
    req.on("data", (t) => (crudo += t));
    req.on("end", () => {
      let leido = null;
      try {
        leido = JSON.parse(crudo || "{}");
      } catch {
        leido = { crudo };
      }
      conexiones.push({ paso: "suscribir", url: req.url, cuerpo: leido });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  // Lo que pasó al conectar, para que una prueba pueda mirarlo.
  if (req.method === "GET" && req.url.startsWith("/__conexiones")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(conexiones));
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/cdn/")) {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": png.length,
    });
    res.end(png);
    return;
  }

  /*
   * SUBIR UNA IMAGEN: `POST /{numero}/media`.
   *
   * Es el camino nuevo y el que arregló el «Media upload error». En vez de
   * darle a Meta una dirección para que la baje —que falla tarde, con el
   * mensaje ya mandado— el CRM le sube la imagen antes y manda el
   * identificador que Meta devuelve acá.
   *
   * El cuerpo es multipart, así que no se intenta leerlo como JSON: alcanza
   * con anotar que llegó y con cuántos bytes, que es lo que una prueba querría
   * mirar. Los bytes se tiran.
   */
  if (req.method === "POST" && /^\/v[\d.]+\/\d+\/media/.test(req.url)) {
    let bytes = 0;
    req.on("data", (t) => (bytes += t.length));
    req.on("end", () => {
      subidas += 1;
      recibidos.push({ url: req.url, subida: { bytes } });
      enUnRato(demoraMedia, () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: `media.FALSO.${subidas}` }));
      });
    });
    return;
  }

  let cuerpo = "";
  req.on("data", (t) => (cuerpo += t));
  req.on("end", () => {
    let leido = null;
    try {
      leido = JSON.parse(cuerpo);
    } catch {
      // Da igual: se guarda el crudo.
    }
    /*
     * Se anota también CON QUÉ TOKEN vino.
     *
     * Hasta ahora sólo se guardaba la dirección y el cuerpo, y con eso no se
     * puede ver lo que importa cuando hay más de una cuenta conectada: si la
     * respuesta a un hilo salió con el token de esa cuenta o con el de otra.
     * Desde afuera las dos peticiones se ven idénticas.
     */
    recibidos.push({
      url: req.url,
      cuerpo: leido ?? cuerpo,
      autorizacion: req.headers.authorization ?? null,
    });

    /*
     * LA ETIQUETA `HUMAN_AGENT`, RECHAZADA COMO LA RECHAZA META.
     *
     * Es un permiso que se pide por App Review y la aplicación de la escuela
     * no lo tiene. Con esto puesto, el banco reproduce el error que dejó a la
     * escuela sin poder contestar por Messenger:
     *
     *     (#100) No se puede agregar la etiqueta "HUMAN_AGENT" a los mensajes
     *     sin aprobación previa.
     *
     * Un Meta de mentira que aceptara cualquier etiqueta no habría encontrado
     * nunca ese fallo —de hecho no lo encontró: el CRM la mandaba siempre y
     * todas las pruebas pasaban en verde—.
     *
     * `permiteHumanAgent` deja simular la otra mitad: el día que Meta apruebe
     * el permiso, la etiqueta pasa a funcionar y los siete días son reales.
     */
    if (leido?.tag === "HUMAN_AGENT" && !permiteHumanAgent) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message:
              'Cannot add "HUMAN_AGENT" tag to messages without prior approval',
            type: "OAuthException",
            code: 100,
          },
        }),
      );
      return;
    }

    /*
     * El 131008, como lo devuelve Meta cuando falta una pieza.
     *
     * Se decide por el NOMBRE de la plantilla y no por un parámetro en la URL:
     * `WHATSAPP_GRAPH_URL` sólo acepta la dirección pelada de esta máquina —sin
     * ruta ni parámetros—, que es justo lo que impide que esa variable mande el
     * token a ningún lado. Así que la seña viaja donde sí se puede.
     *
     * Una plantilla llamada `..._con_header` exige el componente `header`, que
     * es exactamente lo que le pasó a la escuela. Un Meta de mentira que
     * aceptara todo no habría encontrado nunca ese fallo.
     */
    /*
     * UNA IMAGEN MANDADA POR DIRECCIÓN: «Media upload error».
     *
     * ------------------------------------------------------------------------
     * ESTO ES LO QUE PASÓ EN PRODUCCIÓN, PUESTO ACÁ PARA QUE NO VUELVA
     * ------------------------------------------------------------------------
     *
     * Meta acepta las dos formas —`image: { link }` e `image: { id }`— pero no
     * fallan igual. Con `link`, Meta ACEPTA el mensaje y después va a bajar la
     * imagen; si no puede, el mensaje ya salió y en el hilo queda «No se pudo
     * entregar · Media upload error». A la escuela le pasó con dos mensajes, y
     * también con la dirección de la imagen que Meta tenía aprobada de esa
     * misma plantilla: su propio CDN no la vuelve a servir.
     *
     * El banco no puede reproducir un fallo de entrega posterior, así que lo
     * adelanta al envío: rechaza el `link` con el mismo texto. Es más estricto
     * que Meta a propósito. Si alguien vuelve a mandar la imagen por dirección,
     * esto se pone en rojo acá en vez de descubrirse en el hilo de un cliente.
     */
    for (const parte of leido?.template?.components ?? []) {
      for (const par of parte?.parameters ?? []) {
        const archivo = par?.image ?? par?.video ?? par?.document;
        if (archivo && archivo.link && !archivo.id) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: {
                message: "Media upload error",
                code: 131053,
                type: "OAuthException",
              },
            }),
          );
          return;
        }
      }
    }

    if (/_con_header/.test(leido?.template?.name ?? "")) {
      const partes = (leido?.template?.components ?? []).map((c) => c?.type);
      if (!partes.includes("header")) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "(#131008) Required parameter is missing",
              code: 131008,
              type: "OAuthException",
            },
          }),
        );
        return;
      }
    }

    // Igual que arriba: la seña va en el nombre de la plantilla.
    if (/_sin_pago/.test(leido?.template?.name ?? "")) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Business eligibility payment issue",
            code: 131042,
            type: "OAuthException",
          },
        }),
      );
      return;
    }

    n += 1;
    enUnRato(demoraMensaje, () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: "x", wa_id: "x" }],
          // Distinto cada vez: ver el encabezado.
          messages: [{ id: `wamid.FALSO${Date.now()}.${n}` }],
          /*
           * Y la forma que usa Instagram para lo mismo.
           *
           * Instagram no contesta `messages[]` sino `message_id` pelado, así que
           * sin esta clave una respuesta de Instagram se daba por buena pero se
           * guardaba sin identificador, y después no había con qué seguirle el
           * estado. Va agregada y no en lugar de la otra: las pruebas de WhatsApp
           * leen `messages[0].id` y tienen que seguir leyéndolo igual.
           */
          recipient_id: "IGSID_FALSO",
          message_id: `mid.FALSO${Date.now()}.${n}`,
        }),
      );
    });
  });
});

servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`Meta de mentira escuchando en http://127.0.0.1:${puerto}`);
});
