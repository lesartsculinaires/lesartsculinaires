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
      ws.__topic = topic;
      ws.__ids = respuesta.map((r) => ({ id: r.id, table: r.table }));
      console.log(`unido a ${topic} con ${respuesta.length} suscripciones`);
    }
  });
});

/** Avisa a todos los conectados que una tabla cambió. */
function avisar(tabla, tipo = "UPDATE", fila = {}) {
  for (const ws of clientes) {
    const s = (ws.__ids ?? []).find((x) => x.table === tabla);
    if (!s || !ws.__topic) continue;
    ws.send(JSON.stringify([null, null, ws.__topic, "postgres_changes", {
      ids: [s.id],
      data: {
        schema: "public", table: tabla, type: tipo,
        commit_timestamp: new Date().toISOString(),
        columns: Object.keys(fila).map((name) => ({ name, type: "text" })),
        record: fila, old_record: {}, errors: null,
      },
    }]));
  }
  console.log(`avisado: ${tipo} en ${tabla} (${clientes.size} conectados)`);
}

process.stdin.on("data", (d) => {
  const [tabla, tipo] = d.toString().trim().split(" ");
  if (tabla) avisar(tabla, tipo || "UPDATE", { id: 1 });
});

/*
 * ===========================================================================
 * LAS LLAMADAS SÍ SE MIRAN EN LA BASE
 * ===========================================================================
 *
 * Todo lo de arriba alcanza para las demás tablas porque al CRM sólo le
 * importa QUE algo cambió: con el aviso vuelve a pedir la pantalla al
 * servidor, y el contenido del aviso da igual.
 *
 * Con las llamadas no. Ahí el aviso ES el dato —el SDP, quién la atendió, en
 * qué estado está— porque el CRM no recarga nada al recibirlo: recargar en el
 * medio de una llamada cortaría lo que se está escribiendo, que es justo lo
 * que la escuela pidió evitar. Un aviso de mentira con `{id:1}` adentro
 * probaría que el websocket llega y nada más.
 *
 * Así que para esta tabla el falso Realtime hace lo que hace el de verdad:
 * mira la base y manda la fila. Cada 600 ms, que para una prueba es
 * instantáneo y no le cuesta nada a nadie.
 */
import { execFileSync } from "node:child_process";

const visto = new Map();
let primeraVuelta = true;

function mirarLlamadas() {
  let filas;
  try {
    const salida = execFileSync(
      "su",
      [
        "postgres",
        "-c",
        "psql -h /tmp -p 5511 -d crm -A -t -c \"select coalesce(json_agg(row_to_json(l)), '[]'::json) " +
          "from public.llamadas l where l.creado_en > now() - interval '1 hour'\"",
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
    const huella = JSON.stringify(fila);
    const antes = visto.get(fila.id);
    visto.set(fila.id, huella);
    if (antes === huella) continue;

    /*
     * En la primera vuelta se anota todo sin avisar. Si no, al arrancar el
     * banco se dispararían de golpe todas las llamadas de la última hora y el
     * CRM mostraría sonando una que terminó hace rato.
     */
    if (primeraVuelta) continue;

    avisar("llamadas", antes === undefined ? "INSERT" : "UPDATE", fila);
  }

  primeraVuelta = false;
}

setInterval(mirarLlamadas, 600);
mirarLlamadas();

console.log(`realtime de prueba en ws://127.0.0.1:${PUERTO}/realtime/v1/websocket`);
