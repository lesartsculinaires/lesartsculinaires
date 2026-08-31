import { NextResponse, type NextRequest } from "next/server";

import { abrirOportunidad } from "@/lib/crm/altaLead";
import { sortear, yaEsLead } from "@/lib/reparto";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";
import { bajarMedia, rutaMedia } from "@/lib/whatsapp/media";
import {
  leerWebhook,
  resumen,
  type MensajeEntrante,
  type ReaccionEntrante,
} from "@/lib/whatsapp/mensajes";

/** Nunca cachear: cada llamada trae mensajes distintos. */
export const dynamic = "force-dynamic";

/**
 * Alta del webhook.
 *
 * Meta llama esta URL una vez, al configurarla, con un token que uno mismo
 * eligió y un desafío. Si el token coincide, hay que devolver el desafío tal
 * cual y en texto plano; cualquier otra cosa y Meta no acepta la URL.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!esperado) {
    return new NextResponse("Falta WHATSAPP_VERIFY_TOKEN en el servidor", { status: 500 });
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
 * Mensajes entrantes.
 *
 * Dos cosas gobiernan el diseño de acá:
 *
 * 1. Se verifica la firma antes de mirar el contenido. La URL es pública, así
 *    que sin eso cualquiera podría inventar conversaciones enteras.
 *
 * 2. Se responde 200 salvo que la firma falle. Meta reintenta cuando recibe
 *    un error y, si insiste, desactiva el webhook; un mensaje raro que no
 *    supimos leer no vale perder la integración. Lo que falla queda en el
 *    registro del servidor, no en un reintento infinito.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    console.error("[whatsapp] falta WHATSAPP_APP_SECRET; se rechaza el webhook");
    return new NextResponse("sin configurar", { status: 500 });
  }

  // El cuerpo crudo, antes de parsear: la firma se calcula sobre estos bytes.
  const crudo = await req.text();

  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"), secreto)) {
    console.warn("[whatsapp] firma inválida; se descarta");
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
    console.error("[whatsapp] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  const { mensajes, estados, reacciones } = leerWebhook(carga);

  for (const m of mensajes) {
    try {
      await guardarEntrante(supabase, m);
    } catch (e) {
      // Un mensaje que no se pudo guardar no debe impedir los demás.
      console.error("[whatsapp] no se pudo guardar el mensaje", m.waId, e);
    }
  }

  for (const s of estados) {
    try {
      await supabase
        .from("mensajes")
        .update({ estado: s.estado, error: s.error })
        .eq("wa_id", s.waId);
    } catch (e) {
      console.error("[whatsapp] no se pudo actualizar el estado", s.waId, e);
    }
  }

  for (const r of reacciones) {
    try {
      await guardarReaccion(supabase, r);
    } catch (e) {
      console.error("[whatsapp] no se pudo guardar la reacción", r.waId, e);
    }
  }

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}

/**
 * El cliente reaccionó a uno de nuestros mensajes, o le sacó la reacción.
 *
 * ------------------------------------------------------------------------
 * NO CUENTA COMO MENSAJE SIN LEER, Y ES A PROPÓSITO
 * ------------------------------------------------------------------------
 *
 * No sube `sin_leer` ni toca `ultimo_texto`. Un 👍 sobre la cotización que
 * acabamos de mandar quiere decir «me llegó», no «contestame»: contarlo como
 * pendiente mandaría a la asesora a un hilo donde nadie dijo nada, y el número
 * rojo dejaría de significar «acá hay algo esperándote».
 *
 * La reacción se ve al abrir la conversación, que es donde sirve.
 *
 * ------------------------------------------------------------------------
 * SI NO SE ENCUENTRA EL MENSAJE, SE IGNORA
 * ------------------------------------------------------------------------
 *
 * Puede reaccionar a algo anterior a que existiera el CRM, o a un mensaje que
 * nunca llegó a guardarse. No es un error: es una reacción sobre algo que acá
 * no está, y no hay dónde ponerla.
 *
 * Como todo lo del webhook, no lanza hacia afuera sin que quede registro: Meta
 * reintenta ante un error y termina desactivando la integración.
 */
async function guardarReaccion(supabase: Cliente, r: ReaccionEntrante) {
  const { data: mensaje } = await supabase
    .from("mensajes")
    .select("id")
    .eq("wa_id", r.sobreWaId)
    .maybeSingle();

  if (!mensaje) return;
  const mensajeId = Number(mensaje.id);

  /*
   * Siempre se borra primero.
   *
   * Sacarla es sólo eso. Ponerla es borrar y volver a poner, porque WhatsApp
   * admite una sola por persona y por mensaje: reemplazar un ❤️ por un 👍 no
   * son dos reacciones sino una que cambió. El índice único lo impone igual;
   * hacerlo así evita depender de un upsert sobre una restricción que podría
   * no existir todavía.
   */
  const { error: errBorrado } = await supabase
    .from("reacciones")
    .delete()
    .eq("mensaje_id", mensajeId)
    .eq("direccion", "entrante");

  if (errBorrado) {
    if (faltaLaTabla(errBorrado)) {
      console.error(
        "[whatsapp] falta correr 20261012120000_reacciones.sql;" +
          " la reacción del cliente se pierde",
      );
      return;
    }
    throw errBorrado;
  }

  if (!r.emoji) return;

  const { error } = await supabase.from("reacciones").insert({
    mensaje_id: mensajeId,
    direccion: "entrante",
    emoji: r.emoji,
    creado_en: r.cuando.toISOString(),
  });

  // 23505: llegaron dos avisos de la misma reacción a la vez. Se queda la que
  // ganó, que dice lo mismo.
  if (error && error.code !== "23505") throw error;
}

/** La base no conoce esa tabla: falta correr la migración. */
const faltaLaTabla = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST205" ||
  e.code === "42P01" ||
  /Could not find the table|does not exist/i.test(e.message ?? "");

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

/**
 * Guarda un entrante y deja la conversación al día.
 *
 * El cliente se crea solo: el asesor no
 * tiene que copiar nombre ni teléfono, sólo asignar a quién le toca. Para los
 * números equivocados y los proveedores está el botón «No era lead», que
 * borra la ficha creada y archiva.
 */
async function guardarEntrante(supabase: Cliente, m: MensajeEntrante) {
  // Si el número ya es de un cliente conocido, la conversación nace vinculada:
  // el trabajo manual es sólo para los desconocidos de verdad.
  const conversacion = await conversacionDe(supabase, m);
  if (!conversacion) return;

  // El archivo se trae antes de guardar el mensaje, no después: si Meta ya lo
  // borró o el token no alcanza, el mensaje queda guardado diciendo por qué
  // falta, que es lo que después permite entender un comprobante que no está.
  const archivo = m.media ? await guardarArchivo(supabase, conversacion, m) : null;

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    wa_id: m.waId,
    direccion: "entrante",
    tipo: m.tipo,
    texto: m.texto,
    payload: m.crudo,
    creado_en: m.enviadoEn.toISOString(),
    media_ruta: archivo?.ruta ?? null,
    media_mime: archivo?.mime ?? null,
    media_nombre: m.media?.nombre ?? null,
    media_error: archivo?.error ?? null,
  });

  // 23505 es la restricción de unicidad sobre `wa_id`: este mensaje ya estaba
  // guardado y esto es un reintento de Meta. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  // El contador sube en la base, no en memoria: dos mensajes que llegan a la
  // vez se cuentan los dos.
  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: resumen(m.tipo, m.texto).slice(0, 200),
    p_cuando: m.enviadoEn.toISOString(),
  });

  await anotarQueEscribioPorWhatsapp(supabase, conversacion, m);
  await abrirLeadSiEsNuevo(supabase, conversacion);
}

/**
 * Dejar anotado que esta persona escribió por WhatsApp, y cuándo.
 *
 * ------------------------------------------------------------------------
 * PARA QUÉ SIRVE
 * ------------------------------------------------------------------------
 *
 * Una persona llega por Instagram, le contestan, y días después escribe por
 * WhatsApp. Son el mismo lead —y ahora se unifica en vez de duplicarse— pero
 * el asesor necesita saber las dos cosas: por dónde entró primero, que dice
 * qué campaña la trajo, y cuándo escribió por acá, que es lo que decide a
 * quién le contesta ahora.
 *
 * El canal del lead —`oportunidades.canal_id`— no alcanza para eso: es uno
 * solo y sin hora. Esto va a `contactos_canal`, que guarda una fila por canal
 * con la primera y la última vez.
 *
 * Se llama en cada mensaje y no sólo en el primero: la primera fecha no se
 * mueve —la función se encarga— y la última tiene que quedar al día.
 *
 * Como todo lo de acá, no lanza. Que no se pueda anotar el canal no puede
 * costar el mensaje, que es lo que la persona mandó.
 */
async function anotarQueEscribioPorWhatsapp(
  supabase: Cliente,
  conversacionId: number,
  m: MensajeEntrante,
) {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return;

    const canal = await idDeCanalWhatsapp(supabase);
    if (canal == null) return;

    await supabase.rpc("anotar_canal", {
      p_cliente: clienteId,
      p_canal: canal,
      p_identificador: m.telefono || null,
      p_cuando: m.enviadoEn.toISOString(),
    });
  } catch (e) {
    console.error("[whatsapp] no se pudo anotar el canal", e);
  }
}

/**
 * Le pone dueño al hilo, el mismo que tiene el lead.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ HAY QUE COPIARLO
 * ------------------------------------------------------------------------
 *
 * Son dos campos distintos y las dos pantallas leen el suyo:
 * `oportunidades.vendedor_id` dice de quién es el lead y sale en el Pipeline;
 * `conversaciones.vendedor_id` dice de quién es el chat y sale en la bandeja.
 *
 * Sortear sólo el primero dejaba el lead con dueño y el hilo diciendo «sin
 * asignar» —la misma persona, dos respuestas distintas—, y el asesor al que le
 * tocó no tenía cómo saber que era suyo mirando la bandeja, que es donde
 * primero se entera de que alguien escribió.
 *
 * Sólo se pone si el hilo no tenía dueño. Si alguien ya lo reasignó a mano,
 * esa decisión es de una persona y vale más que la del sorteo.
 */
async function ponerDuenoAlHilo(
  supabase: Cliente,
  conversacionId: number,
  vendedorId: number | null,
) {
  if (vendedorId == null) return;
  await supabase
    .from("conversaciones")
    .update({ vendedor_id: vendedorId })
    .eq("id", conversacionId)
    .is("vendedor_id", null);
}

/**
 * Si quien escribe todavía no es un lead, abrirle uno y sortearle asesor.
 *
 * ------------------------------------------------------------------------
 * CUÁNDO SÍ Y CUÁNDO NO
 * ------------------------------------------------------------------------
 *
 * Sólo cuando el cliente no tiene ninguna oportunidad. Las dos reglas de la
 * escuela caen de esa única condición:
 *
 *   Vuelve a escribir           ya tiene una abierta, no se abre otra, y sigue
 *                               siendo de quien lo venía atendiendo.
 *   Ex-alumno que vuelve        tiene las suyas cerradas, tampoco se abre otra.
 *                               Se lo atiende sobre su ficha, donde está lo que
 *                               ya cursó, y si hay venta nueva la abre una
 *                               persona mirando.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LO DECIDE LA BASE Y NO ESTA FUNCIÓN
 * ------------------------------------------------------------------------
 *
 * Antes acá se preguntaba «¿ya tiene lead?» y, si la respuesta era que no, se
 * insertaba. Dos viajes distintos a la base, con un hueco en el medio.
 *
 * Ese hueco es el que duplicaba. Quien escribe manda tres globos seguidos
 * —«Hola», «buenas tardes», «quiero información»—; Meta los entrega en tres
 * llamadas separadas; Netlify levanta una función por llamada y las tres
 * corren a la vez. Las tres preguntan antes de que ninguna haya escrito, las
 * tres reciben «no», y las tres abren un lead. Como cada una sortea por su
 * cuenta, cada lead cae en un asesor distinto: el mismo cliente, el mismo día,
 * dos o tres vendedoras.
 *
 * `abrir_lead_de_whatsapp` hace las dos cosas en una sola llamada y con
 * candado, así que la segunda entra recién cuando la primera terminó y ya
 * encuentra el lead hecho. El sorteo se sigue haciendo acá —es una decisión de
 * la aplicación, no de la base— y se le pasa como propuesta: si el lead ya
 * existía, la base la ignora y devuelve el dueño que ya tenía.
 *
 * ------------------------------------------------------------------------
 * SI ALGO FALLA, EL MENSAJE NO SE PIERDE
 * ------------------------------------------------------------------------
 *
 * Nada de acá lanza. El mensaje ya está guardado y la conversación abierta;
 * que no se haya podido crear el lead es un problema menor que se arregla con
 * un clic desde la bandeja, y tumbar el webhook por eso haría que Meta
 * reintentara y terminara desactivándolo.
 */
async function abrirLeadSiEsNuevo(supabase: Cliente, conversacionId: number) {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return;

    const { data: gente } = await supabase.rpc("vendedores_para_reparto");
    const candidatos = ((gente ?? []) as { id: number; nombre: string }[]).map((v) => ({
      id: Number(v.id),
      nombre: String(v.nombre),
    }));

    // Sin nadie habilitado el lead entra igual, sin dueño. Un lead sin asignar
    // lo ve todo el equipo —así está escrita la política— y alguien lo agarra;
    // un lead que no se creó no lo ve nadie nunca.
    const quien = sortear(candidatos);

    const { data, error } = await supabase.rpc("abrir_lead_de_whatsapp", {
      p_cliente: clienteId,
      p_vendedor: quien?.id ?? null,
      p_canal: await idDeCanalWhatsapp(supabase),
      p_etapa: await idDeEtapaProspectos(supabase),
      p_fecha: hoyEnSalvador(),
    });

    if (error) {
      if (!faltaLaFuncion(error)) {
        console.error("[whatsapp] no se pudo abrir el lead", error.message);
        return;
      }

      /*
       * Sin la migración corrida se abre el lead al modo viejo, con hueco y
       * todo, en vez de no abrirlo.
       *
       * Es a propósito, y es lo que permite desplegar el código sin esperar a
       * que se corra el SQL. La otra opción —no abrir nada hasta que la
       * función exista— cambiaría un problema visible por uno invisible: un
       * lead duplicado se ve en la lista y se fusiona; un lead que nunca se
       * creó no lo ve nadie, y quien escribió se queda sin respuesta.
       */
      console.error(
        "[whatsapp] falta correr 20260930120000_un_solo_lead_por_whatsapp.sql;" +
          " se abre el lead al modo viejo, que puede duplicar",
      );

      const { count } = await supabase
        .from("oportunidades")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId);

      if (yaEsLead(count ?? 0)) {
        const { data: suya } = await supabase
          .from("oportunidades")
          .select("vendedor_id")
          .eq("cliente_id", clienteId)
          .not("vendedor_id", "is", null)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        await ponerDuenoAlHilo(
          supabase,
          conversacionId,
          suya?.vendedor_id == null ? null : Number(suya.vendedor_id),
        );
        return;
      }

      const r = await abrirOportunidad(supabase, clienteId, {
        vendedor_id: quien?.id ?? null,
        producto_id: null,
        territorio_id: null,
        canal_id: await idDeCanalWhatsapp(supabase),
        etapa_id: await idDeEtapaProspectos(supabase),
        estado_id: null,
        fecha_registro: hoyEnSalvador(),
        fecha_cierre: null,
        valor_oportunidad: null,
        descuento_promocion: null,
      });

      if (!r.ok) {
        console.error("[whatsapp] no se pudo abrir el lead", r.error);
        return;
      }

      await ponerDuenoAlHilo(supabase, conversacionId, quien?.id ?? null);
      return;
    }

    const fila = (Array.isArray(data) ? data[0] : data) as {
      id_lead?: number;
      codigo_lead?: string | null;
      id_vendedor?: number | null;
      se_creo?: boolean;
    } | null;

    if (!fila) return;

    /*
     * El hilo queda del mismo asesor que el lead, se haya creado recién o no.
     *
     * Cuando el lead ya existía, el dueño que devuelve la base es el que lo
     * viene atendiendo, no el que salió sorteado: contestarle desde la bandeja
     * tiene que caerle a esa misma persona. Pasa con quien vuelve a escribir
     * después de que alguien archivó su conversación, y con los clientes que
     * ya estaban en la base antes de que existiera todo esto.
     */
    await ponerDuenoAlHilo(
      supabase,
      conversacionId,
      fila.id_vendedor == null ? null : Number(fila.id_vendedor),
    );

    if (fila.se_creo) {
      console.info(
        `[whatsapp] lead ${fila.codigo_lead ?? "?"} abierto para ${
          quien?.nombre ?? "nadie (sin asignar)"
        }`,
      );
    }
  } catch (e) {
    console.error("[whatsapp] no se pudo abrir el lead", e);
  }
}

/** La base no conoce esa función: falta correr la migración. */
const faltaLaFuncion = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST202" || /Could not find the function|does not exist/i.test(e.message ?? "");

/**
 * El canal «Whatsapp» del catálogo.
 *
 * Se busca por nombre en vez de guardar el número: los catálogos se editan
 * desde Programas y Equipos, y un id escrito fijo en el código apuntaría a
 * otra cosa el día que alguien reordene la tabla. Si no está, el lead entra
 * sin canal en vez de no entrar.
 */
async function idDeCanalWhatsapp(supabase: Cliente): Promise<number | null> {
  const { data } = await supabase
    .from("canales")
    .select("id")
    .ilike("nombre", "whatsapp")
    .limit(1)
    .maybeSingle();
  return data ? Number(data.id) : null;
}

/** La primera etapa del embudo. Igual que arriba: por nombre, no por id. */
async function idDeEtapaProspectos(supabase: Cliente): Promise<number | null> {
  const { data } = await supabase
    .from("etapas")
    .select("id")
    .ilike("nombre", "prospectos")
    .limit(1)
    .maybeSingle();
  if (data) return Number(data.id);

  // Sin la etapa Prospectos —si no se corrió esa migración— se usa la primera
  // que haya, que es lo que un asesor esperaría ver.
  const { data: primera } = await supabase
    .from("etapas")
    .select("id")
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle();
  return primera ? Number(primera.id) : null;
}

/** La conversación de este número, creándola si es la primera vez. */
async function conversacionDe(supabase: Cliente, m: MensajeEntrante): Promise<number | null> {
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", m.telefono)
    .maybeSingle();

  if (existente) return Number(existente.id);

  const clienteId = await clienteDe(supabase, m);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      telefono: m.telefono,
      nombre_perfil: m.nombrePerfil,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  // Dos mensajes del mismo número nuevo llegando a la vez: el segundo choca
  // con la restricción de unicidad y se queda con la que ganó.
  if (error?.code === "23505") {
    const { data: ya } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("telefono", m.telefono)
      .maybeSingle();
    return ya ? Number(ya.id) : null;
  }
  if (error) throw error;

  return creada ? Number(creada.id) : null;
}

/**
 * El cliente de esta conversación: el que ya existe, o uno nuevo.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTO TAMBIÉN LO DECIDE LA BASE
 * ------------------------------------------------------------------------
 *
 * Buscar y después insertar tiene el mismo hueco que abrir el lead, y además
 * tenía un error propio: la búsqueda comparaba el texto crudo del teléfono
 * —`like '%77972598'`— contra los últimos ocho dígitos del número de WhatsApp.
 *
 * En la base los teléfonos están escritos de todas las formas: «7797-2598» de
 * lo cargado a mano, «+503 7797 2598» de las planillas, «50377972598» de lo
 * que puso el propio webhook. Contra «7797-2598» esa comparación no encuentra
 * nada, porque el guión cae en el medio de los ocho dígitos. Así que a un
 * cliente cargado a mano que después escribía por WhatsApp se le abría ficha
 * nueva, con lead nuevo y asesor nuevo, al lado de la que ya tenía.
 *
 * `cliente_de_whatsapp` limpia el número antes de comparar —igual que
 * `buscarDuplicados`, que es la regla del resto del CRM— y hace la búsqueda y
 * el alta en una sola llamada con candado.
 */
async function clienteDe(supabase: Cliente, m: MensajeEntrante): Promise<number | null> {
  const { data, error } = await supabase.rpc("cliente_de_whatsapp", {
    p_telefono: m.telefono,
    p_nombre: m.nombrePerfil ?? null,
  });

  if (!error) return data == null ? null : Number(data);

  if (!faltaLaFuncion(error)) {
    // Que falle el alta no debe perder el mensaje: la conversación se guarda
    // igual, sin cliente, y el asesor lo resuelve desde la bandeja.
    console.error("[whatsapp] no se pudo resolver el cliente", error.message);
    return null;
  }

  /*
   * Sin la migración corrida se sigue como antes, con el hueco y todo.
   *
   * Es a propósito: entre perder el mensaje de alguien que está preguntando y
   * arriesgar un duplicado que se puede fusionar después, el duplicado es el
   * mal menor. El aviso queda en el registro para que se note.
   */
  console.error(
    "[whatsapp] falta correr 20260930120000_un_solo_lead_por_whatsapp.sql;" +
      " se busca el cliente al modo viejo",
  );

  if (m.telefono.length >= 8) {
    const { data: ya } = await supabase
      .from("clientes")
      .select("id")
      .like("telefono", `%${m.telefono.slice(-8)}`)
      .limit(1)
      .maybeSingle();
    if (ya) return Number(ya.id);
  }

  const { data: creado, error: errAlta } = await supabase
    .from("clientes")
    .insert({
      // Sin nombre de perfil queda el teléfono, que es mejor que «Sin nombre»:
      // al menos se puede buscar y reconocer.
      nombre: m.nombrePerfil ?? (m.telefono || "Contacto de WhatsApp"),
      telefono: m.telefono || null,
    })
    .select("id")
    .single();

  if (errAlta) {
    console.error("[whatsapp] no se pudo crear el cliente", errAlta);
    return null;
  }
  return Number(creado.id);
}

/**
 * Baja el archivo de un mensaje y lo deja en el bucket.
 *
 * Nunca lanza y nunca demora de más: Meta espera un 200 y, si tarda, reintenta
 * el webhook entero —lo que traería el mismo mensaje otra vez—. Por eso hay un
 * límite de tiempo y por eso un fallo se devuelve como texto en vez de cortar
 * el guardado: el mensaje vale aunque su foto no haya llegado.
 */
async function guardarArchivo(
  supabase: Cliente,
  conversacionId: number,
  m: MensajeEntrante,
): Promise<{ ruta: string | null; mime: string | null; error: string | null }> {
  if (!m.media) return { ruta: null, mime: null, error: null };

  const corte = AbortSignal.timeout(SEGUNDOS_PARA_BAJAR * 1000);
  const bajado = await bajarMedia(m.media.id, corte);

  if (!bajado.ok) {
    console.error("[whatsapp] no se pudo bajar el archivo", m.waId, bajado.error);
    return { ruta: null, mime: m.media.mime, error: bajado.error };
  }

  const ruta = rutaMedia(conversacionId, m.media.id, bajado.archivo.mime);

  const { error } = await supabase.storage
    .from("whatsapp")
    .upload(ruta, bajado.archivo.bytes, {
      contentType: bajado.archivo.mime,
      // Si el webhook se reintenta, el archivo ya está: sobrescribirlo con el
      // mismo contenido es más simple que preguntar antes.
      upsert: true,
    });

  if (error) {
    console.error("[whatsapp] no se pudo guardar el archivo", m.waId, error.message);
    return { ruta: null, mime: bajado.archivo.mime, error: error.message };
  }

  return { ruta, mime: bajado.archivo.mime, error: null };
}

/**
 * Cuánto se espera por un archivo antes de soltarlo.
 *
 * Meta corta el webhook a los 20 segundos y reintenta. Un mensaje puede traer
 * más de un archivo, así que el techo por archivo tiene que dejar lugar para
 * eso y para lo demás que hace la función.
 */
const SEGUNDOS_PARA_BAJAR = 8;
