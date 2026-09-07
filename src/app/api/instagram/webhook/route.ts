import { NextResponse, type NextRequest } from "next/server";

import {
  abrirLeadSiEsNuevo,
  anotarElCanal,
  faltaLaFuncion,
} from "@/lib/crm/leadDeCanal";
import { perfilDe } from "@/lib/instagram/enviar";
import { bajarAdjuntoIg, rutaMediaIg } from "@/lib/instagram/media";
import {
  ARCHIVO_IG,
  leerWebhookIg,
  resumenIg,
  type MensajeIg,
  type ReaccionIg,
} from "@/lib/instagram/mensajes";
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

/** Cómo se guarda este canal en `conversaciones.canal`. */
const CANAL = "instagram";

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
    console.warn("[instagram] firma inválida; se descarta");
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

  for (const m of mensajes) {
    try {
      await guardarEntrante(supabase, m);
    } catch (e) {
      // Un mensaje que no se pudo guardar no debe impedir los demás.
      console.error("[instagram] no se pudo guardar el mensaje", m.mid, e);
    }
  }

  for (const r of reacciones) {
    try {
      await guardarReaccion(supabase, r);
    } catch (e) {
      console.error("[instagram] no se pudo guardar la reacción", r.sobreMid, e);
    }
  }

  /*
   * Las lecturas se leen y no se guardan, todavía.
   *
   * `mensajes.estado` existe para los acuses de WhatsApp y Instagram manda algo
   * equivalente —«vio hasta acá»—, pero el aviso trae el ÚLTIMO mensaje visto y
   * no la lista, así que marcarlos bien es actualizar todo lo anterior de ese
   * hilo. Se deja apuntado en vez de escribir una versión a medias que después
   * muestre un doble tilde azul equivocado.
   */
  void lecturas;

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

/**
 * Guarda un mensaje de Instagram y deja la conversación al día.
 *
 * ----------------------------------------------------------------------------
 * LOS PROPIOS MENSAJES TAMBIÉN ENTRAN POR ACÁ
 * ----------------------------------------------------------------------------
 *
 * Si alguien del equipo contesta desde la aplicación de Instagram en su
 * teléfono en vez de hacerlo desde el CRM, Meta manda ese mensaje de vuelta
 * marcado como eco. Se guarda igual, como SALIENTE, y es una ventaja: el hilo
 * del CRM queda idéntico al real aunque la mitad se haya contestado desde el
 * teléfono, que en esta escuela va a pasar.
 *
 * Lo que un eco no hace es subir el contador de sin leer ni abrir un lead: no
 * es alguien preguntando, es alguien de acá contestando.
 */
async function guardarEntrante(supabase: Cliente, m: MensajeIg) {
  const conversacion = await conversacionDe(supabase, m.igsid);
  if (!conversacion) return;

  // El archivo se trae antes de guardar el mensaje, y con más urgencia que en
  // WhatsApp: el enlace que manda Instagram vence en minutos.
  const archivo = m.media ? await guardarArchivo(supabase, conversacion, m) : null;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    /*
     * El `mid` va en la columna `wa_id`.
     *
     * El nombre es de WhatsApp y quedó de cuando era el único canal; lo que la
     * columna guarda es «el id que le puso Meta a este mensaje», que es lo
     * mismo en los dos. Renombrarla sería tocar el webhook de WhatsApp, los
     * acuses de los envíos masivos y las reacciones, todo en producción, para
     * ganar un nombre más lindo. Los `mid` de Instagram no se parecen a los de
     * WhatsApp, así que no hay riesgo de que dos mensajes distintos choquen.
     */
    wa_id: m.mid,
    direccion: m.esEco ? "saliente" : "entrante",
    tipo: m.tipo,
    texto: m.texto,
    payload: m.crudo,
    creado_en: m.enviadoEn.toISOString(),
    media_ruta: archivo?.ruta ?? null,
    media_mime: archivo?.mime ?? null,
    media_error: archivo?.error ?? null,
  });

  // 23505 es la restricción de unicidad sobre `wa_id`: este mensaje ya estaba
  // guardado y esto es un reintento de Meta. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  if (m.esEco) {
    /*
     * Un eco adelanta el reloj del hilo pero no lo pone en rojo.
     *
     * Sin tocar `ultimo_mensaje_en`, un hilo contestado desde el teléfono se
     * quedaría abajo de todo en la bandeja, ordenada por esa fecha, y parecería
     * abandonado. Y `sin_leer` no se toca: ya se contestó.
     */
    await supabase
      .from("conversaciones")
      .update({
        ultimo_mensaje_en: m.enviadoEn.toISOString(),
        ultimo_texto: resumenIg(m.tipo, m.texto).slice(0, 200),
      })
      .eq("id", conversacion);
    return;
  }

  // El contador sube en la base, no en memoria: dos mensajes que llegan a la
  // vez se cuentan los dos.
  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: resumenIg(m.tipo, m.texto).slice(0, 200),
    p_cuando: m.enviadoEn.toISOString(),
  });

  await anotarElCanal(supabase, conversacion, CANAL, m.igsid, m.enviadoEn);
  await abrirLeadSiEsNuevo(supabase, conversacion, CANAL);
}

/**
 * La conversación de esta persona, creándola si es la primera vez.
 *
 * ----------------------------------------------------------------------------
 * `telefono` QUEDA NULO, Y ES LO CORRECTO
 * ----------------------------------------------------------------------------
 *
 * Meta no entrega el número de quien escribe por Instagram. La identidad es el
 * IGSID y va en `identificador`; poner el IGSID en `telefono` para «llenar el
 * campo» es exactamente lo que evita la migración `20261024120000_instagram.sql`,
 * y el porqué está escrito ahí: el CRM reconoce personas por los últimos ocho
 * dígitos del teléfono, y un IGSID de diecisiete dígitos terminaría fundiendo a
 * dos personas que no tienen nada que ver.
 */
async function conversacionDe(supabase: Cliente, igsid: string): Promise<number | null> {
  const buscar = async () => {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("canal", CANAL)
      .eq("identificador", igsid)
      .maybeSingle();
    return data ? Number(data.id) : null;
  };

  const existente = await buscar();
  if (existente != null) return existente;

  /*
   * El nombre y el @usuario se piden UNA vez, acá.
   *
   * En WhatsApp vienen dentro del mensaje; en Instagram hay que preguntarlos.
   * Pedirlos sólo cuando el hilo es nuevo es lo que hace que sea una llamada
   * por persona y no una por mensaje.
   */
  const perfil = await perfilDe(igsid);
  const clienteId = await clienteDe(supabase, igsid, perfil);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      canal: CANAL,
      identificador: igsid,
      // Ver arriba: no hay teléfono y no se inventa uno.
      telefono: null,
      nombre_perfil: perfil.nombre ?? (perfil.usuario ? `@${perfil.usuario}` : null),
      usuario: perfil.usuario,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  // Dos mensajes de la misma persona nueva llegando a la vez: el segundo choca
  // con la unicidad por canal y se queda con la que ganó.
  if (error?.code === "23505") return buscar();

  if (error) {
    if (esDeLaMigracion(error)) {
      console.error(
        "[instagram] falta correr 20261024120000_instagram.sql;" +
          " los mensajes de Instagram no se pueden guardar todavía",
      );
      return null;
    }
    throw error;
  }

  return creada ? Number(creada.id) : null;
}

/**
 * La base todavía no tiene lo que la migración de Instagram agrega.
 *
 * A diferencia de WhatsApp, acá no hay modo viejo al que caerse: sin
 * `identificador` no hay dónde poner un hilo de Instagram, porque `telefono` es
 * obligatorio en el esquema anterior y no tenemos ninguno. Se dice claro en el
 * registro y se devuelve 200 igual, para que Meta no desactive el webhook
 * mientras la escuela corre el SQL.
 */
const esDeLaMigracion = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST204" ||
  e.code === "42703" ||
  e.code === "23502" ||
  /identificador|usuario/i.test(e.message ?? "");

/**
 * La ficha de esta persona: la que ya existe, o una nueva.
 *
 * `cliente_de_instagram` busca por el IGSID en `contactos_canal` y, si no lo
 * encuentra, abre ficha nueva. A propósito NO junta con una ficha existente:
 * Meta no entrega teléfono ni correo, y juntar por nombre fundiría a dos «María
 * González» que no se conocen. El razonamiento completo está en la migración.
 *
 * Que falle no debe perder el mensaje: la conversación se guarda igual, sin
 * cliente, y el asesor la resuelve desde la bandeja.
 */
async function clienteDe(
  supabase: Cliente,
  igsid: string,
  perfil: { nombre: string | null; usuario: string | null },
): Promise<number | null> {
  const { data, error } = await supabase.rpc("cliente_de_instagram", {
    p_igsid: igsid,
    p_usuario: perfil.usuario,
    p_nombre: perfil.nombre,
  });

  if (!error) return data == null ? null : Number(data);

  if (faltaLaFuncion(error)) {
    console.error(
      "[instagram] falta correr 20261024120000_instagram.sql;" +
        " el hilo entra sin ficha de cliente",
    );
    return null;
  }

  console.error("[instagram] no se pudo resolver el cliente", error.message);
  return null;
}

/**
 * La persona reaccionó a uno de nuestros mensajes, o le sacó la reacción.
 *
 * Igual que en WhatsApp: no sube `sin_leer` ni toca `ultimo_texto`. Un 👍 sobre
 * la cotización que acabamos de mandar quiere decir «me llegó», no
 * «contestame»; contarlo como pendiente mandaría a la asesora a un hilo donde
 * nadie dijo nada.
 */
async function guardarReaccion(supabase: Cliente, r: ReaccionIg) {
  const { data: mensaje } = await supabase
    .from("mensajes")
    .select("id")
    .eq("wa_id", r.sobreMid)
    .maybeSingle();

  if (!mensaje) return;
  const mensajeId = Number(mensaje.id);

  // Siempre se borra primero: reemplazar un ❤️ por un 👍 no son dos reacciones
  // sino una que cambió, y quitarla es sólo el borrado.
  const { error: errBorrado } = await supabase
    .from("reacciones")
    .delete()
    .eq("mensaje_id", mensajeId)
    .eq("direccion", "entrante");

  if (errBorrado) return;
  if (!r.emoji) return;

  const { error } = await supabase.from("reacciones").insert({
    mensaje_id: mensajeId,
    direccion: "entrante",
    emoji: r.emoji,
    creado_en: r.cuando.toISOString(),
  });

  // 23505: llegaron dos avisos de la misma reacción a la vez.
  if (error && error.code !== "23505") throw error;
}

/**
 * Baja el adjunto y lo deja en el bucket.
 *
 * Nunca lanza y nunca demora de más: Meta espera un 200 y, si tarda, reintenta
 * el webhook entero. Un fallo se devuelve como texto en vez de cortar el
 * guardado: el mensaje vale aunque su foto no haya llegado.
 *
 * Los tipos que no son un archivo —una publicación compartida, una mención en
 * una historia— traen URL pero no hay nada que bajar: la publicación vive en
 * Instagram y el enlace queda en el `payload`, que es donde quien atiende lo
 * puede mirar.
 */
async function guardarArchivo(
  supabase: Cliente,
  conversacionId: number,
  m: MensajeIg,
): Promise<{ ruta: string | null; mime: string | null; error: string | null }> {
  if (!m.media) return { ruta: null, mime: null, error: null };
  if (!ARCHIVO_IG.has(m.media.clase)) return { ruta: null, mime: null, error: null };

  const corte = AbortSignal.timeout(SEGUNDOS_PARA_BAJAR * 1000);
  const bajado = await bajarAdjuntoIg(m.media.url, corte);

  if (!bajado.ok) {
    console.error("[instagram] no se pudo bajar el archivo", m.mid, bajado.error);
    return { ruta: null, mime: null, error: bajado.error };
  }

  const ruta = rutaMediaIg(conversacionId, m.mid, bajado.archivo.mime);

  /*
   * Mismo bucket que WhatsApp.
   *
   * Se llama «whatsapp» por cuando era el único canal, pero lo que guarda es
   * «lo que mandó el cliente, tal cual llegó», que es lo mismo acá. Reusarlo
   * evita un bucket más con sus políticas, y la bandeja ya sabe firmar enlaces
   * contra él. Los de Instagram van bajo `ig/`, así que se pueden mirar o
   * limpiar por separado.
   */
  const { error } = await supabase.storage
    .from("whatsapp")
    .upload(ruta, bajado.archivo.bytes, {
      contentType: bajado.archivo.mime,
      upsert: true,
    });

  if (error) {
    console.error("[instagram] no se pudo guardar el archivo", m.mid, error.message);
    return { ruta: null, mime: bajado.archivo.mime, error: error.message };
  }

  return { ruta, mime: bajado.archivo.mime, error: null };
}

/**
 * Cuánto se espera por un archivo antes de soltarlo.
 *
 * Meta corta el webhook a los 20 segundos y reintenta, así que el techo por
 * archivo tiene que dejar lugar para lo demás que hace la función.
 */
const SEGUNDOS_PARA_BAJAR = 8;
