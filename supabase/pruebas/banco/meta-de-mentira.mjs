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

const servidor = http.createServer((req, res) => {
  // Un GET a `/__recibidos` devuelve lo que llegó hasta ahora. No es parte de
  // la API de Meta: es la ventana que la prueba usa para mirar adentro.
  if (req.method === "GET" && req.url.startsWith("/__recibidos")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recibidos));
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
      }),
    );
  });
});

servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`Meta de mentira escuchando en http://127.0.0.1:${puerto}`);
});
