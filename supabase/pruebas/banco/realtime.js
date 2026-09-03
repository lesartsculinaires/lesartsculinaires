/**
 * Un Realtime de Supabase de mentira, lo justo para probar el camino entero.
 *
 * Supabase manda los cambios por un canal Phoenix sobre websocket. Acá se
 * imita ese protocolo —unirse, latidos y el aviso de que una tabla cambió—
 * para poder comprobar que el CRM reacciona: que dice «En vivo» y que vuelve a
 * pedir los datos cuando llega un aviso.
 *
 * No lee la base: los avisos se disparan a mano escribiendo por la entrada
 * estándar, por ejemplo «clientes UPDATE». Lo que se comprueba es el lado del
 * navegador, que es el que escribimos nosotros.
 *
 * El protocolo va en versión 2: cada mensaje es un arreglo
 * `[join_ref, ref, topic, event, payload]`.
 */
import { WebSocketServer } from "ws";

const PUERTO = 3143;
const clientes = new Set();
const wss = new WebSocketServer({ port: PUERTO, path: "/realtime/v1/websocket" });

wss.on("connection", (ws) => {
  clientes.add(ws);
  ws.on("close", () => clientes.delete(ws));

  ws.on("message", (crudo) => {
    let msg;
    try {
      msg = JSON.parse(crudo.toString());
    } catch {
      return;
    }
    const [joinRef, ref, topic, evento, payload] = msg;

    if (evento === "heartbeat" || evento === "access_token") {
      ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply",
        { status: "ok", response: {} }]));
      return;
    }

    if (evento === "phx_join") {
      /*
       * La respuesta devuelve un id por cada suscripción pedida, en el mismo
       * orden. El cliente los usa para saber a qué callback mandar cada aviso:
       * sin ellos se une igual y no llega nada, que es justo la falla que este
       * montaje viene a descartar.
       */
      const pedidas = payload?.config?.postgres_changes ?? [];
      const respuesta = pedidas.map((p, i) => ({ id: i + 1, ...p }));
      ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply",
        { status: "ok", response: { postgres_changes: respuesta } }]));

      /*
       * Las suscripciones se guardan POR CANAL, no por socket.
       *
       * supabase-js multiplexa todos los canales sobre un solo websocket. El
       * CRM abre dos —«crm-en-vivo» para los datos y «crm-llamadas» para el
       * teléfono— así que guardando esto en el socket, el segundo en unirse
       * pisaba las suscripciones del primero y los avisos de `oportunidades`
       * se descartaban sin dejar rastro. El CRM se veía quieto y parecía que
       * el tiempo real no andaba, cuando el que no andaba era este montaje.
       */
      ws.__canales ??= new Map();
      ws.__canales.set(
        topic,
        respuesta.map((r) => ({ id: r.id, table: r.table })),
      );
      console.log(`unido a ${topic} con ${respuesta.length} suscripciones`);
    }
  });
});

/** Avisa a todos los canales suscriptos que una tabla cambió. */
function avisar(tabla, tipo = "UPDATE", fila = {}) {
  let enviados = 0;

  for (const ws of clientes) {
    // Un socket puede tener varios canales, y la misma tabla puede estar
    // suscripta en más de uno. Se le manda a cada uno con SU id de
    // suscripción: el cliente descarta el aviso cuyo id no reconoce.
    for (const [topic, ids] of ws.__canales ?? new Map()) {
      const s = ids.find((x) => x.table === tabla);
      if (!s) continue;
      ws.send(JSON.stringify([null, null, topic, "postgres_changes", {
        ids: [s.id],
        data: {
          schema: "public", table: tabla, type: tipo,
          commit_timestamp: new Date().toISOString(),
          columns: Object.keys(fila).map((name) => ({ name, type: "text" })),
          record: fila, old_record: {}, errors: null,
        },
      }]));
      enviados += 1;
    }
  }

  // Se cuenta lo ENVIADO y no los conectados: decir «1 conectados» mientras
  // no se manda nada es exactamente lo que escondió este problema.
  console.log(`avisado: ${tipo} en ${tabla} → ${enviados} canal(es)`);
}

process.stdin.on("data", (d) => {
  const [tabla, tipo] = d.toString().trim().split(" ");
  if (tabla) avisar(tabla, tipo || "UPDATE", { id: 1 });
});

/*
 * ===========================================================================
 * ALGUNAS TABLAS SÍ SE MIRAN EN LA BASE
 * ===========================================================================
 *
 * Lo de arriba —avisar a mano por la entrada estándar— alcanza para comprobar
 * que el websocket llega. No alcanza para dos cosas que el CRM sí hace:
 *
 *   LAS LLAMADAS      Ahí el aviso ES el dato: el SDP, quién la atendió, en
 *                     qué estado está. El CRM no recarga nada al recibirlo
 *                     —recargar en medio de una llamada cortaría lo que se
 *                     está escribiendo— así que lee la fila del aviso. Un
 *                     aviso de mentira con `{id:1}` adentro probaría que el
 *                     websocket llega y nada más.
 *
 *   LAS OPORTUNIDADES Ahí lo que hay que poder probar es el caso de todos los
 *                     días: otra asesora mueve un lead desde SU computadora y
 *                     la pantalla de acá tiene que enterarse sola. Eso, en una
 *                     prueba, es escribir en la base sin tocar el navegador —y
 *                     sin un vigía, no llega ningún aviso—.
 *
 * Para esas dos, el falso Realtime hace lo que hace el de verdad: mira la base
 * y manda la fila. Cada 600 ms, que para una prueba es instantáneo.
 *
 * Se miran POCAS COLUMNAS a propósito. Traer la fila entera de `oportunidades`
 * en cada vuelta —con notas, textos largos— sería mover mucho para detectar un
 * cambio de columna; con las que decide el tablero alcanza.
 */
import { execFileSync } from "node:child_process";

const VIGILADAS = [
  { tabla: "llamadas", que: "row_to_json(l)", desde: "public.llamadas l",
    donde: "where l.creado_en > now() - interval '1 hour'" },
  { tabla: "oportunidades",
    que: "json_build_object('id', o.id, 'etapa_id', o.etapa_id, 'estado_id', o.estado_id," +
         " 'vendedor_id', o.vendedor_id, 'producto_id', o.producto_id," +
         " 'valor_oportunidad', o.valor_oportunidad, 'venta_cerrada', o.venta_cerrada," +
         " 'fecha_cierre', o.fecha_cierre)",
    desde: "public.oportunidades o", donde: "" },
];

const visto = new Map();
let primeraVuelta = true;

function mirar({ tabla, que, desde, donde }) {
  let filas;
  try {
    const salida = execFileSync(
      "su",
      [
        "postgres",
        "-c",
        `psql -h /tmp -p 5511 -d crm -A -t -c "select coalesce(json_agg(${que}), '[]'::json) ` +
          `from ${desde} ${donde}"`,
      ],
      { encoding: "utf8" },
    ).trim();
    filas = JSON.parse(salida || "[]");
  } catch {
    // La base todavía no está, o no existe la tabla. Se prueba en la próxima
    // vuelta en vez de tumbar el servidor de pruebas.
    return;
  }

  for (const fila of filas) {
    const llave = `${tabla}:${fila.id}`;
    const huella = JSON.stringify(fila);
    const antes = visto.get(llave);
    visto.set(llave, huella);
    if (antes === huella) continue;

    /*
     * En la primera vuelta se anota todo sin avisar. Si no, al arrancar el
     * banco se dispararían de golpe todas las filas que hay y el CRM se
     * pasaría los primeros segundos recargando por cambios que no hubo.
     */
    if (primeraVuelta) continue;

    avisar(tabla, antes === undefined ? "INSERT" : "UPDATE", fila);
  }
}

function vigilar() {
  for (const v of VIGILADAS) mirar(v);
  primeraVuelta = false;
}

setInterval(vigilar, 600);
vigilar();

console.log(`realtime de prueba en ws://127.0.0.1:${PUERTO}/realtime/v1/websocket`);
