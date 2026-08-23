/**
 * Un Supabase de mentira para el banco de pruebas.
 *
 * La aplicación habla con rutas de Supabase (`/rest/v1/…`, `/auth/v1/user`,
 * `/realtime/v1/websocket`) y PostgREST sirve las tablas en la raíz. Esto hace
 * de traductor: recorta el prefijo y reenvía.
 *
 * `/auth/v1/user` se contesta acá leyendo el JWT, sin ir a ningún lado: en el
 * banco no hay un servidor de sesiones detrás.
 */
import http from "node:http";
import net from "node:net";
import { Buffer } from "node:buffer";

const PGRST = "http://127.0.0.1:3140";
const PUERTO = 3141;
const REALTIME_PUERTO = 3143;

/** El contenido de un JWT, sin verificar la firma: es un banco de pruebas. */
function leerJwt(auth) {
  if (!auth?.startsWith("Bearer ")) return null;
  const partes = auth.slice(7).split(".");
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");

  if (url.pathname === "/auth/v1/user") {
    const claims = leerJwt(req.headers.authorization);
    if (!claims?.sub) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "sin sesión" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: claims.sub,
        email: claims.email ?? "prueba@lac.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
      }),
    );
    return;
  }

  /*
   * El almacenamiento, de mentira pero completo.
   *
   * Hacen falta las dos mitades para poder probar las fotos y las notas de voz
   * del chat: la aplicación primero pide direcciones firmadas —una por
   * archivo— y recién después las carga en la pantalla. Contestando `[]` a lo
   * primero, la segunda no llega nunca y el visor se queda en «abriendo el
   * archivo…» para siempre.
   */
  if (url.pathname.startsWith("/storage/v1/object/sign/")) {
    let cuerpo = "";
    req.on("data", (t) => (cuerpo += t));
    req.on("end", () => {
      let rutas = [];
      try {
        rutas = JSON.parse(cuerpo).paths ?? [];
      } catch {
        // Un cuerpo ilegible se contesta como «ninguna ruta».
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          rutas.map((ruta) => ({
            error: null,
            path: ruta,
            signedURL: `/storage/v1/object/inventado/${encodeURIComponent(ruta)}`,
          })),
        ),
      );
    });
    return;
  }

  // El archivo en sí: un píxel, con el tipo que pida el nombre. Alcanza para
  // que la pantalla dibuje una foto o arme un reproductor.
  if (url.pathname.startsWith("/storage/v1/object/inventado/")) {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const tipo = /\.(ogg|mp3|m4a)$/.test(url.pathname)
      ? "audio/ogg"
      : /\.pdf$/.test(url.pathname)
        ? "application/pdf"
        : "image/png";
    res.writeHead(200, { "content-type": tipo, "content-length": png.length });
    res.end(png);
    return;
  }

  if (url.pathname.startsWith("/storage/v1/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
    return;
  }

  const destino = url.pathname.startsWith("/rest/v1")
    ? url.pathname.slice("/rest/v1".length) + url.search
    : url.pathname + url.search;

  // Cada petición queda contada, para poder medir cuánto cuesta un refresco.
  console.log("REST " + destino.split("?")[0]);

  const p = http.request(
    PGRST + destino,
    { method: req.method, headers: { ...req.headers, host: "127.0.0.1:3140" } },
    (r) => {
      res.writeHead(r.statusCode ?? 500, r.headers);
      r.pipe(res);
    },
  );
  p.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: String(e) }));
  });
  req.pipe(p);
});

/**
 * El websocket de Realtime, empalmado a mano.
 *
 * Una petición de «upgrade» no pasa por el manejador normal: el navegador y el
 * servidor de destino tienen que terminar hablándose directo.
 */
servidor.on("upgrade", (req, socket, cabeza) => {
  const arriba = net.connect(REALTIME_PUERTO, "127.0.0.1", () => {
    arriba.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (cabeza?.length) arriba.write(cabeza);
    arriba.pipe(socket);
    socket.pipe(arriba);
  });
  arriba.on("error", () => socket.destroy());
  socket.on("error", () => arriba.destroy());
});

servidor.listen(PUERTO, "127.0.0.1", () =>
  console.log(`proxy en http://127.0.0.1:${PUERTO}`),
);
