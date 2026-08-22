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

console.log(`realtime de prueba en ws://127.0.0.1:${PUERTO}/realtime/v1/websocket`);
