/**
 * Las reacciones que llegan por el webhook de Meta.
 *
 *     npx esbuild src/lib/whatsapp/mensajes.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/mensajes.mjs
 *     node supabase/pruebas/reacciones.test.mjs /tmp/mensajes.mjs
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO SE PRUEBA APARTE
 * ------------------------------------------------------------------------
 *
 * Porque Meta manda las reacciones ADENTRO de `messages`, mezcladas con los
 * mensajes de verdad, y la diferencia es sólo el `type`. Si se cuelan, el hilo
 * se llena de burbujas vacías que dicen «Mensaje» y no significan nada: una por
 * cada corazón que alguien puso.
 *
 * Y hay un segundo caso que es fácil pasar por alto: sacar una reacción llega
 * igual que ponerla, pero sin emoji. Leerlo como «puso una reacción vacía»
 * dejaría el ❤️ pegado para siempre aunque el cliente lo haya quitado.
 *
 * Las cargas de abajo tienen la forma exacta que manda Meta, con el envoltorio
 * completo de entry → changes → value.
 */
const { leerWebhook } = await import(process.argv[2] ?? "/tmp/mensajes.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** El envoltorio de Meta, para no repetirlo en cada caso. */
const carga = (...mensajes) => ({
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
            contacts: [{ profile: { name: "Evelyn" }, wa_id: "50377112233" }],
            messages: mensajes,
          },
        },
      ],
    },
  ],
});

const unTexto = {
  from: "50377112233",
  id: "wamid.TEXTO",
  timestamp: "1770000000",
  type: "text",
  text: { body: "Hola, quiero información" },
};

const unaReaccion = {
  from: "50377112233",
  id: "wamid.REACCION",
  timestamp: "1770000060",
  type: "reaction",
  reaction: { message_id: "wamid.NUESTRO", emoji: "🙏" },
};

console.log("── una reacción no es un mensaje ──");
{
  const r = leerWebhook(carga(unaReaccion));

  // Lo importante: NO entra al hilo. Antes de separarlas, esto era un mensaje
  // de tipo «reaction», sin texto, que la bandeja dibujaba como «Mensaje».
  es("NO SE GUARDA COMO MENSAJE", r.mensajes.length, 0);
  es("sale por su propia puerta", r.reacciones.length, 1);
  es("sobre qué mensaje fue", r.reacciones[0].sobreWaId, "wamid.NUESTRO");
  es("con qué emoji", r.reacciones[0].emoji, "🙏");
  es("y de quién", r.reacciones[0].telefono, "50377112233");
  es("con su propio id, distinto del mensaje", r.reacciones[0].waId, "wamid.REACCION");
}

console.log("\n── sacar la reacción no es poner una vacía ──");
{
  // Meta manda lo mismo pero sin emoji. Leerlo como una reacción más dejaría
  // el corazón pegado para siempre.
  const sinEmoji = { ...unaReaccion, id: "wamid.SACADA", reaction: { message_id: "wamid.NUESTRO" } };
  const r1 = leerWebhook(carga(sinEmoji));
  es("llega igual", r1.reacciones.length, 1);
  es("PERO EL EMOJI ES NULO", r1.reacciones[0].emoji, null);

  // Y a veces manda la cadena vacía en vez de omitir la clave.
  const vacio = { ...unaReaccion, id: "wamid.VACIA", reaction: { message_id: "wamid.NUESTRO", emoji: "" } };
  const r2 = leerWebhook(carga(vacio));
  es("la cadena vacía es lo mismo", r2.reacciones[0].emoji, null);
}

console.log("\n── mezcladas con mensajes de verdad ──");
{
  // Meta agrupa lo que llega junto. Un lote con las dos cosas tiene que
  // separarse sin perder ninguna.
  const r = leerWebhook(carga(unTexto, unaReaccion));
  es("el texto entra como mensaje", r.mensajes.length, 1);
  es("y dice lo que dijo", r.mensajes[0].texto, "Hola, quiero información");
  es("la reacción va aparte", r.reacciones.length, 1);
  es("y el nombre de perfil sigue llegando", r.mensajes[0].nombrePerfil, "Evelyn");
}

console.log("\n── lo roto se saltea sin tumbar el resto ──");
{
  /*
   * Sin `message_id` no hay a qué reaccionar. Se descarta esa sola: devolver
   * error haría que Meta reintente el lote entero y termine desactivando el
   * webhook, y con él se irían también los mensajes que sí estaban bien.
   */
  const rota = { from: "50377112233", id: "wamid.ROTA", timestamp: "1770000060", type: "reaction", reaction: { emoji: "👍" } };
  const r = leerWebhook(carga(unTexto, rota));
  es("la reacción sin mensaje se descarta", r.reacciones.length, 0);
  es("PERO EL MENSAJE BUENO ENTRA IGUAL", r.mensajes.length, 1);
}

console.log("\n── las tres puertas siguen abiertas ──");
{
  // Los acuses de entrega comparten la carga y no tenían que verse afectados.
  const conEstado = {
    object: "whatsapp_business_account",
    entry: [{ id: "222", changes: [{ field: "messages", value: {
      statuses: [{ id: "wamid.NUESTRO", status: "read", recipient_id: "50377112233" }],
    } }] }],
  };
  const r = leerWebhook(conEstado);
  es("los acuses siguen llegando", r.estados.length, 1);
  es("y con su estado", r.estados[0].estado, "read");

  const vacia = leerWebhook({});
  es("una carga vacía no revienta", [vacia.mensajes.length, vacia.estados.length, vacia.reacciones.length], [0, 0, 0]);
  const basura = leerWebhook(null);
  es("y tampoco una que no es un objeto", basura.reacciones.length, 0);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
