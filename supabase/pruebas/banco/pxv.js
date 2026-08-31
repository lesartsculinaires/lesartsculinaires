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
   * Hacen falta las tres partes para poder probar las fotos y las notas de voz
   * del chat: subir, firmar y bajar. La aplicación sube el archivo derecho al
   * bucket desde el navegador, después pide una dirección firmada, y recién
   * entonces la carga en la pantalla. Si falta cualquiera de las tres, la
   * siguiente no llega nunca.
   *
   * ------------------------------------------------------------------------
   * CORS, QUE NO ES UN DETALLE
   * ------------------------------------------------------------------------
   *
   * La aplicación corre en 3142 y esto en 3141: para el navegador son dos
   * orígenes distintos, así que sin las cabeceras de permiso la subida falla
   * con «Failed to fetch» —un error de red, sin más explicación— antes de que
   * el servidor llegue a ver nada. Lo de PostgREST anda porque PostgREST manda
   * esas cabeceras por su cuenta; esto, no.
   */
  if (url.pathname.startsWith("/storage/v1/")) {
    const permisos = {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-upsert, cache-control",
      "access-control-max-age": "86400",
    };

    // El navegador pregunta antes de subir. Sin esta respuesta no llega a
    // intentarlo.
    if (req.method === "OPTIONS") {
      res.writeHead(204, permisos);
      res.end();
      return;
    }

    responder(url, req, res, permisos);
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

/** Las tres partes del almacenamiento de mentira. */
function responder(url, req, res, permisos) {
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
      res.writeHead(200, { ...permisos, "content-type": "application/json" });
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
    res.writeHead(200, { ...permisos, "content-type": tipo, "content-length": png.length });
    res.end(png);
    return;
  }

  /*
   * Subir un archivo.
   *
   * Se contesta lo que contesta Supabase —un objeto con la clave— y no un
   * arreglo vacío: `supabase-js` mira que no haya `error`, pero la aplicación
   * después usa la ruta, y devolver otra forma haría que el banco pruebe algo
   * distinto de lo que pasa en producción. Los bytes se tiran: lo que hace
   * falta comprobar es que el camino funcione, no guardar nada.
   */
  if (req.method === "POST" || req.method === "PUT") {
    const ruta = decodeURIComponent(url.pathname.replace("/storage/v1/object/", ""));
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { ...permisos, "content-type": "application/json" });
      res.end(JSON.stringify({ Id: "de-mentira", Key: ruta }));
    });
    return;
  }

  res.writeHead(200, { ...permisos, "content-type": "application/json" });
  res.end("[]");
}

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
