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

const servidor = http.createServer((req, res) => {
  // Un GET a `/__recibidos` devuelve lo que llegó hasta ahora. No es parte de
  // la API de Meta: es la ventana que la prueba usa para mirar adentro.
  if (req.method === "GET" && req.url.startsWith("/__recibidos")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recibidos));
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/__perfiles-pedidos")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(perfilesPedidos));
    return;
  }

  // El interruptor. Tampoco es parte de la API de Meta.
  if (req.method === "POST" && req.url.startsWith("/__perfiles")) {
    let crudo = "";
    req.on("data", (t) => (crudo += t));
    req.on("end", () => {
      try {
        const pedido = JSON.parse(crudo || "{}");
        permitePerfiles = Boolean(pedido.permite);
        // Sin `hilos`, la otra puerta sigue a ésta. Ver arriba.
        permiteHilos = pedido.hilos === undefined ? permitePerfiles : Boolean(pedido.hilos);
      } catch {
        permitePerfiles = false;
        permiteHilos = false;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ permite: permitePerfiles, hilos: permiteHilos }));
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
            message: "(#10) Application does not have permission for this action",
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
        : { id: quien, username: datos.username, ...(datos.name ? { name: datos.name } : {}) };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: [
          {
            id: `t_${quien}`,
            participants: { data: [suyo, { id: porHilo[1], name: "Les Arts Culinaires" }] },
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
  const perfil = req.method === "GET" && /^\/v[\d.]+\/(\d+)\?fields=/.exec(req.url);
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
            message: "(#10) Application does not have permission for this action",
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
          error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 },
        }),
      );
      return;
    }

    // Se devuelve sólo lo pedido, como Meta: Messenger no trae `username` y el
    // CRM tiene que arreglárselas con el nombre solo.
    const pedidos = new URL(req.url, "http://x").searchParams.get("fields") ?? "";
    const salida = {};
    for (const campo of pedidos.split(",")) {
      if (datos[campo.trim()] != null) salida[campo.trim()] = datos[campo.trim()];
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(salida));
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
    recibidos.push({ url: req.url, cuerpo: leido ?? cuerpo });

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

servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`Meta de mentira escuchando en http://127.0.0.1:${puerto}`);
});
