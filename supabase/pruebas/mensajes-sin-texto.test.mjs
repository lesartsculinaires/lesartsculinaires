/**
 * Los mensajes que no traen texto: ¿dicen qué son, o dicen «Mensaje»?
 *
 *     npx esbuild src/lib/whatsapp/mensajes.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/mensajes.mjs
 *     node supabase/pruebas/mensajes-sin-texto.test.mjs /tmp/mensajes.mjs
 *
 * ============================================================================
 * QUÉ REPORTÓ LA ESCUELA
 * ============================================================================
 *
 * «Podrías visualizar este tipo de mensajes en el inbox de WhatsApp; ese
 *  mensaje ha sido mandado de TikTok […] ya hay varios mensajes de otros
 *  clientes que tampoco se visualizan.»
 *
 * En la captura: una burbuja que dice «Mensaje» y la hora. Nada más.
 *
 * ============================================================================
 * POR QUÉ PASABA
 * ============================================================================
 *
 * `leerTexto` sabía leer seis tipos —texto, botón, interactivo, foto, video y
 * documento— y todo lo demás caía en `default: null`. Sin texto y sin archivo,
 * la pantalla mostraba la palabra «Mensaje».
 *
 * WhatsApp manda bastante más que esos seis. El caso de la escuela es
 * `request_welcome`: lo manda cuando alguien ABRE el chat desde un anuncio o un
 * enlace —de TikTok, de Facebook, de donde sea— y todavía no escribió nada. No
 * trae texto porque no hay texto; el hecho es que abrió la conversación, y para
 * ventas es justo el momento de contestar primero.
 *
 * Junto al mensaje viene un bloque `referral` que dice de qué anuncio salió.
 * Eso no sólo arregla la burbuja: dice qué campaña trajo a esa persona.
 *
 * ============================================================================
 * LO QUE NO ERA
 * ============================================================================
 *
 * No era un permiso de Meta. El mensaje LLEGÓ —está guardado, con su hora, y
 * la burbuja se dibuja— así que el webhook está bien suscrito. Lo que faltaba
 * era del lado del CRM.
 *
 * Y no se perdió nada: el JSON entero se guarda en `mensajes.payload` desde el
 * primer día, que es lo que permite recuperar los que ya entraron.
 */
const { leerWebhook, resumen } = await import(process.argv[2] ?? "/tmp/mensajes.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** El envoltorio de Meta, para no repetirlo en cada caso. */
const carga = (...messages) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "222",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "111" },
            contacts: [{ wa_id: "15558934547", profile: { name: "Alexandra" } }],
            messages,
          },
        },
      ],
    },
  ],
});

const base = { from: "15558934547", timestamp: "1789000000" };

/** Lo que dice la burbuja cuando WhatsApp no entregó el contenido. */
const NO_SOPORTADO =
  "WhatsApp no deja recibir este mensaje acá: llegó el aviso pero no el " +
  "contenido. Suele pasar con encuestas, mensajes que se borran solos y " +
  "códigos de verificación que manda otra empresa. No se puede recuperar " +
  "desde el CRM.";
/** El texto con que queda guardado el primer mensaje de una carga. */
const leido = (msg) => leerWebhook(carga({ ...base, ...msg })).mensajes[0]?.texto ?? null;
/** Y lo que se ve en la lista, que es lo que cae cuando no hay texto. */
const enPantalla = (msg) => {
  const m = leerWebhook(carga({ ...base, ...msg })).mensajes[0];
  return resumen(m.tipo, m.texto);
};

// ══════════════════════════════════════════════════════════════════════════
console.log("── 1. EL DE LA ESCUELA: ABRIÓ EL CHAT DESDE UN ANUNCIO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  /*
   * La forma exacta que manda Meta cuando alguien entra desde un anuncio y no
   * escribe nada. Es el que salía como «Mensaje».
   */
  es(
    "DICE QUE ABRIÓ EL CHAT, Y DE QUÉ ANUNCIO",
    leido({
      id: "wamid.WELCOME1",
      type: "request_welcome",
      referral: {
        source_url: "https://www.tiktok.com/@lesartsculinaires/video/123",
        source_type: "ad",
        source_id: "9988",
        headline: "Diplomado de Pastelería 2026",
        body: "Inscripciones abiertas",
        media_type: "video",
      },
    }),
    "Abrió el chat desde un anuncio: «Diplomado de Pastelería 2026»",
  );

  // Sin titular, se dice igual lo que pasó: que abrió el chat.
  es(
    "y sin titular, dice al menos que abrió el chat",
    leido({ id: "wamid.WELCOME2", type: "request_welcome" }),
    "Abrió el chat",
  );

  es(
    "una publicación no se llama anuncio",
    leido({
      id: "wamid.WELCOME3",
      type: "request_welcome",
      referral: { source_type: "post", headline: "Clase abierta de Barismo" },
    }),
    "Abrió el chat desde una publicación: «Clase abierta de Barismo»",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 2. LO QUE ESCRIBIÓ LA PERSONA MANDA SOBRE EL ANUNCIO ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Un mensaje que SÍ trae texto y además viene de un anuncio tiene que mostrar
// lo que la persona escribió, sin pegarle el nombre de la campaña. Ponerle en
// la boca algo que no dijo es peor que no saber de dónde vino.
{
  es(
    "se lee lo que escribió, no el titular del anuncio",
    leido({
      id: "wamid.CONTEXTO",
      type: "text",
      text: { body: "Hola, quiero información del diplomado" },
      referral: { source_type: "ad", headline: "Diplomado de Pastelería 2026" },
    }),
    "Hola, quiero información del diplomado",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 3. LOS OTROS QUE TAMBIÉN SALÍAN COMO «Mensaje» ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es(
    "un pedido del catálogo dice cuántos productos",
    leido({
      id: "wamid.ORDEN",
      type: "order",
      order: {
        catalog_id: "cat-1",
        text: "¿me lo pueden apartar?",
        product_items: [{ product_retailer_id: "a" }, { product_retailer_id: "b" }],
      },
    }),
    "Pedido del catálogo: 2 productos — ¿me lo pueden apartar?",
  );

  es(
    "una ubicación dice dónde",
    leido({
      id: "wamid.LUGAR",
      type: "location",
      location: { latitude: 13.7, longitude: -89.2, name: "Les Arts Culinaires", address: "San Salvador" },
    }),
    "📍 Les Arts Culinaires — San Salvador",
  );

  es(
    "un contacto compartido dice de quién",
    leido({
      id: "wamid.CONTACTO",
      type: "contacts",
      contacts: [{ name: { formatted_name: "María Rodríguez" } }],
    }),
    "Contacto: María Rodríguez",
  );

  /*
   * «Cambió de número» importa más de lo que parece: sin esto, el hilo sigue
   * al mismo contacto y nadie se entera de que el teléfono de la ficha ya no
   * sirve.
   */
  es(
    "un aviso de WhatsApp se lee",
    leido({
      id: "wamid.SISTEMA",
      type: "system",
      system: { body: "Alexandra cambió de número de teléfono", type: "user_changed_number" },
    }),
    "Alexandra cambió de número de teléfono",
  );

  /*
   * ESTE es el que de verdad tiene la escuela: cuatro en la base, con el tipo
   * `unsupported` y el error 131051 adentro. El primer arreglo miraba sólo
   * `unknown` —así lo nombra parte de la documentación— y por eso no disparaba
   * justo en los mensajes que lo motivaron.
   */
  es(
    "EL QUE WHATSAPP NO DEJA RECIBIR DICE QUÉ HACER",
    leido({
      id: "wamid.RARO",
      type: "unsupported",
      errors: [{ code: 131051, title: "Message type unknown" }],
    }),
    NO_SOPORTADO,
  );

  es(
    "y con otro error, se dice el error",
    leido({
      id: "wamid.RARO2",
      type: "unsupported",
      errors: [{ code: 131000, title: "Something went wrong" }],
    }),
    "No se pudo recibir este mensaje (Something went wrong)",
  );

  // `unknown` sigue cubierto: cuál de los dos nombres use Meta no lo decide
  // este código.
  es(
    "el nombre viejo sigue cubierto",
    leido({ id: "wamid.RARO3", type: "unknown", errors: [{ code: 131051 }] }),
    NO_SOPORTADO,
  );

  /*
   * ------------------------------------------------------------------------
   * Y SI META MANDA EL CUERPO IGUAL, GANA EL CUERPO
   * ------------------------------------------------------------------------
   *
   * La escuela recibe en este número el código de verificación de TikTok, y
   * un código son seis dígitos que o están o no están. Si Meta manda el texto
   * aunque marque el tipo como no soportado, taparlo con «no se pudo recibir»
   * escondería justo el dato por el que alguien abrió la conversación.
   *
   * Con estos tipos Meta cambia de opinión seguido, así que se mira siempre.
   */
  es(
    "SI VINO EL TEXTO, SE MUESTRA EL TEXTO Y NO EL ERROR",
    leido({
      id: "wamid.CODIGO",
      type: "unsupported",
      errors: [{ code: 131051, title: "Message type unknown" }],
      text: { body: "Tu código de TikTok es 483920" },
    }),
    "Tu código de TikTok es 483920",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 4. Y SI LLEGA UN TIPO QUE NADIE CONOCE ──");
// ══════════════════════════════════════════════════════════════════════════
//
// Meta agrega tipos cada tanto, así que esto va a volver a pasar. Lo que no
// puede volver a pasar es la burbuja muda: sin el nombre del tipo, quien
// atiende no puede ni reportar qué le llegó.
{
  const r = leerWebhook(carga({ ...base, id: "wamid.FUTURO", type: "algo_nuevo_de_meta" }));
  es("se guarda igual, con su tipo", r.mensajes[0]?.tipo, "algo_nuevo_de_meta");
  es("y no se pierde el JSON, que es de donde se recupera", r.mensajes[0]?.crudo != null, true);
  es(
    "LA PANTALLA DICE CUÁL ES, NO «Mensaje»",
    enPantalla({ id: "wamid.FUTURO2", type: "algo_nuevo_de_meta" }),
    "Mensaje de tipo «algo_nuevo_de_meta»",
  );
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 5. LO QUE YA ANDABA SIGUE ANDANDO ──");
// ══════════════════════════════════════════════════════════════════════════
{
  es("un texto normal", leido({ id: "wamid.T", type: "text", text: { body: "Buenas" } }), "Buenas");
  es(
    "el pie de una foto",
    leido({ id: "wamid.F", type: "image", image: { id: "media-1", caption: "mirá esto" } }),
    "mirá esto",
  );
  // Una foto sin pie sigue sin texto a propósito: la foto se ve, y ponerle una
  // descripción haría parecer que la persona escribió algo.
  es(
    "y una foto sin pie sigue sin texto",
    leido({ id: "wamid.F2", type: "image", image: { id: "media-2" } }),
    null,
  );
  es("que en la lista se lee como «Foto»", enPantalla({ id: "wamid.F3", type: "image", image: { id: "m" } }), "Foto");

  // Las reacciones siguen sin entrar como mensajes.
  es(
    "una reacción no entra como mensaje",
    leerWebhook(
      carga({ ...base, id: "wamid.R", type: "reaction", reaction: { message_id: "wamid.T", emoji: "❤️" } }),
    ).mensajes.length,
    0,
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
