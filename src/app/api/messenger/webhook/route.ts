import { NextResponse, type NextRequest } from "next/server";

import {
  avisarCargaVacia,
  guardarEntranteMeta,
  guardarReaccionMeta,
  type CanalMeta,
} from "@/lib/meta/bandeja";
import { perfilDeMsn } from "@/lib/messenger/enviar";
import { ARCHIVO_MSN, leerWebhookMsn, resumenMsn } from "@/lib/messenger/mensajes";
import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";

/**
 * Por acá entran los mensajes de Messenger.
 *
 * ============================================================================
 * ES LA MISMA PUERTA QUE INSTAGRAM, CON OTRO CARTEL
 * ============================================================================
 *
 * Meta manda las dos cosas con la misma forma, y todo lo que hay que hacer con
 * ellas —guardar, no duplicar un reintento, abrir el lead, sortear asesora— está
 * en `lib/meta/bandeja.ts`, compartido. Acá quedan las tres cosas que sí son de
 * Messenger: qué secreto verifica la firma, qué se dice en el registro, y qué
 * canal se escribe en la conversación.
 *
 * ============================================================================
 * POR QUÉ ES UNA RUTA APARTE Y NO LA MISMA DE INSTAGRAM
 * ============================================================================
 *
 * Porque en Meta se configuran por separado: el webhook de Instagram apunta a su
 * URL y el de Messenger —objeto `page`— a la suya. Podrían compartir dirección y
 * decidir por el campo `object` de la carga, y sería una dirección que si se
 * rompe se rompen las dos.
 *
 * Separadas, un problema en Messenger no toca Instagram, y en el registro de
 * Netlify se ve de una cuál de las dos está llamando y cuál no. Que es
 * exactamente la pregunta que costó días contestar con Instagram.
 */

/** Nunca cachear: cada llamada trae mensajes distintos. */
export const dynamic = "force-dynamic";

/** La ficha de este canal para la bandeja compartida. */
const MESSENGER: CanalMeta = {
  clave: "messenger",
  nombreCatalogo: "Messenger",
  carpeta: "msn",
  migracion: "20260921120000_messenger.sql",
  resumen: resumenMsn,
  esArchivo: (clase) => ARCHIVO_MSN.has(clase),
  perfilDe: perfilDeMsn,
  rpcCliente: {
    nombre: "cliente_de_canal",
    argumentos: (psid, perfil) => ({
      p_canal: "Messenger",
      p_identificador: psid,
      p_usuario: perfil.usuario,
      p_nombre: perfil.nombre,
    }),
  },
};

/**
 * Alta del webhook.
 *
 * Meta llama esta URL una vez, al configurarla, con un token que uno mismo
 * eligió y un desafío. Si el token coincide, hay que devolver el desafío tal
 * cual y en texto plano.
 *
 * Se cae al de WhatsApp cuando no hay uno propio, por lo mismo que en Instagram:
 * el token de verificación no es un secreto de Meta sino una palabra que elige
 * la escuela, y tener tres nombres distintos para la misma palabra es una
 * variable más donde pegar mal.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const esperado =
    process.env.MESSENGER_VERIFY_TOKEN ??
    process.env.INSTAGRAM_VERIFY_TOKEN ??
    process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado) {
    return new NextResponse("Falta MESSENGER_VERIFY_TOKEN en el servidor", { status: 500 });
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
 * Es de la APLICACIÓN, no del producto: si Messenger, Instagram y WhatsApp están
 * en la misma aplicación de Meta, el secreto es literalmente el mismo valor.
 *
 * Hoy en esta escuela NO lo están —Instagram vive en «instalac» y WhatsApp en
 * otra—, así que el orden importa: primero el propio, después el de Instagram
 * (que es la aplicación donde está la Página) y recién al final el de WhatsApp.
 */
const elSecreto = (): string | undefined =>
  process.env.MESSENGER_APP_SECRET ??
  process.env.INSTAGRAM_APP_SECRET ??
  process.env.WHATSAPP_APP_SECRET;

/**
 * Mensajes entrantes.
 *
 * Las mismas dos reglas que en WhatsApp e Instagram:
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
    console.error("[messenger] falta MESSENGER_APP_SECRET; se rechaza el webhook");
    return new NextResponse("sin configurar", { status: 500 });
  }

  // El cuerpo crudo, antes de parsear: la firma se calcula sobre estos bytes.
  const crudo = await req.text();

  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"), secreto)) {
    /*
     * Se dice CON CUÁL secreto se verificó, que es la mitad de la respuesta.
     *
     * El modo en que esto falla es invisible desde los dos lados: en Meta se ve
     * la entrega hecha, acá un 401 que no explica nada, y el mensaje del cliente
     * simplemente no aparece en la bandeja. Nombrar la variable que entró en
     * juego convierte un rato de buscar a ciegas en una línea que se lee y se
     * arregla. No se registra ningún secreto: sólo cuál de los tres nombres.
     */
    const cual = process.env.MESSENGER_APP_SECRET
      ? "MESSENGER_APP_SECRET"
      : process.env.INSTAGRAM_APP_SECRET
        ? "INSTAGRAM_APP_SECRET (de reserva)"
        : "WHATSAPP_APP_SECRET (de reserva, porque no hay uno propio ni de Instagram)";
    console.warn(
      `[messenger] firma inválida; se descarta. Se verificó con ${cual}. ` +
        "Tiene que ser la clave secreta DE LA APLICACIÓN donde está configurado " +
        "el webhook de Messenger.",
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
    console.error("[messenger] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  const { mensajes, reacciones, lecturas } = leerWebhookMsn(carga);

  if (mensajes.length === 0 && reacciones.length === 0 && lecturas.length === 0) {
    avisarCargaVacia(MESSENGER, carga);
  }

  for (const m of mensajes) {
    try {
      await guardarEntranteMeta(supabase, MESSENGER, m);
    } catch (e) {
      // Un mensaje que no se pudo guardar no debe impedir los demás.
      console.error("[messenger] no se pudo guardar el mensaje", m.mid, e);
    }
  }

  for (const r of reacciones) {
    try {
      await guardarReaccionMeta(supabase, MESSENGER, r);
    } catch (e) {
      console.error("[messenger] no se pudo guardar la reacción", r.sobreMid, e);
    }
  }

  /*
   * Las lecturas se leen y no se guardan, todavía.
   *
   * `mensajes.estado` existe para los acuses de WhatsApp y Messenger manda algo
   * equivalente —«vio hasta acá»—, pero el aviso trae el ÚLTIMO mensaje visto y
   * no la lista, así que marcarlos bien es actualizar todo lo anterior de ese
   * hilo. Se deja apuntado en vez de escribir una versión a medias que después
   * muestre un doble tilde azul equivocado. Es la misma decisión que Instagram.
   */
  void lecturas;

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}
