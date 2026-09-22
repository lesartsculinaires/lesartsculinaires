import { NextResponse, type NextRequest } from "next/server";

import { leerWebhookIg } from "@/lib/instagram/mensajes";
import {
  avisarCargaVacia,
  guardarEntranteMeta,
  guardarReaccionMeta,
} from "@/lib/meta/bandeja";
import { canalDeLaCarga, INSTAGRAM } from "@/lib/meta/canales";
import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";

/**
 * El webhook de Instagram.
 *
 * ============================================================================
 * POR QUÉ ES UNA RUTA APARTE Y NO UNA RAMA DE LA DE WHATSAPP
 * ============================================================================
 *
 * Porque Meta lo pide así: en el panel de la aplicación, cada producto
 * —WhatsApp por un lado, Instagram y Messenger por otro— tiene su propia URL de
 * devolución de llamada. No hay forma de que las dos cosas entren por la misma
 * dirección aunque uno quisiera.
 *
 * Y aunque la hubiera, conviene que estén separadas: el formato de adentro no
 * se parece —ver `lib/instagram/mensajes.ts`— y un error leyendo una carga de
 * Instagram no puede llegar a tumbar la entrada de los mensajes de WhatsApp,
 * que es por donde entra hoy casi todo lo que vende la escuela.
 *
 * Lo que SÍ se comparte es lo que tiene que ser igual venga de donde venga: a
 * quién se le asigna un lead nuevo, cuándo se abre uno y cuándo no. Eso está en
 * `lib/crm/leadDeCanal.ts`, que las dos rutas usan.
 */

/** Nunca cachear: cada llamada trae mensajes distintos. */
export const dynamic = "force-dynamic";

/**
 * Alta del webhook.
 *
 * Meta llama esta URL una vez, al configurarla, con un token que uno mismo
 * eligió y un desafío. Si el token coincide, hay que devolver el desafío tal
 * cual y en texto plano; cualquier otra cosa y Meta no acepta la URL.
 *
 * El token puede ser el mismo que el de WhatsApp o uno distinto: eso lo decide
 * quien lo configura. Acá se lee el suyo, y si no está se cae al de WhatsApp
 * —ver `elSecreto` más abajo, que explica por qué—.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const esperado = process.env.INSTAGRAM_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado) {
    return new NextResponse("Falta INSTAGRAM_VERIFY_TOKEN en el servidor", { status: 500 });
  }

  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === esperado) {
    return new NextResponse(q.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Token de verificación incorrecto", { status: 403 });
}

/**
 * El App Secret con el que Meta firmó esta carga.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE CAE AL DE WHATSAPP
 * ----------------------------------------------------------------------------
 *
 * El App Secret es de la APLICACIÓN de Meta, no del producto. Si la escuela
 * conecta Instagram en la misma aplicación donde ya tiene WhatsApp —que es lo
 * recomendado y lo que menos hay que configurar—, el secreto es literalmente el
 * mismo valor, y exigir que lo copien dos veces con dos nombres distintos sólo
 * agrega una variable que se puede pegar mal.
 *
 * `INSTAGRAM_APP_SECRET` existe igual para el caso de que se use una aplicación
 * aparte, y cuando está puesto MANDA. Lo que no se hace nunca es seguir sin
 * ninguno de los dos: sin firma, cualquiera que descubra esta URL puede
 * inventar conversaciones enteras.
 */
const elSecreto = (): string | undefined =>
  process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;

/**
 * Mensajes entrantes.
 *
 * Las mismas dos reglas que en WhatsApp:
 *
 * 1. Se verifica la firma antes de mirar el contenido. La URL es pública, así
 *    que sin eso cualquiera podría fabricar mensajes.
 *
 * 2. Se responde 200 salvo que la firma falle. Meta reintenta cuando recibe un
 *    error y, si insiste, desactiva el webhook; un mensaje raro que no supimos
 *    leer no vale perder la integración.
 */
export async function POST(req: NextRequest) {
  const secreto = elSecreto();
  if (!secreto) {
    console.error("[instagram] falta INSTAGRAM_APP_SECRET; se rechaza el webhook");
    return new NextResponse("sin configurar", { status: 500 });
  }

  // El cuerpo crudo, antes de parsear: la firma se calcula sobre estos bytes.
  const crudo = await req.text();

  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"), secreto)) {
    /*
     * Se dice CON CUÁL secreto se verificó, que es la mitad de la respuesta.
     *
     * --------------------------------------------------------------------
     * POR QUÉ ESTE AVISO ES DISTINTO DE LOS DEMÁS
     * --------------------------------------------------------------------
     *
     * Porque el modo en que falla es invisible desde los dos lados. En Meta se
     * ve la entrega hecha; acá se ve un 401 que no explica nada; y el mensaje
     * del cliente simplemente no aparece en la bandeja.
     *
     * La causa casi siempre es la misma: la escuela usa una aplicación de Meta
     * aparte para Instagram, y `INSTAGRAM_APP_SECRET` no está puesto. Sin él
     * esto cae al de WhatsApp —ver `elSecreto`— y las firmas no van a coincidir
     * nunca, porque las firmó otra aplicación.
     *
     * Decir cuál se usó convierte un rato de buscar a ciegas en una línea de
     * registro que se lee y se arregla. No se registra ningún secreto: sólo
     * cuál de los dos nombres de variable entró en juego.
     */
    const cual = process.env.INSTAGRAM_APP_SECRET
      ? "INSTAGRAM_APP_SECRET"
      : "WHATSAPP_APP_SECRET (de reserva, porque INSTAGRAM_APP_SECRET no está puesto)";
    console.warn(
      `[instagram] firma inválida; se descarta. Se verificó con ${cual}. ` +
        "Si Instagram está en otra aplicación de Meta, hay que poner la clave " +
        "secreta DE ESA aplicación en INSTAGRAM_APP_SECRET.",
    );
    return new NextResponse("firma inválida", { status: 401 });
  }

  let carga: unknown;
  try {
    carga = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, nota: "cuerpo ilegible" });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[instagram] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  const { mensajes, reacciones, lecturas } = leerWebhookIg(carga);

  /*
   * A esta URL también llega Messenger, y por eso se mira `object`.
   *
   * Las dos suscripciones de Meta apuntan acá —la de `instagram` y la de
   * `page`—, así que la dirección no alcanza para saber de quién es el mensaje.
   * El porqué, con la consulta que lo demostró, está en `meta/canales.ts`.
   */
  const canal = canalDeLaCarga(carga, INSTAGRAM);

  if (mensajes.length === 0 && reacciones.length === 0 && lecturas.length === 0) {
    avisarCargaVacia(canal, carga);
  }

  for (const m of mensajes) {
    try {
      await guardarEntranteMeta(supabase, canal, m);
    } catch (e) {
      // Un mensaje que no se pudo guardar no debe impedir los demás.
      console.error(`[${canal.clave}] no se pudo guardar el mensaje`, m.mid, e);
    }
  }

  for (const r of reacciones) {
    try {
      await guardarReaccionMeta(supabase, canal, r);
    } catch (e) {
      console.error(`[${canal.clave}] no se pudo guardar la reacción`, r.sobreMid, e);
    }
  }

  /*
   * Las lecturas se leen y no se guardan, todavía.
   *
   * `mensajes.estado` existe para los acuses de WhatsApp e Instagram manda algo
   * equivalente —«vio hasta acá»—, pero el aviso trae el ÚLTIMO mensaje visto y
   * no la lista, así que marcarlos bien es actualizar todo lo anterior de ese
   * hilo. Se deja apuntado en vez de escribir una versión a medias que después
   * muestre un doble tilde azul equivocado.
   */
  void lecturas;

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}
