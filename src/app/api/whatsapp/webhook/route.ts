import { after, NextResponse, type NextRequest } from "next/server";

import {
  abrirLeadSiEsNuevo as abrirLead,
  anotarElCanal as anotarCanal,
  faltaLaColumna,
  faltaLaFuncion,
  faltaLaTabla,
} from "@/lib/crm/leadDeCanal";
import { comoSeLee, type EstadoLlamada } from "@/lib/llamadas";
import { getAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/whatsapp/firma";
import {
  comoTermino,
  leerLlamadas,
  type AvisoDeLlamada,
} from "@/lib/whatsapp/llamadas";
import { bajarMedia, rutaMedia } from "@/lib/whatsapp/media";
import {
  leerWebhook,
  resumen,
  type MensajeEntrante,
  type PermisoDeLlamada,
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

  /*
   * Copia hacia el bot de carnets en n8n.
   *
   * Va después de validar la firma —para no reenviar cualquier cosa que
   * llegue a esta URL pública— pero antes de tocar Supabase: n8n no está en
   * el camino crítico, así que no debe esperar a que termine de guardarse el
   * mensaje ni puede impedirlo. `after` deja que la respuesta a Meta salga
   * ya mismo y hace la copia en segundo plano.
   */
  after(() => copiarAN8n(carga));

  const supabase = getAdminClient();
  if (!supabase) {
    console.error("[whatsapp] falta SUPABASE_SERVICE_ROLE_KEY; el mensaje se pierde");
    return new NextResponse("sin configurar", { status: 500 });
  }

  /*
   * Las llamadas van primero, y no es un detalle de orden.
   *
   * Bajar una foto puede llevarse ocho segundos, y un mensaje puede traer
   * varias. Si una llamada entrante quedara detrás de eso en la misma carga,
   * el teléfono empezaría a sonar cuando ya se gastó medio plazo, o después de
   * que Meta la dio por no contestada. Guardar la fila de una llamada es un
   * insert y nada más: cuesta milisegundos y compra los segundos que la
   * persona necesita para decidir si atiende.
   */
  for (const ll of leerLlamadas(carga)) {
    try {
      await guardarLlamada(supabase, ll);
    } catch (e) {
      console.error("[whatsapp] no se pudo guardar la llamada", ll.callId, e);
    }
  }

  const { mensajes, estados, reacciones, permisos } = leerWebhook(carga);

  /*
   * El permiso va antes que los mensajes, y por la misma razón que las
   * llamadas: es lo que decide si el botón «Llamar» sirve. Detrás de la
   * descarga de una foto podría tardar diez segundos en quedar anotado, y en
   * ese rato alguien del equipo estaría mirando un hilo que dice «hay que
   * pedirle permiso» a alguien que ya lo dio.
   */
  for (const pp of permisos) {
    try {
      await anotarPermiso(supabase, pp);
    } catch (e) {
      console.error("[whatsapp] no se pudo anotar el permiso de llamada", pp.waId, e);
    }
  }

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

      await acusarEnvio(supabase, s.waId, s.estado);
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
 * El cliente contestó si nos deja llamarlo.
 *
 * ----------------------------------------------------------------------------
 * ES LO QUE HACE QUE EL BOTÓN «LLAMAR» SIRVA
 * ----------------------------------------------------------------------------
 *
 * WhatsApp no deja llamarle a nadie que no haya aceptado antes. Sin guardar
 * esto, la única forma de saber si se puede llamar sería llamar: apretar el
 * botón, que el navegador pida el micrófono, esperar, y recibir un error con
 * el cliente del otro lado esperando.
 *
 * Guardado, la bandeja muestra de entrada el botón que va a funcionar.
 *
 * ----------------------------------------------------------------------------
 * SIN FECHA NO HAY PERMISO
 * ----------------------------------------------------------------------------
 *
 * Si Meta acepta pero no manda hasta cuándo vale, no se inventa un plazo. Se
 * guarda que aceptó —para no volver a pedírselo— pero `hasta` queda en nulo,
 * y el CRM sigue ofreciendo pedirlo. Suponer una semana y equivocarse sería
 * mostrar un botón de llamar que falla, que es lo que esto viene a evitar.
 */
async function anotarPermiso(supabase: Cliente, pp: PermisoDeLlamada) {
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", pp.telefono)
    .maybeSingle();

  if (!conv) return;

  const { error } = await supabase
    .from("conversaciones")
    .update({
      llamada_permiso_respuesta: pp.acepto ? "acepto" : "rechazo",
      // Un «no» borra el permiso que hubiera: la última palabra es la que vale.
      llamada_permiso_hasta: pp.acepto ? (pp.vence?.toISOString() ?? null) : null,
    })
    .eq("id", Number(conv.id));

  if (error && faltaLaColumna(error)) {
    console.error(
      "[whatsapp] falta correr 20261018120000_permiso_de_llamada.sql;" +
        " el permiso del cliente no se guarda y el botón de llamar no va a aparecer",
    );
    return;
  }
  if (error) throw error;
}

/**
 * Una llamada: la que entra, la que se contesta, la que se corta.
 *
 * ----------------------------------------------------------------------------
 * ESTO ES LO QUE HACE SONAR EL TELÉFONO
 * ----------------------------------------------------------------------------
 *
 * El webhook corre en el servidor y no tiene forma de hablarle a un navegador.
 * La fila es el puente: se escribe acá, Supabase la publica por websocket, y a
 * las pantallas abiertas les suena.
 *
 * Por eso lo primero que se hace es escribirla, y todo lo demás —el cliente, el
 * lead, la nota en el hilo— va después. Meta da entre 30 y 60 segundos antes de
 * darla por no contestada, y cada consulta que se meta antes del insert se le
 * resta al tiempo que tiene la persona para decidir si atiende.
 *
 * ----------------------------------------------------------------------------
 * NADA DE ACÁ LANZA HACIA AFUERA SIN QUEDAR REGISTRADO
 * ----------------------------------------------------------------------------
 *
 * Como el resto del webhook. Meta reintenta ante un error y termina
 * desactivando la integración entera: por una llamada rara se perderían
 * también los mensajes.
 */
async function guardarLlamada(supabase: Cliente, ll: AvisoDeLlamada) {
  if (ll.evento === "terminate") return cerrarLlamada(supabase, ll);

  /*
   * Una llamada que empezamos nosotros.
   *
   * Lo que llega es la RESPUESTA de Meta a la oferta que mandó el navegador, y
   * la fila ya existe: la escribió `llamarA` con el id que devolvió Meta. Acá
   * sólo se le pega la respuesta, que es lo que el navegador está esperando por
   * websocket para terminar de armar el audio.
   */
  if (!ll.laEmpezoElCliente) {
    await supabase
      .from("llamadas")
      .update({
        sdp_remoto: ll.sdp?.texto ?? null,
        sdp_tipo: ll.sdp?.tipo ?? null,
        estado: "en_curso",
      })
      .eq("call_id", ll.callId)
      .in("estado", ["sonando", "contestando"]);
    return;
  }

  // Entrante. El hilo primero, porque la fila cuelga de él y sin eso la
  // llamada no se podría atribuir a nadie.
  const conversacion = await conversacionDe(supabase, ll);
  const suyo = await deQuienEsElHilo(supabase, conversacion);

  const { error } = await supabase.from("llamadas").insert({
    call_id: ll.callId,
    conversacion_id: conversacion,
    telefono: ll.telefono,
    /*
     * El dueño y el nombre se copian en la fila y no se dejan para que los
     * busque el navegador.
     *
     * `conversaciones` no se ve entera: una asesora no ve los hilos de otra.
     * En la pantalla de quien no puede ver el hilo, la llamada aparecería sin
     * dueño —o sea, «de todos»— y le saltaría el pop-up encima a todo el
     * equipo, que es exactamente lo que la escuela pidió evitar.
     */
    vendedor_id: suyo.vendedorId,
    nombre: suyo.nombre ?? ll.nombrePerfil,
    direccion: "entrante",
    estado: "sonando",
    sdp_remoto: ll.sdp?.texto ?? null,
    sdp_tipo: ll.sdp?.tipo ?? null,
    creado_en: ll.cuando.toISOString(),
  });

  if (error) {
    if (faltaLaTabla(error)) {
      console.error(
        "[whatsapp] falta correr 20261017120000_llamadas.sql;" +
          " la llamada entrante no va a sonar en el CRM",
      );
      return;
    }
    // 23505: la misma llamada dos veces, que es un reintento de Meta. Ya está
    // sonando; volver a insertarla haría sonar dos veces la misma.
    if (error.code !== "23505") throw error;
    return;
  }

  if (conversacion == null) return;

  /*
   * Y recién ahora, con el teléfono ya sonando, lo demás.
   *
   * Alguien que llama sin haber escrito nunca es un lead igual —de hecho es de
   * los más calientes que hay—, así que se le abre uno y se le sortea asesora
   * con las mismas reglas que si hubiera escrito. Si algo de esto falla, la
   * llamada suena lo mismo, que es lo que importa en este segundo.
   */
  await anotarCanal(supabase, conversacion, "whatsapp", ll.telefono, ll.cuando);
  await abrirLead(supabase, conversacion, "whatsapp");
}

/**
 * La llamada terminó.
 *
 * ----------------------------------------------------------------------------
 * PERDIDA Y RECHAZADA NO SON LO MISMO
 * ----------------------------------------------------------------------------
 *
 * Para Meta las dos son «no hubo audio». Para quien abre la bandeja al otro
 * día no: una perdida es trabajo pendiente —hay que devolverla— y una
 * rechazada ya la decidió alguien. La diferencia la sabe el CRM, porque tiene
 * anotado si alguien llegó a agarrarla, y por eso hay que leer la fila antes
 * de cerrarla.
 *
 * El cierre va sólo hacia adelante. Meta manda los avisos desordenados, y sin
 * eso una llamada ya cerrada volvería a «sonando» y el teléfono sonaría de
 * nuevo en todas las pantallas por algo que terminó hace rato.
 */
async function cerrarLlamada(supabase: Cliente, ll: AvisoDeLlamada) {
  const { data: fila, error: errLectura } = await supabase
    .from("llamadas")
    .select("id, conversacion_id, direccion, estado, atendida_por")
    .eq("call_id", ll.callId)
    .maybeSingle();

  if (errLectura && faltaLaTabla(errLectura)) {
    console.error("[whatsapp] falta correr 20261017120000_llamadas.sql");
    return;
  }
  // Una llamada que nunca llegó a entrar —el `connect` se perdió, o es de
  // antes de que existiera todo esto—. No hay fila que cerrar.
  if (!fila) return;

  // Rechazada es una decisión nuestra y ya quedó anotada al apretar el botón:
  // no la pisa el aviso de Meta, que sólo sabe que no hubo audio.
  const estado =
    fila.estado === "rechazada"
      ? "rechazada"
      : comoTermino(ll.cierre?.resultado ?? null, fila.atendida_por != null);

  await supabase
    .from("llamadas")
    .update({
      estado,
      termino_en: ll.cuando.toISOString(),
      duracion_seg: ll.cierre?.duracionSeg ?? null,
      motivo: ll.cierre?.motivo ?? null,
    })
    .eq("call_id", ll.callId)
    .in("estado", ["sonando", "contestando", "en_curso", "rechazada"]);

  await dejarlaEnElHilo(supabase, ll, fila, estado);
}

/**
 * Deja la llamada anotada en el hilo, como una burbuja más.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ NO ALCANZA CON LA TABLA DE LLAMADAS
 * ----------------------------------------------------------------------------
 *
 * Porque nadie abre una tabla de llamadas. La bandeja es donde el equipo mira,
 * y una llamada perdida que sólo existiera en otro lado es una llamada que
 * nadie devuelve. Puesta en el hilo aparece donde corresponde —entre el último
 * mensaje y el siguiente— y una perdida sube el contador de sin leer, que es
 * lo que la pone arriba de la lista al otro día.
 *
 * Sólo las perdidas suben el contador. Una que se atendió no es nada
 * pendiente: se habló, y marcarla como no leída mandaría a alguien a un hilo
 * donde no hay nada que hacer.
 */
async function dejarlaEnElHilo(
  supabase: Cliente,
  ll: AvisoDeLlamada,
  fila: { conversacion_id: number | null; direccion: string },
  estado: EstadoLlamada,
) {
  const conversacion = fila.conversacion_id;
  if (conversacion == null) return;

  const entrante = fila.direccion === "entrante";
  const texto = comoSeLee({ estado, direccion: entrante ? "entrante" : "saliente" }, ll.cierre?.duracionSeg ?? null);

  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacion,
    // El id de la llamada sirve de id de mensaje: es único, y hace que un
    // reintento de Meta no deje dos burbujas iguales.
    wa_id: `call:${ll.callId}`,
    direccion: entrante ? "entrante" : "saliente",
    tipo: "llamada",
    texto,
    payload: ll.crudo,
    creado_en: ll.cuando.toISOString(),
  });

  if (error && error.code !== "23505") {
    console.error("[whatsapp] no se pudo anotar la llamada en el hilo", ll.callId, error.message);
    return;
  }
  if (error) return;

  // Sólo lo que quedó pendiente sube el contador. Ver el comentario de arriba.
  if (estado !== "perdida") return;

  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: texto.slice(0, 200),
    p_cuando: ll.cuando.toISOString(),
  });
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

  const fila = {
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
  };

  /*
   * `origen` va aparte por la ventana entre el despliegue y la migración.
   *
   * Netlify publica solo y el SQL se corre a mano, así que hay un rato en el
   * que este código ya manda la columna y la base todavía no la tiene. Mandarla
   * ahí devuelve PGRST204 y se pierde el mensaje entero —el mensaje de un
   * cliente, por una columna de marketing—.
   *
   * Se intenta con ella y, si la base no la conoce, se reintenta sin ella. El
   * dato no se pierde igual: sigue entero en `payload`, y la migración lo
   * rescata de ahí.
   */
  let { error } = m.origen
    ? await supabase.from("mensajes").insert({ ...fila, origen: m.origen })
    : await supabase.from("mensajes").insert(fila);

  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    ({ error } = await supabase.from("mensajes").insert(fila));
  }

  // 23505 es la restricción de unicidad sobre `wa_id`: este mensaje ya estaba
  // guardado y esto es un reintento de Meta. No es un error.
  if (error && error.code !== "23505") throw error;
  if (error) return;

  /*
   * Y el hilo se queda con el PRIMER origen, no con el último.
   *
   * Alguien que vino por la pauta de Pastelería en marzo y en agosto toca una
   * de Barismo no cambia de origen: el mérito de haberlo traído es de la
   * primera. Si se pisara, los números de una campaña vieja se moverían solos
   * meses después y ningún reporte se podría leer.
   *
   * Por eso el `is` null: sólo escribe cuando todavía no hay ninguno.
   */
  if (m.origen) {
    await supabase
      .from("conversaciones")
      .update({ origen: m.origen })
      .eq("id", conversacion)
      .is("origen", null);
  }

  // El contador sube en la base, no en memoria: dos mensajes que llegan a la
  // vez se cuentan los dos.
  await supabase.rpc("marcar_mensaje_entrante", {
    p_conversacion: conversacion,
    p_texto: resumen(m.tipo, m.texto).slice(0, 200),
    p_cuando: m.enviadoEn.toISOString(),
  });

  await anotarQueEscribioPorWhatsapp(supabase, conversacion, m);
  await contestoUnEnvio(supabase, m.telefono);
  await abrirLead(supabase, conversacion, "whatsapp");
}

/**
 * Si esta persona recibió un envío masivo hace poco, queda anotado que
 * contestó.
 *
 * ------------------------------------------------------------------------
 * ES LA MÉTRICA QUE PIDIÓ LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Necesito un total análisis y métricas de quiénes contestaron a ese mensaje
 * masivo.» Entregado y leído los informa Meta; contestado, no: es un mensaje
 * entrante cualquiera, y sólo se sabe que es una respuesta porque llega
 * después de haberle mandado algo.
 *
 * Siete días es el corte. Más allá de eso, alguien que escribe no está
 * contestando la campaña: está escribiendo por otra cosa, y contarlo como
 * respuesta inflaría el resultado de todos los envíos viejos.
 *
 * Se marca sólo el más reciente y sólo una vez —`respondio_en is null`— para
 * que el segundo mensaje de la misma persona no cuente como una respuesta más.
 *
 * Como todo lo del webhook, no lanza hacia afuera: que no se pueda anotar una
 * métrica no puede costar el mensaje, que es lo que la persona escribió.
 */
async function contestoUnEnvio(supabase: Cliente, telefono: string) {
  try {
    const hace7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const { data: fila } = await supabase
      .from("envio_destinatarios")
      .select("id")
      // El teléfono se guardó normalizado al armar el envío, en el mismo
      // formato en que lo manda Meta: sólo dígitos y con código de país.
      .eq("telefono", telefono)
      .is("respondio_en", null)
      .gt("enviado_en", hace7)
      .order("enviado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fila) return;

    await supabase
      .from("envio_destinatarios")
      .update({ estado: "respondio", respondio_en: new Date().toISOString() })
      .eq("id", Number(fila.id));
  } catch {
    // Ver arriba.
  }
}

/**
 * El acuse de Meta sobre un mensaje de un envío.
 *
 * Sólo hacia adelante: entregado no puede volver a enviado, y leído no puede
 * volver a entregado. Meta a veces manda los acuses desordenados —el de
 * lectura antes que el de entrega— y sin esta condición un envío terminaría
 * mostrando menos leídos de los que hubo.
 *
 * «Respondió» no se toca nunca desde acá: es lo más avanzado que puede estar
 * un destinatario y lo pone el mensaje entrante, no un acuse.
 */
async function acusarEnvio(supabase: Cliente, waId: string, estado: string) {
  const COMO_SE_DICE: Record<string, string> = {
    sent: "enviado",
    delivered: "entregado",
    read: "leido",
    failed: "fallido",
  };
  const nuevo = COMO_SE_DICE[estado];
  if (!nuevo) return;

  // Desde qué estados se puede pasar a éste. Fuera de esta lista, se ignora.
  const desde: Record<string, string[]> = {
    enviado: ["pendiente"],
    entregado: ["pendiente", "enviado"],
    leido: ["pendiente", "enviado", "entregado"],
    fallido: ["pendiente", "enviado"],
  };

  await supabase
    .from("envio_destinatarios")
    .update({ estado: nuevo })
    .eq("wa_id", waId)
    .in("estado", desde[nuevo]);
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
const anotarQueEscribioPorWhatsapp = (
  supabase: Cliente,
  conversacionId: number,
  m: MensajeEntrante,
) => anotarCanal(supabase, conversacionId, "whatsapp", m.telefono, m.enviadoEn);

/**
 * De quién es un hilo y cómo se llama su gente.
 *
 * Dos datos que ya están en la base pero que hay que COPIAR en la llamada. El
 * porqué está arriba, donde se usan: la tabla de conversaciones no se ve
 * entera, y una llamada tiene que sonar bien en la pantalla de todo el equipo.
 *
 * El nombre del CRM le gana al del WhatsApp cuando existe: en la ficha dice
 * «María José Retana» y su WhatsApp dice «Majo», y quien atiende un teléfono
 * necesita el nombre por el que va a buscar la ficha.
 */
async function deQuienEsElHilo(
  supabase: Cliente,
  conversacionId: number | null,
): Promise<{ vendedorId: number | null; nombre: string | null }> {
  if (conversacionId == null) return { vendedorId: null, nombre: null };

  const { data: conv } = await supabase
    .from("conversaciones")
    .select("vendedor_id, cliente_id, nombre_perfil")
    .eq("id", conversacionId)
    .maybeSingle();

  if (!conv) return { vendedorId: null, nombre: null };

  let nombre = conv.nombre_perfil == null ? null : String(conv.nombre_perfil);

  if (conv.cliente_id != null) {
    const { data: cli } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id", Number(conv.cliente_id))
      .maybeSingle();
    if (cli?.nombre) nombre = String(cli.nombre);
  }

  return {
    vendedorId: conv.vendedor_id == null ? null : Number(conv.vendedor_id),
    nombre,
  };
}

/**
 * Lo mínimo para saber de quién es un hilo.
 *
 * Un mensaje trae mucho más que esto, pero el hilo se resuelve sólo con el
 * número y el nombre de perfil, y una llamada trae exactamente esos dos. Pedir
 * un `MensajeEntrante` obligaría a fabricar un mensaje falso para poder atender
 * una llamada de alguien que nunca escribió.
 */
interface QuienEs {
  telefono: string;
  nombrePerfil: string | null;
}

/**
 * La conversación de este número, creándola si es la primera vez.
 *
 * ----------------------------------------------------------------------------
 * EL HILO SE BUSCA POR CANAL, NO SÓLO POR NÚMERO
 * ----------------------------------------------------------------------------
 *
 * Desde `20261024120000_instagram.sql`, la identidad de una conversación es
 * `(canal, identificador)` y no el teléfono suelto: un hilo de Instagram no
 * tiene número, y la misma persona puede tener el suyo en cada canal.
 *
 * Buscar sólo por `telefono` seguiría andando hoy —las conversaciones de
 * Instagram tienen ese campo nulo, así que nunca coincidirían—, pero acá se
 * pide el canal igual. Es lo que evita que el día que otro canal empiece a
 * guardar un número, WhatsApp conteste en el hilo equivocado.
 *
 * `identificador` se escribe siempre, y en WhatsApp es el teléfono: la columna
 * es obligatoria y sin esto ningún hilo nuevo entraría.
 */
async function conversacionDe(supabase: Cliente, m: QuienEs): Promise<number | null> {
  const buscar = async () => {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("canal", "whatsapp")
      .eq("identificador", m.telefono)
      .maybeSingle();
    return data ? Number(data.id) : null;
  };

  const existente = await buscar();
  if (existente != null) return existente;

  const clienteId = await clienteDe(supabase, m);

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({
      canal: "whatsapp",
      identificador: m.telefono,
      telefono: m.telefono,
      nombre_perfil: m.nombrePerfil,
      cliente_id: clienteId,
    })
    .select("id")
    .single();

  // Dos mensajes del mismo número nuevo llegando a la vez: el segundo choca
  // con la restricción de unicidad y se queda con la que ganó.
  if (error?.code === "23505") return buscar();

  /*
   * Sin la migración corrida, `identificador` no existe y el insert se cae.
   *
   * Se reintenta al modo viejo en lugar de perder el mensaje: es la misma
   * decisión que en el resto del webhook —un dato de menos se arregla, un
   * mensaje perdido no se recupera— y permite desplegar el código sin tener que
   * esperar a que se corra el SQL.
   */
  if (error && faltaLaColumna(error)) {
    console.error(
      "[whatsapp] falta correr 20261024120000_instagram.sql;" +
        " el hilo se abre sin identificador",
    );

    const { data: vieja, error: errViejo } = await supabase
      .from("conversaciones")
      .insert({
        telefono: m.telefono,
        nombre_perfil: m.nombrePerfil,
        cliente_id: clienteId,
      })
      .select("id")
      .single();

    if (errViejo?.code === "23505") {
      const { data: ya } = await supabase
        .from("conversaciones")
        .select("id")
        .eq("telefono", m.telefono)
        .maybeSingle();
      return ya ? Number(ya.id) : null;
    }
    if (errViejo) throw errViejo;
    return vieja ? Number(vieja.id) : null;
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
async function clienteDe(supabase: Cliente, m: QuienEs): Promise<number | null> {
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

/**
 * Copia el payload de Meta, tal cual llegó, hacia el bot de carnets en n8n.
 *
 * ----------------------------------------------------------------------------
 * n8n NO ESTÁ EN EL CAMINO CRÍTICO
 * ----------------------------------------------------------------------------
 *
 * Esta función es lo único que conecta este webhook con el bot de carnets.
 * Si n8n está caído, lento o en edición, el CRM tiene que seguir funcionando
 * exactamente igual: por eso nunca lanza, por eso tiene un timeout corto, y
 * por eso se llama con `after` en vez de con `await` en la ruta principal —
 * la respuesta a Meta no espera a que esto termine.
 *
 * Se manda el payload crudo, sin volver a tocarlo, para que el parser del
 * workflow de n8n sea el mismo que si Meta le hablara directo.
 *
 * `N8N_WEBHOOK_URL` y `N8N_SECRETO` son opcionales a propósito: sin ellos,
 * el CRM sigue guardando los mensajes de WhatsApp como siempre, sólo que sin
 * generar carnets.
 */
async function copiarAN8n(payloadDeMeta: unknown) {
  const url = process.env.N8N_WEBHOOK_URL;
  const secreto = process.env.N8N_SECRETO;
  if (!url || !secreto) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lac-token": secreto,
      },
      body: JSON.stringify(payloadDeMeta),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error("[n8n] no se pudo copiar el mensaje:", err instanceof Error ? err.message : err);
  }
}
