import "server-only";

import { abrirOportunidad } from "@/lib/crm/altaLead";
import { sortear, yaEsLead } from "@/lib/reparto";
import { hoyEnSalvador } from "@/lib/seguimientos";
import type { getAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que pasa cuando alguien escribe por primera vez, sea por donde sea.
 *
 * ============================================================================
 * POR QUÉ ESTO SALIÓ DEL WEBHOOK DE WHATSAPP
 * ============================================================================
 *
 * Estaba adentro de `api/whatsapp/webhook/route.ts` como funciones privadas, y
 * ahí funcionaba bien mientras hubo un solo canal. Al conectar Instagram había
 * dos caminos: copiarlo, o sacarlo afuera.
 *
 * Copiarlo era menos riesgoso HOY y peor dentro de tres meses. Estas reglas son
 * la política de la escuela —a quién se le asigna un lead nuevo, cuándo se abre
 * uno y cuándo no, qué pasa con un ex-alumno que vuelve— y son las mismas venga
 * el mensaje de donde venga. Con dos copias, el día que se cambie el reparto se
 * va a cambiar una sola, y la escuela va a tener dos políticas distintas según
 * por dónde le escribieron: eso no se ve en ninguna pantalla y se descubre
 * cuando alguien pregunta por qué a un asesor le entran más leads que a otro.
 *
 * Nada de lo de acá cambió de comportamiento al mudarse. Lo único que se agregó
 * es el parámetro `canal`, que antes estaba escrito fijo en «whatsapp».
 *
 * ============================================================================
 * NADA DE ACÁ LANZA HACIA AFUERA
 * ============================================================================
 *
 * Lo llaman los webhooks, y un webhook que devuelve error hace que Meta
 * reintente y, si insiste, desactive la integración: por un lead que no se pudo
 * abrir se perderían todos los mensajes que vinieran después. El mensaje ya
 * está guardado y la conversación abierta cuando esto corre; lo que falle acá
 * se arregla con un clic desde la bandeja, y queda en el registro del servidor.
 */

type Cliente = NonNullable<ReturnType<typeof getAdminClient>>;

/** La base no conoce esa función: falta correr la migración. */
export const faltaLaFuncion = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST202" || /Could not find the function|does not exist/i.test(e.message ?? "");

/** La base no conoce esa tabla: falta correr la migración. */
export const faltaLaTabla = (e: { code?: string; message?: string }): boolean =>
  e.code === "PGRST205" ||
  e.code === "42P01" ||
  /Could not find the table|does not exist/i.test(e.message ?? "");

/** La base no conoce esa columna: falta correr la migración. */
export const faltaLaColumna = (e: { code?: string; message?: string }): boolean =>
  e.code === "42703" ||
  e.code === "PGRST204" ||
  /Could not find the .* column|does not exist/i.test(e.message ?? "");

/**
 * El id de un canal del catálogo, por su nombre.
 *
 * Se busca por nombre en vez de guardar el número: los catálogos se editan
 * desde Programas y Equipos, y un id escrito fijo en el código apuntaría a otra
 * cosa el día que alguien reordene la tabla. Si no está, el lead entra sin
 * canal en vez de no entrar.
 */
export async function idDeCanal(supabase: Cliente, nombre: string): Promise<number | null> {
  const { data } = await supabase
    .from("canales")
    .select("id")
    .ilike("nombre", nombre)
    .limit(1)
    .maybeSingle();
  return data ? Number(data.id) : null;
}

/** La primera etapa del embudo. Igual que arriba: por nombre, no por id. */
export async function idDeEtapaProspectos(supabase: Cliente): Promise<number | null> {
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
 * Sólo se pone si el hilo no tenía dueño. Si alguien ya lo reasignó a mano, esa
 * decisión es de una persona y vale más que la del sorteo.
 */
export async function ponerDuenoAlHilo(
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
 * Deja anotado que esta persona apareció por este canal, y cuándo.
 *
 * ------------------------------------------------------------------------
 * PARA QUÉ SIRVE
 * ------------------------------------------------------------------------
 *
 * Una persona llega por Instagram, le contestan, y días después escribe por
 * WhatsApp. Son el mismo lead —y ahora se unifica en vez de duplicarse— pero el
 * asesor necesita saber las dos cosas: por dónde entró primero, que dice qué
 * campaña la trajo, y cuándo escribió por acá, que es lo que decide a quién le
 * contesta ahora.
 *
 * El canal del lead —`oportunidades.canal_id`— no alcanza para eso: es uno solo
 * y sin hora. Esto va a `contactos_canal`, que guarda una fila por canal con la
 * primera y la última vez.
 *
 * Se llama en cada mensaje y no sólo en el primero: la primera fecha no se
 * mueve —la función se encarga— y la última tiene que quedar al día.
 */
export async function anotarElCanal(
  supabase: Cliente,
  conversacionId: number,
  canal: string,
  identificador: string,
  cuando: Date,
) {
  try {
    const { data: conv } = await supabase
      .from("conversaciones")
      .select("cliente_id")
      .eq("id", conversacionId)
      .maybeSingle();

    const clienteId = conv?.cliente_id == null ? null : Number(conv.cliente_id);
    if (clienteId == null) return;

    const id = await idDeCanal(supabase, canal);
    if (id == null) return;

    await supabase.rpc("anotar_canal", {
      p_cliente: clienteId,
      p_canal: id,
      p_identificador: identificador || null,
      p_cuando: cuando.toISOString(),
    });
  } catch (e) {
    console.error(`[${canal}] no se pudo anotar el canal`, e);
  }
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
 * Y vale entre canales: quien ya es lead por WhatsApp y ahora escribe por
 * Instagram no abre un lead nuevo, porque la condición mira el CLIENTE y no el
 * hilo. Eso sólo funciona si las dos conversaciones apuntan a la misma ficha
 * —por eso importa unificar los duplicados desde Clientes—.
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
 * llamadas separadas; Netlify levanta una función por llamada y las tres corren
 * a la vez. Las tres preguntan antes de que ninguna haya escrito, las tres
 * reciben «no», y las tres abren un lead. Como cada una sortea por su cuenta,
 * cada lead cae en un asesor distinto: el mismo cliente, el mismo día, dos o
 * tres vendedoras.
 *
 * `abrir_lead_de_whatsapp` hace las dos cosas en una sola llamada y con candado,
 * así que la segunda entra recién cuando la primera terminó y ya encuentra el
 * lead hecho. El sorteo se sigue haciendo acá —es una decisión de la aplicación,
 * no de la base— y se le pasa como propuesta: si el lead ya existía, la base la
 * ignora y devuelve el dueño que ya tenía.
 *
 * El nombre de esa función dice «whatsapp» por dónde nació, pero lo que hace no
 * tiene nada de WhatsApp: recibe el canal como parámetro y abre un lead para un
 * cliente que no tiene ninguno. Se reusa tal cual en vez de crear una gemela
 * idéntica, que sería la duplicación que este archivo viene a evitar.
 */
export async function abrirLeadSiEsNuevo(
  supabase: Cliente,
  conversacionId: number,
  canal: string,
) {
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
      p_canal: await idDeCanal(supabase, canal),
      p_etapa: await idDeEtapaProspectos(supabase),
      p_fecha: hoyEnSalvador(),
    });

    if (error) {
      if (!faltaLaFuncion(error)) {
        console.error(`[${canal}] no se pudo abrir el lead`, error.message);
        return;
      }

      /*
       * Sin la migración corrida se abre el lead al modo viejo, con hueco y
       * todo, en vez de no abrirlo.
       *
       * Es a propósito, y es lo que permite desplegar el código sin esperar a
       * que se corra el SQL. La otra opción —no abrir nada hasta que la función
       * exista— cambiaría un problema visible por uno invisible: un lead
       * duplicado se ve en la lista y se fusiona; un lead que nunca se creó no
       * lo ve nadie, y quien escribió se queda sin respuesta.
       */
      console.error(
        `[${canal}] falta correr 20260930120000_un_solo_lead_por_whatsapp.sql;` +
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
        canal_id: await idDeCanal(supabase, canal),
        etapa_id: await idDeEtapaProspectos(supabase),
        estado_id: null,
        fecha_registro: hoyEnSalvador(),
        fecha_cierre: null,
        valor_oportunidad: null,
        descuento_promocion: null,
      });

      if (!r.ok) {
        console.error(`[${canal}] no se pudo abrir el lead`, r.error);
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
     * después de que alguien archivó su conversación, y con los clientes que ya
     * estaban en la base antes de que existiera todo esto.
     */
    await ponerDuenoAlHilo(
      supabase,
      conversacionId,
      fila.id_vendedor == null ? null : Number(fila.id_vendedor),
    );

    if (fila.se_creo) {
      console.info(
        `[${canal}] lead ${fila.codigo_lead ?? "?"} abierto para ${
          quien?.nombre ?? "nadie (sin asignar)"
        }`,
      );
    }
  } catch (e) {
    console.error(`[${canal}] no se pudo abrir el lead`, e);
  }
}
