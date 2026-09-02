/**
 * Leer los avisos de llamada que manda Meta.
 *
 *     npx esbuild src/lib/whatsapp/llamadas.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/wll.mjs
 *     node supabase/pruebas/webhookLlamadas.test.mjs /tmp/wll.mjs
 *
 * ============================================================================
 * POR QUÉ SE PRUEBA ESTO Y NO OTRA COSA
 * ============================================================================
 *
 * El webhook de llamadas es el único punto de todo esto que no se puede
 * ensayar: haría falta que alguien llamara de verdad al número de la escuela,
 * y el plazo para contestar es de menos de un minuto. Si acá se lee mal el
 * teléfono o se pierde el SDP, la llamada no suena y no hay forma de darse
 * cuenta hasta que un cliente se queja de que nadie le contesta.
 *
 * Las cargas de abajo son las de la documentación de Meta.
 */
const { leerLlamadas, comoTermino } = await import(process.argv[2] ?? "/tmp/wll.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const SDP = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

/** El envoltorio que Meta pone alrededor de todo. */
const envolver = (valor) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field: "calls", value: valor }] }],
});

console.log("── UNA LLAMADA QUE ENTRA ──");
{
  const carga = envolver({
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "50322334455", phone_number_id: "999" },
    contacts: [{ profile: { name: "Celina Portillo" }, wa_id: "50377972598" }],
    calls: [
      {
        id: "wacid.ABC",
        from: "50377972598",
        to: "50322334455",
        event: "connect",
        direction: "USER_INITIATED",
        timestamp: "1788447600",
        session: { sdp_type: "offer", sdp: SDP },
      },
    ],
  });

  const [ll] = leerLlamadas(carga);
  es("se lee una", leerLlamadas(carga).length, 1);
  es("con su id", ll.callId, "wacid.ABC");
  es("EL TELÉFONO ES EL DEL CLIENTE", ll.telefono, "50377972598");
  es("y su nombre de perfil", ll.nombrePerfil, "Celina Portillo");
  es("la empezó el cliente", ll.laEmpezoElCliente, true);
  es("es un connect", ll.evento, "connect");
  es("TRAE LA OFERTA", ll.sdp, { tipo: "offer", texto: SDP });
  // Meta manda SEGUNDOS desde epoch, no milisegundos. Leerlo como
  // milisegundos daría enero de 1970 y toda llamada entraría «vencida».
  es("con la hora de Meta", ll.cuando.toISOString(), "2026-09-03T15:00:00.000Z");
  es("y todavía no terminó", ll.cierre, null);
}

console.log("\n── UNA QUE MARCAMOS NOSOTROS ──");
{
  /*
   * Acá está la trampa. En una saliente `from` es NUESTRO número: tomarlo sin
   * mirar dejaría la llamada guardada contra el número de la escuela, y el
   * hilo de la bandeja al que pertenece no se encontraría nunca. El cliente
   * está en `to`.
   */
  const carga = envolver({
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "50322334455", phone_number_id: "999" },
    calls: [
      {
        id: "wacid.DEF",
        from: "50322334455",
        to: "50377972598",
        event: "connect",
        direction: "BUSINESS_INITIATED",
        timestamp: "1788447600",
        session: { sdp_type: "answer", sdp: SDP },
      },
    ],
  });

  const [ll] = leerLlamadas(carga);
  es("EL TELÉFONO SIGUE SIENDO EL DEL CLIENTE", ll.telefono, "50377972598");
  es("no la empezó el cliente", ll.laEmpezoElCliente, false);
  es("y lo que llega es la respuesta", ll.sdp.tipo, "answer");
}

console.log("\n── CUANDO TERMINA ──");
{
  const carga = envolver({
    messaging_product: "whatsapp",
    calls: [
      {
        id: "wacid.ABC",
        from: "50377972598",
        to: "50322334455",
        event: "terminate",
        direction: "USER_INITIATED",
        timestamp: "1788447800",
        status: "COMPLETED",
        start_time: "1788447610",
        end_time: "1788447800",
        duration: 190,
      },
    ],
  });

  const [ll] = leerLlamadas(carga);
  es("es un terminate", ll.evento, "terminate");
  es("sin SDP", ll.sdp, null);
  es("CON LA DURACIÓN QUE CUENTA META", ll.cierre.duracionSeg, 190);
  es("y su resultado", ll.cierre.resultado, "COMPLETED");
  es("sin motivo, porque salió bien", ll.cierre.motivo, null);
}

console.log("\n── una que falló dice por qué ──");
{
  const carga = envolver({
    calls: [
      {
        id: "wacid.GHI",
        from: "50377972598",
        to: "50322334455",
        event: "terminate",
        direction: "USER_INITIATED",
        timestamp: "1788447800",
        status: "FAILED",
        errors: [{ code: 138000, title: "Call permission not granted" }],
      },
    ],
  });

  const [ll] = leerLlamadas(carga);
  es("el motivo llega", ll.cierre.motivo, "Call permission not granted");
  es("sin duración", ll.cierre.duracionSeg, null);
}

console.log("\n── PERDIDA Y RECHAZADA NO SON LO MISMO ──");
{
  /*
   * Para Meta las dos son «no hubo audio». Para la escuela no: una perdida es
   * trabajo pendiente —hay que devolverla— y una que alguien rechazó ya está
   * decidida. La diferencia la sabe el CRM, porque tiene anotado si alguien
   * llegó a agarrarla.
   */
  es("nadie la agarró: perdida", comoTermino("COMPLETED", false), "perdida");
  es("la agarraron y se habló: terminada", comoTermino("COMPLETED", true), "terminada");
  es("la agarraron y se rompió: fallida", comoTermino("FAILED", true), "fallida");
  es("falló sin que nadie la agarrara: perdida igual", comoTermino("FAILED", false), "perdida");
}

console.log("\n── lo que no se entiende se salta, no rompe ──");
{
  /*
   * Si esto lanzara, Meta recibiría un error, reintentaría y terminaría
   * desactivando el webhook: se perderían también los mensajes.
   */
  es("nada", leerLlamadas(null), []);
  es("un texto", leerLlamadas("hola"), []);
  es("sin entry", leerLlamadas({}), []);
  es("un evento que no conocemos", leerLlamadas(envolver({ calls: [{ id: "x", from: "1", event: "ringing" }] })), []);
  es("sin id", leerLlamadas(envolver({ calls: [{ from: "1", event: "connect" }] })), []);
  es("sin teléfono", leerLlamadas(envolver({ calls: [{ id: "x", event: "connect" }] })), []);
}

console.log("\n── UN CONNECT SIN SDP NO ES ATENDIBLE ──");
{
  /*
   * Y hay que poder decirlo. El SDP es lo único con lo que el navegador puede
   * armar el audio; sin él la llamada entra igual —queda registrada— pero
   * `sdp` en null es lo que después permite mostrar «no se pudo establecer»
   * en vez de dejar el teléfono sonando contra nada.
   */
  const [ll] = leerLlamadas(
    envolver({ calls: [{ id: "x", from: "50377972598", event: "connect", direction: "USER_INITIATED" }] }),
  );
  es("la llamada se lee igual", ll.callId, "x");
  es("PERO SIN SDP", ll.sdp, null);

  const [rara] = leerLlamadas(
    envolver({
      calls: [
        {
          id: "y", from: "50377972598", event: "connect", direction: "USER_INITIATED",
          session: { sdp_type: "pranswer", sdp: SDP },
        },
      ],
    }),
  );
  es("un tipo de SDP que no manejamos tampoco pasa", rara.sdp, null);
}

console.log("\n── varias en una sola carga ──");
{
  // Meta agrupa cuando llegan juntas, igual que con los mensajes.
  const carga = envolver({
    calls: [
      { id: "a", from: "50311111111", event: "connect", direction: "USER_INITIATED", session: { sdp_type: "offer", sdp: SDP } },
      { id: "b", from: "50322222222", event: "terminate", direction: "USER_INITIATED", status: "COMPLETED" },
    ],
  });
  es("se leen las dos", leerLlamadas(carga).map((l) => l.callId), ["a", "b"]);
}

console.log("\n── un teléfono escrito con signos se limpia ──");
{
  const [ll] = leerLlamadas(
    envolver({
      contacts: [{ profile: { name: "Ana" }, wa_id: "+503 7797-2598" }],
      calls: [{ id: "z", from: "+503 7797-2598", event: "connect", direction: "USER_INITIATED", session: { sdp_type: "offer", sdp: SDP } }],
    }),
  );
  es("queda sólo en dígitos", ll.telefono, "50377972598");
  // Y el nombre engancha igual, aunque en `contacts` viniera escrito distinto.
  es("Y EL NOMBRE ENGANCHA", ll.nombrePerfil, "Ana");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
