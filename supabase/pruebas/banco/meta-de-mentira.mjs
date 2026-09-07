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

    if (/fallar=131042/.test(req.url)) {
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
