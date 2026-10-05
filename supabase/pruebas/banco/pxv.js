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

/**
 * Qué archivos «hay» en el almacenamiento de mentira, y cuáles se borraron.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA LLEVAR LA CUENTA
 * ============================================================================
 *
 * Antes el almacenamiento contestaba 200 a todo y no se acordaba de nada. Para
 * subir y mostrar alcanzaba, pero cuando apareció el callback de eliminación de
 * datos —que tiene que borrar los archivos de la conversación— dejó de alcanzar:
 * `remove()` salía en verde SIEMPRE, también si la aplicación hubiera pedido
 * borrar una ruta equivocada, o ninguna. O sea que el banco no podía distinguir
 * «se borró el archivo» de «no se pidió borrar nada», y esa es justo la
 * diferencia que había que comprobar.
 *
 * Son dos listas en memoria y se van con el proceso, que es lo que corresponde:
 * el banco se arma de cero en cada corrida.
 */
const archivos = new Set();
const borrados = [];

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

/**
 * Un Supabase FRÍO, que es el estado que rompe el CRM en producción.
 *
 * ============================================================================
 * POR QUÉ HACE FALTA PODER SIMULARLO
 * ============================================================================
 *
 * El proyecto de Supabase se enfría cuando pasa un rato sin uso, y la primera
 * petición después de eso tarda entre diez y quince segundos —medido contra el
 * proyecto de la escuela: 11,3 s en `/auth/v1/settings` y 15,9 s en `/rest`,
 * con dos intentos previos que ni conectaron—. En caliente son 230 ms.
 *
 * Eso no es un detalle de rendimiento: es lo que tiraba el CRM entero con dos
 * pantallas distintas de Netlify, una del middleware y otra de la página. Y no
 * se podía reproducir, porque el banco siempre contesta al instante.
 *
 *     curl -X POST 'http://127.0.0.1:3141/__lento?ms=12000'   # enfriar
 *     curl -X POST 'http://127.0.0.1:3141/__lento?ms=0'       # calentar
 *
 * Demora TODO menos el propio `/__lento`, igual que un proyecto dormido: lo que
 * está frío es el proyecto, no una ruta.
 */
let demoraMs = 0;

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");

  if (url.pathname === "/__lento") {
    demoraMs = Number(url.searchParams.get("ms") ?? 0) || 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ demoraMs }));
    return;
  }

  if (demoraMs > 0) {
    /*
     * La demora va ANTES de mirar qué pedían, a propósito.
     *
     * Un proyecto dormido no contesta rápido lo fácil y lento lo difícil: no
     * contesta nada hasta que despierta. Demorar sólo algunas rutas haría que
     * el banco pruebe una lentitud que no existe.
     */
    setTimeout(() => atender(url, req, res), demoraMs);
    return;
  }

  atender(url, req, res);
});

function atender(url, req, res) {
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
}

/** Las partes del almacenamiento de mentira. */
function responder(url, req, res, permisos) {
  /*
   * Para mirar desde una prueba qué archivos quedan y qué se pidió borrar.
   *
   * No existe en Supabase: es una ventana al estado del banco, como `/__lento`
   * en el Meta de mentira. Sin esto, comprobar un borrado obligaría a leer el
   * registro del proxy a mano.
   */
  if (url.pathname === "/storage/v1/__archivos") {
    res.writeHead(200, { ...permisos, "content-type": "application/json" });
    res.end(JSON.stringify({ archivos: [...archivos], borrados }));
    return;
  }

  /*
   * Borrar. Es lo que manda `supabase-js` en `remove(rutas)`:
   *
   *     DELETE /storage/v1/object/<balde>   con  { "prefixes": [...] }
   *
   * Se contesta la lista de lo que se borró de verdad —que es lo que contesta
   * Supabase— y se anota aparte TODO lo que se pidió borrar, incluso lo que no
   * estaba. Las dos cosas hacen falta: la primera para que la aplicación vea un
   * borrado normal, la segunda para que una prueba pueda comprobar que se pidió
   * borrar la ruta correcta y no otra.
   */
  if (req.method === "DELETE" && url.pathname.startsWith("/storage/v1/object/")) {
    const balde = url.pathname.slice("/storage/v1/object/".length).split("/")[0];
    let cuerpo = "";
    req.on("data", (t) => (cuerpo += t));
    req.on("end", () => {
      let rutas = [];
      try {
        rutas = JSON.parse(cuerpo).prefixes ?? [];
      } catch {
        // Un cuerpo ilegible se contesta como «ninguna ruta».
      }

      const sacados = [];
      for (const ruta of rutas) {
        const clave = `${balde}/${ruta}`;
        borrados.push(clave);
        if (archivos.delete(clave)) sacados.push({ name: ruta });
      }

      res.writeHead(200, { ...permisos, "content-type": "application/json" });
      res.end(JSON.stringify(sacados));
    });
    return;
  }

  /*
   * Firmar una dirección, en las DOS formas que tiene Supabase.
   *
   * --------------------------------------------------------------------------
   * ESTO ESTABA MAL Y NO SE NOTABA
   * --------------------------------------------------------------------------
   *
   * Contestaba siempre un ARREGLO, que es lo que devuelve `createSignedUrls`
   * —en plural, la que firma varias de una—. La aplicación usa la de a una,
   * `createSignedUrl`, que espera un OBJETO con `signedURL`. Leyendo un arreglo
   * como objeto, esa clave sale `undefined`, y `supabase-js` arma con eso la
   * dirección «…/storage/v1undefined» sin devolver ningún error.
   *
   * O sea: el banco daba por buena una firma rota. Todo lo que manda archivos
   * —las fotos del Inbox, las notas de voz, la imagen de encabezado de una
   * plantilla— salía en verde acá mandándole a Meta una dirección que no existe,
   * porque el Meta de mentira acepta cualquier cosa. En producción Meta la
   * intenta bajar y falla.
   *
   * Y el prefijo tampoco iba: `supabase-js` le pega adelante la dirección del
   * almacenamiento, así que mandando `/storage/v1/object/…` quedaba repetido y
   * el archivo no se encontraba.
   *
   * La diferencia entre las dos formas es la ruta: en plural se firma contra el
   * bucket y las rutas van en el cuerpo; en singular la ruta va en la dirección.
   */
  if (url.pathname.startsWith("/storage/v1/object/sign/")) {
    const deLaDireccion = url.pathname.slice("/storage/v1/object/sign/".length);

    let cuerpo = "";
    req.on("data", (t) => (cuerpo += t));
    req.on("end", () => {
      let rutas = [];
      try {
        rutas = JSON.parse(cuerpo).paths ?? [];
      } catch {
        // Un cuerpo ilegible se contesta como «ninguna ruta».
      }

      const firma = (ruta) => `/object/inventado/${encodeURIComponent(ruta)}`;

      res.writeHead(200, { ...permisos, "content-type": "application/json" });

      // Con `paths` en el cuerpo es la de a varias: contesta un arreglo.
      if (rutas.length > 0) {
        res.end(
          JSON.stringify(
            rutas.map((ruta) => ({ error: null, path: ruta, signedURL: firma(ruta) })),
          ),
        );
        return;
      }

      // Si no, es la de a una: la ruta viene en la dirección —después del
      // bucket— y se contesta un objeto.
      const ruta = deLaDireccion.split("/").slice(1).join("/");
      res.end(JSON.stringify({ signedURL: firma(decodeURIComponent(ruta)) }));
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
      // Los bytes se tiran, pero la ruta se anota: es lo que después permite
      // comprobar que un borrado se llevó este archivo y no otro.
      archivos.add(ruta);
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
