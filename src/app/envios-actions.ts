"use server";

import { revalidatePath } from "next/cache";

import { getServerClient, getUser } from "@/lib/supabase/server";
import { enviarPlantilla, esDeLaCuenta, hayWhatsapp } from "@/lib/whatsapp/enviar";
import { conValores } from "@/lib/whatsapp/huecos";
import {
  componentesPara,
  loQueFalta,
  quePide,
  repartirValores,
} from "@/lib/whatsapp/piezas";
import {
  paraMeta,
  repartir,
  valoresPara,
  type Candidato,
  type Descarte,
  type Valor,
} from "@/lib/envios";
import type { ActionResult } from "@/app/actions";

/**
 * Envíos masivos por WhatsApp.
 *
 * ============================================================================
 * POR QUÉ ESTO NO ES «UNA LISTA Y UN BOTÓN»
 * ============================================================================
 *
 * Porque un envío masivo mal hecho no falla: funciona, y a las dos semanas el
 * número de la escuela deja de poder mandar nada. Meta le pone a cada número
 * una calificación de calidad que baja cuando la gente bloquea o reporta, y lo
 * que más hace que alguien bloquee es recibir dos veces el mismo mensaje.
 *
 * De ahí salen las cuatro decisiones que explican todo el archivo:
 *
 *   SE MANDA DE A TANDAS       La pantalla llama una vez por tanda, igual que
 *                              la importación. Una función de Netlify tiene
 *                              diez segundos; trescientos mensajes no entran.
 *                              Y así un corte a la mitad no pierde nada: los
 *                              que faltan siguen en «pendiente».
 *
 *   CADA UNO TIENE SU FILA     Se marca uno por uno al mandarlo. Reanudar es
 *                              seguir por los pendientes, y nadie recibe dos
 *                              veces.
 *
 *   SÓLO PLANTILLAS APROBADAS  Es lo único que WhatsApp deja mandarle a
 *                              alguien que no escribió en las últimas 24
 *                              horas. Un envío masivo por definición le llega
 *                              a gente fuera de esa ventana.
 *
 *   EL «NO MOLESTAR» MANDA     Se comprueba acá y no sólo en la pantalla: la
 *                              lista de destinatarios se arma en el servidor,
 *                              a partir de los ids que llegan, y quien pidió
 *                              que no le escriban queda afuera aunque venga
 *                              seleccionado.
 */

const SIN_SESION: ActionResult = {
  ok: false,
  error: "Sesión no válida. Volvé a iniciar sesión.",
};

/** La tabla todavía no existe: falta correr la migración. */
const faltaLaTabla = (e: { code?: string; message?: string } | null): boolean =>
  e != null &&
  (e.code === "PGRST205" ||
    e.code === "42P01" ||
    e.code === "PGRST202" ||
    /Could not find the (table|function)|does not exist/i.test(e.message ?? ""));

const FALTA_MIGRACION =
  "Falta correr supabase/migrations/20261014120000_envios_masivos.sql en Supabase → SQL Editor.";

// ---------------------------------------------------------------- preparar

export interface Preparado extends ActionResult {
  envioId: number | null;
  /** Cuántos van a recibir el mensaje. */
  van: number;
  /** Cuántos quedaron afuera, por razón. */
  fuera: { porque: Descarte; cuantos: number; ejemplos: string[] }[];
  /** Cuántos destinatarios únicos salieron en las últimas 24 horas. */
  mandadosHoy: number;
}

const NADA: Preparado = {
  ok: true,
  error: null,
  envioId: null,
  van: 0,
  fuera: [],
  mandadosHoy: 0,
};

/**
 * Arma el envío con la gente seleccionada, sin mandar nada.
 *
 * Devuelve el reparto para que la pantalla pueda decir a quién se le va a
 * escribir y a quién no antes de que alguien apriete. Un «¿seguro?» sin ese
 * detalle no es una confirmación: mandarle a trescientas personas no se puede
 * deshacer, y la mitad de las veces lo que hay que revisar es justamente
 * quién quedó afuera.
 */
export async function prepararEnvio(
  /** Los leads seleccionados en la pantalla. */
  oportunidadIds: number[],
  nombre: string,
): Promise<Preparado> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...NADA, ...SIN_SESION };

  if (oportunidadIds.length === 0) {
    return { ...NADA, ok: false, error: "No hay nadie seleccionado." };
  }

  const { data: filas, error } = await supabase
    .from("oportunidades")
    .select("id, cliente_id, clientes(id, nombre, telefono, no_molestar)")
    .in("id", oportunidadIds);

  if (error) {
    if (/no_molestar/.test(error.message ?? "")) {
      return { ...NADA, ok: false, error: FALTA_MIGRACION };
    }
    return { ...NADA, ok: false, error: error.message };
  }

  const candidatos: Candidato[] = ((filas ?? []) as unknown as Record<string, unknown>[]).map(
    (f) => {
      // PostgREST devuelve la relación como objeto o como arreglo de uno.
      const anidado = f.clientes;
      const c = (Array.isArray(anidado) ? anidado[0] : anidado) as
        | Record<string, unknown>
        | null;
      return {
        clienteId: Number(f.cliente_id),
        oportunidadId: Number(f.id),
        nombre: c?.nombre == null ? null : String(c.nombre),
        telefono: c?.telefono == null ? null : String(c.telefono),
        noMolestar: Boolean(c?.no_molestar),
      };
    },
  );

  // A quiénes les mandamos algo en los últimos siete días. Repetirle a la
  // misma persona es lo que más hace que alguien bloquee el número.
  const recientes = new Set<number>();
  {
    const { data } = await supabase.rpc("ya_le_mandamos", {
      p_clientes: [...new Set(candidatos.map((c) => c.clienteId))],
      p_dias: 7,
    });
    for (const r of (data ?? []) as { cliente_id: number }[]) {
      recientes.add(Number(r.cliente_id));
    }
  }

  const reparto = repartir(candidatos, recientes);

  if (reparto.van.length === 0) {
    return {
      ...NADA,
      ok: false,
      error: "No queda nadie a quien mandarle: revisá el detalle de abajo.",
      fuera: agrupar(reparto.fuera),
    };
  }

  const { data: envio, error: errEnvio } = await supabase
    .from("envios")
    .insert({ nombre: nombre.trim() || "Envío sin nombre", creado_por: user.id })
    .select("id")
    .single();

  if (errEnvio) {
    return { ...NADA, ok: false, error: faltaLaTabla(errEnvio) ? FALTA_MIGRACION : errEnvio.message };
  }

  const envioId = Number(envio.id);

  const { error: errDest } = await supabase.from("envio_destinatarios").insert(
    reparto.van.map((c) => ({
      envio_id: envioId,
      cliente_id: c.clienteId,
      oportunidad_id: c.oportunidadId,
      /*
       * Ya normalizado, que es a dónde se va a mandar de verdad.
       *
       * En la ficha el teléfono está escrito de cualquier forma —«7797-2598»,
       * «+503 7797 2598»— y Meta acepta una sola. Guardar acá la versión que
       * sale sirve además para lo que viene después: cuando esa persona
       * conteste, el webhook trae el número en este mismo formato y puede
       * cruzarlo sin volver a normalizar nada.
       */
      telefono: paraMeta(c.telefono ?? ""),
      nombre: c.nombre,
    })),
  );

  if (errDest) {
    // El envío sin destinatarios no sirve para nada y quedaría en la lista
    // confundiendo. Se deshace.
    await supabase.from("envios").delete().eq("id", envioId);
    return { ...NADA, ok: false, error: errDest.message };
  }

  const { data: hoy } = await supabase.rpc("enviados_hoy");

  revalidatePath("/");
  return {
    ok: true,
    error: null,
    envioId,
    van: reparto.van.length,
    fuera: agrupar(reparto.fuera),
    mandadosHoy: Number(hoy ?? 0),
  };
}

/** Junta los descartes por razón, con algunos nombres para poder revisarlos. */
function agrupar(
  fuera: { candidato: Candidato; porque: Descarte }[],
): { porque: Descarte; cuantos: number; ejemplos: string[] }[] {
  const m = new Map<Descarte, Candidato[]>();
  for (const f of fuera) {
    const lista = m.get(f.porque) ?? [];
    lista.push(f.candidato);
    m.set(f.porque, lista);
  }
  return [...m.entries()].map(([porque, gente]) => ({
    porque,
    cuantos: gente.length,
    // Tres alcanzan para reconocer si el descarte tiene sentido. La lista
    // entera sería una pantalla de nombres que nadie lee.
    ejemplos: gente.slice(0, 3).map((c) => c.nombre ?? c.telefono ?? "sin nombre"),
  }));
}

// ------------------------------------------------------------------ mandar

export interface Tanda extends ActionResult {
  /** Cuántos salieron en esta tanda. */
  enviados: number;
  fallidos: number;
  /** Cuántos quedan pendientes después de ésta. */
  faltan: number;
}

const SIN_TANDA: Tanda = { ok: true, error: null, enviados: 0, fallidos: 0, faltan: 0 };

/**
 * Cuántos van por llamada.
 *
 * La función tiene diez segundos para contestar y cada mensaje tarda unos
 * cientos de milisegundos, así que veinte entran con margen de sobra. Más
 * grande no gana nada: la pantalla llama otra vez enseguida, y una tanda que
 * se pasa del tiempo pierde el trabajo de todos los mensajes que ya salieron.
 */
const POR_TANDA = 20;

/**
 * Manda la siguiente tanda de un envío.
 *
 * ============================================================================
 * PRIMERO META, DESPUÉS LA BASE — Y UNO POR UNO
 * ============================================================================
 *
 * Cada destinatario se marca en el momento en que Meta lo acepta, no al final
 * de la tanda. Marcarlos todos juntos al terminar sería más rápido y estaría
 * mal: si la función se corta a la mitad, los diez que ya salieron quedarían
 * como pendientes y la siguiente tanda se los mandaría de nuevo.
 *
 * ============================================================================
 * UN FALLO NO CORTA LA TANDA
 * ============================================================================
 *
 * Un número que no tiene WhatsApp falla y no dice nada del resto. Se anota el
 * motivo en su fila y se sigue. Lo que sí corta es quedarse sin token, que
 * haría fallar a los trescientos.
 */
export async function mandarTanda(
  envioId: number,
  plantillaId: string,
  valores: Valor[],
): Promise<Tanda> {
  const supabase = await getServerClient();
  const user = await getUser();
  if (!supabase || !user) return { ...SIN_TANDA, ...SIN_SESION };

  if (!hayWhatsapp()) {
    return { ...SIN_TANDA, ok: false, error: "WhatsApp no está configurado en el servidor." };
  }

  const { data: plantilla, error: errPlantilla } = await supabase
    .from("plantillas")
    .select("id, nombre, idioma, estado, cuerpo, payload")
    .eq("id", plantillaId)
    .maybeSingle();

  if (errPlantilla) return { ...SIN_TANDA, ok: false, error: errPlantilla.message };
  if (!plantilla) return { ...SIN_TANDA, ok: false, error: "No se encontró la plantilla." };

  if (String(plantilla.estado).toUpperCase() !== "APPROVED") {
    return {
      ...SIN_TANDA,
      ok: false,
      error: "Esa plantilla no está aprobada por Meta, así que no se puede mandar.",
    };
  }

  const cuerpo = plantilla.cuerpo == null ? null : String(plantilla.cuerpo);

  /*
   * Todo lo que esta plantilla exige, y no sólo su texto.
   *
   * ==========================================================================
   * ESTO ES LO QUE TUMBÓ LA CAMPAÑA DE LA ESCUELA
   * ==========================================================================
   *
   * Cinco mensajes, cinco rechazados, todos con el mismo error de Meta:
   * «(#131008) Required parameter is missing». No era la cuenta ni eran los
   * números: el CRM armaba sólo el cuerpo, y esa plantilla lleva además una
   * pieza —un encabezado, un botón con parte variable— que Meta exige en cada
   * envío. Falta una y rechaza el mensaje entero.
   *
   * Se comprueba ACÁ, antes de la primera petición. Intentarlo sería mandarle
   * a Meta trescientas peticiones que van a fallar todas, y muchos errores
   * seguidos le bajan la calificación al número de la escuela.
   */
  const pide = quePide(plantilla.payload, cuerpo);

  /*
   * La pantalla manda una lista plana; acá se reparte entre las piezas.
   *
   * El orden es el que espera Meta —encabezado, cuerpo, botones— y lo fija
   * `pedidosDe`, que es lo que la pantalla usó para armar las casillas. Los dos
   * viven en el mismo archivo justamente para que no se separen: si uno cambia
   * sin el otro, los datos van a la pieza equivocada —el nombre del cliente en
   * el botón, la fecha en el texto— y nada falla, sólo sale mal.
   *
   * Se comprueba con los valores DE VERDAD, no con blancos.
   *
   * Era con blancos —sólo se miraba la cantidad— y eso hacía saltar la
   * comprobación del botón de catálogo, que además de contar mira que el código
   * del producto no esté vacío. El envío se frenaba diciendo que faltaba un
   * dato que sí estaba puesto.
   *
   * Lo único que cambia por destinatario es el cuerpo, donde va el nombre de
   * cada quien; el encabezado y los botones son iguales para todos. Así que
   * para comprobar alcanza con resolver el nombre a cualquiera —acá, uno de
   * ejemplo— y lo que se manda de verdad se arma abajo, uno por uno.
   */
  const falta = loQueFalta(pide, repartirValores(pide, valoresPara(valores, "Ejemplo")));
  if (falta) return { ...SIN_TANDA, ok: false, error: falta };

  // Se deja constancia de con qué se mandó, en el propio envío: la plantilla
  // se puede borrar o cambiar en Meta y el historial no puede quedar diciendo
  // «plantilla 47».
  await supabase
    .from("envios")
    .update({
      plantilla_id: plantilla.id,
      plantilla_nombre: plantilla.nombre,
      idioma: plantilla.idioma,
      cuerpo,
      valores,
      estado: "enviando",
      empezado_en: new Date().toISOString(),
    })
    .eq("id", envioId)
    .is("empezado_en", null);

  const { data: pendientes, error: errPend } = await supabase
    .from("envio_destinatarios")
    .select("id, telefono, nombre, cliente_id")
    .eq("envio_id", envioId)
    .eq("estado", "pendiente")
    .order("id")
    .limit(POR_TANDA);

  if (errPend) {
    return { ...SIN_TANDA, ok: false, error: faltaLaTabla(errPend) ? FALTA_MIGRACION : errPend.message };
  }

  let enviados = 0;
  let fallidos = 0;

  for (const d of (pendientes ?? []) as unknown as Record<string, unknown>[]) {
    const nombre = d.nombre == null ? null : String(d.nombre);
    const suyos = valoresPara(valores, nombre);

    const envio = await enviarPlantilla(
      // Ya viene normalizado de cuando se armó el envío.
      String(d.telefono),
      String(plantilla.nombre),
      String(plantilla.idioma ?? "es"),
      // Los valores de cada quien: el cuerpo lleva su nombre, el resto de las
      // piezas es igual para todos.
      componentesPara(pide, repartirValores(pide, suyos)),
    );

    if (envio.ok) {
      enviados++;
      await supabase
        .from("envio_destinatarios")
        .update({
          estado: "enviado",
          wa_id: envio.waId,
          enviado_en: new Date().toISOString(),
          motivo: null,
        })
        .eq("id", Number(d.id));

      // Y queda en el hilo de esa persona, si tiene uno abierto: el envío
      // masivo no puede ser invisible desde la conversación, porque quien
      // conteste va a estar contestando algo que la asesora no vio salir.
      await dejarEnElHilo(
        supabase,
        String(d.telefono),
        // Sólo los valores del CUERPO: es el único texto que se ve en el hilo.
        // Con la lista plana, un encabezado con hueco correría todo un lugar y
        // la copia diría cualquier cosa.
        conValores(cuerpo, repartirValores(pide, suyos).cuerpo),
        envio.waId,
        user.id,
        d.cliente_id == null ? null : Number(d.cliente_id),
      );
    } else {
      /*
       * Un problema de la cuenta corta el envío entero, y no marca a nadie.
       *
       * ----------------------------------------------------------------------
       * ESTO ES LO QUE FALLÓ EN LA PRUEBA DE LA ESCUELA
       * ----------------------------------------------------------------------
       *
       * Cinco mensajes, cinco «no llegaron», y la pantalla mostrando que el
       * problema eran los números. No lo era: cuando falta la forma de pago en
       * Meta, o la plantilla está pausada, fallan TODOS —el primero ya lo dice
       * todo— y no hay nada que revisar en los teléfonos.
       *
       * Antes eso sólo se cortaba si era el token. Ahora corta con cualquiera
       * de esa familia, y sobre todo NO los marca como fallidos: quedan en
       * «pendiente», así el envío se reanuda desde donde estaba cuando el
       * problema se arregle, sin volver a escribirle a nadie ni dejar una lista
       * de trescientos falsos rechazos.
       */
      if (esDeLaCuenta(envio.error)) {
        return {
          ok: false,
          error: envio.error,
          enviados,
          fallidos,
          faltan: await cuantosFaltan(supabase, envioId),
        };
      }

      fallidos++;
      await supabase
        .from("envio_destinatarios")
        .update({ estado: "fallido", motivo: envio.error })
        .eq("id", Number(d.id));
    }
  }

  const restantes = await cuantosFaltan(supabase, envioId);

  if (restantes === 0) {
    await supabase
      .from("envios")
      .update({ estado: "terminado", terminado_en: new Date().toISOString() })
      .eq("id", envioId);
  }

  revalidatePath("/");
  return { ok: true, error: null, enviados, fallidos, faltan: restantes };
}

type Cliente = NonNullable<Awaited<ReturnType<typeof getServerClient>>>;

async function cuantosFaltan(supabase: Cliente, envioId: number): Promise<number> {
  const { count } = await supabase
    .from("envio_destinatarios")
    .select("id", { count: "exact", head: true })
    .eq("envio_id", envioId)
    .eq("estado", "pendiente");
  return count ?? 0;
}

/**
 * Deja el mensaje en la conversación de esa persona, abriéndola si no la hay.
 *
 * ============================================================================
 * POR QUÉ AHORA SÍ SE ABREN HILOS NUEVOS
 * ============================================================================
 *
 * Antes no: sólo escribía en las conversaciones que ya existían. El argumento
 * era que crear trescientas de golpe llena la bandeja de gente que todavía no
 * contestó nada, y que la bandeja es una fila de trabajo y no un registro de lo
 * que salió.
 *
 * La escuela lo miró en uso y pidió lo contrario, con una razón mejor:
 *
 *     «Al momento que se envíe tiene que salir en mensaje de WhatsApp del
 *      cliente que se envió el masivo, de esa manera podemos darle seguimiento
 *      si contesta el cliente.»
 *
 * Y tienen razón. Sin la copia en el hilo, cuando alguien contesta «sí me
 * interesa» tres días después, la asesora abre una conversación que empieza por
 * esa respuesta: no ve qué se le dijo, ni cuándo, ni con qué plantilla. Tiene
 * que ir a Envíos, encontrar la campaña y leerla ahí. Eso es exactamente el
 * trabajo que la bandeja existe para evitar.
 *
 * ============================================================================
 * LO QUE SE HACE PARA QUE NO SEA UNA INUNDACIÓN
 * ============================================================================
 *
 * La preocupación de antes era real, así que se atiende de tres maneras:
 *
 *   NO SUBE EL CONTADOR ROJO   `sin_leer` queda en cero. Un mensaje que
 *                              mandamos nosotros no es algo pendiente de nadie:
 *                              contarlo pondría trescientos rojos y el número
 *                              de la barra dejaría de significar «acá hay algo
 *                              esperándote».
 *
 *   NO DESARCHIVA              Una conversación archivada la archivó alguien a
 *                              propósito. El mensaje se guarda igual —así queda
 *                              el registro— y si esa persona contesta, el
 *                              webhook la trae de vuelta como con cualquier
 *                              mensaje entrante.
 *
 *   QUEDA DE SU ASESORA        Es la otra mitad de lo que pidió la escuela
 *                              —«y dependiendo de qué asesor»—: el hilo nace
 *                              con el dueño del lead, así el filtro por asesora
 *                              de la bandeja lo agrupa bien desde el minuto
 *                              cero y no queda como «sin asignar».
 *
 * ============================================================================
 * NUNCA LANZA
 * ============================================================================
 *
 * El mensaje ya salió y el cliente ya lo tiene. Que no se haya podido dejar la
 * copia es molesto y se arregla; dar la tanda por fallida haría que la
 * siguiente le vuelva a escribir a la misma gente, que es el error que este
 * archivo entero viene evitando.
 */
async function dejarEnElHilo(
  supabase: Cliente,
  telefono: string,
  texto: string,
  waId: string | null,
  usuarioId: string,
  /** Para que el hilo nazca de quien atiende ese lead. */
  clienteId: number | null,
) {
  try {
    const numero = paraMeta(telefono);
    if (!numero) return;

    const conversacionId = await hiloDeEsteNumero(supabase, numero, clienteId);
    if (conversacionId == null) return;

    const { error } = await supabase.from("mensajes").insert({
      conversacion_id: conversacionId,
      wa_id: waId,
      direccion: "saliente",
      tipo: "text",
      texto,
      estado: "enviado",
      enviado_por: usuarioId,
    });

    // 23505: la tanda se reintentó y este mensaje ya estaba. No es un error.
    if (error && error.code !== "23505") return;

    /*
     * El hilo sube en la lista, pero sin ponerse en rojo.
     *
     * `ultimo_mensaje_en` es por lo que se ordena la bandeja: sin tocarlo, el
     * hilo de alguien a quien le acabamos de escribir quedaría hundido entre
     * conversaciones de hace meses. `sin_leer` NO se toca, por lo de arriba.
     *
     * ------------------------------------------------------------------------
     * Y SE DESARCHIVA, QUE ES LO QUE FALTABA
     * ------------------------------------------------------------------------
     *
     * Acá no se tocaba `archivada`, por no mover algo que alguien había
     * ordenado a mano. Estaba mal, y la escuela lo reportó así: «varios
     * clientes que se reactivaron con la plantilla no aparecen los chats».
     *
     * El caso es justo el que una campaña de reactivación busca. Un lead se
     * enfría, alguien archiva el hilo para sacarlo de la vista, y meses después
     * entra en una campaña. El mensaje sale, el hilo sube en la lista… y sigue
     * marcado como archivado, así que la bandeja lo esconde. El asesor no ve lo
     * que se mandó en su nombre y no puede dar seguimiento.
     *
     * Archivar quiere decir «con esta persona no estoy hablando». Escribirle
     * deja de ser cierto en el momento en que se manda el mensaje, y es la
     * misma regla que ya aplica cuando el cliente contesta: la función
     * `marcar_mensaje_entrante` desarchiva desde siempre. Esto lo único que
     * hace es que el lado saliente se comporte igual que el entrante.
     */
    await supabase
      .from("conversaciones")
      .update({
        ultimo_texto: texto.slice(0, 200),
        ultimo_mensaje_en: new Date().toISOString(),
        archivada: false,
      })
      .eq("id", conversacionId);
  } catch {
    // Ver arriba: no puede costar la tanda.
  }
}

/**
 * El hilo de WhatsApp de este número: el que hay, o uno nuevo.
 *
 * ----------------------------------------------------------------------------
 * SE BUSCA POR CANAL, COMO EN EL RESTO DEL CRM
 * ----------------------------------------------------------------------------
 *
 * Desde `20261024120000_instagram.sql` la identidad de una conversación es
 * `(canal, identificador)`. Un envío masivo sale por WhatsApp y sólo por ahí
 * —es el único canal con plantillas—, así que el hilo que corresponde es el de
 * WhatsApp aunque esa persona además tenga uno de Instagram.
 *
 * `identificador` se escribe siempre, y acá es el teléfono. Si la migración
 * todavía no se corrió, se reintenta sin esa columna: entre desplegar y correr
 * el SQL, mandar una campaña tiene que seguir funcionando.
 */
async function hiloDeEsteNumero(
  supabase: Cliente,
  numero: string,
  clienteId: number | null,
): Promise<number | null> {
  const buscar = async () => {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("canal", "whatsapp")
      .eq("telefono", numero)
      .maybeSingle();
    return data ? Number(data.id) : null;
  };

  /*
   * De quién es este lead, para que el hilo tenga dueño.
   *
   * Se toma el más reciente que tenga asesora asignada. Una persona puede tener
   * varios leads; el que importa para contestar es el que alguien está
   * atendiendo, no el más viejo.
   */
  let vendedorId: number | null = null;
  let nombre: string | null = null;

  if (clienteId != null) {
    const { data: lead } = await supabase
      .from("oportunidades")
      .select("vendedor_id")
      .eq("cliente_id", clienteId)
      .not("vendedor_id", "is", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lead?.vendedor_id != null) vendedorId = Number(lead.vendedor_id);

    const { data: cli } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id", clienteId)
      .maybeSingle();
    if (cli?.nombre) nombre = String(cli.nombre);
  }

  /*
   * Si el hilo ya estaba pero sin dueño, se le pone el del lead.
   *
   * Es la otra mitad de «y dependiendo de qué asesor». Un hilo viejo sin
   * asignar es lo más común en una base importada: existe porque alguien
   * escribió una vez, nadie lo tomó, y el lead sí tiene asesora. Sin esto, el
   * mensaje de la campaña cae en un hilo que el filtro por asesora no agrupa.
   *
   * Sólo cuando está vacío —`is("vendedor_id", null)`—, igual que hace el
   * webhook: si alguien lo reasignó a mano, esa decisión es de una persona y
   * vale más que la del lead.
   */
  const existente = await buscar();
  if (existente != null) {
    if (vendedorId != null) {
      await supabase
        .from("conversaciones")
        .update({ vendedor_id: vendedorId })
        .eq("id", existente)
        .is("vendedor_id", null);
    }
    return existente;
  }

  const fila = {
    telefono: numero,
    // El nombre del CRM: esa persona nunca escribió, así que no tenemos el de
    // su perfil de WhatsApp. Cuando escriba, el webhook lo pisa.
    nombre_perfil: nombre,
    cliente_id: clienteId,
    vendedor_id: vendedorId,
    ultimo_mensaje_en: new Date().toISOString(),
    // Ver `dejarEnElHilo`: lo que mandamos nosotros no es un pendiente.
    sin_leer: 0,
  };

  const { data: creada, error } = await supabase
    .from("conversaciones")
    .insert({ ...fila, canal: "whatsapp", identificador: numero })
    .select("id")
    .single();

  // Dos tandas a la vez, o alguien abriendo el chat desde la ficha en el mismo
  // momento: el segundo choca con la unicidad y se queda con el que ganó.
  if (error?.code === "23505") return buscar();

  // Sin la migración de Instagram corrida, `identificador` no existe todavía.
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const { data: vieja, error: errViejo } = await supabase
      .from("conversaciones")
      .insert(fila)
      .select("id")
      .single();
    if (errViejo?.code === "23505") return buscar();
    if (errViejo) return null;
    return vieja ? Number(vieja.id) : null;
  }

  if (error) return null;
  return creada ? Number(creada.id) : null;
}

/** Frena un envío a mitad de camino. Lo mandado, mandado está. */
export async function cancelarEnvio(envioId: number): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("envios")
    .update({ estado: "cancelado", terminado_en: new Date().toISOString() })
    .eq("id", envioId);

  if (error) return { ok: false, error: error.message };

  // Los que no salieron se marcan para que el resumen no los muestre como
  // pendientes para siempre.
  await supabase
    .from("envio_destinatarios")
    .update({ estado: "omitido", motivo: "se canceló el envío" })
    .eq("envio_id", envioId)
    .eq("estado", "pendiente");

  revalidatePath("/");
  return { ok: true, error: null };
}

/** Marca —o desmarca— que esta persona no quiere recibir envíos. */
export async function noMolestar(clienteId: number, valor: boolean): Promise<ActionResult> {
  const supabase = await getServerClient();
  if (!supabase) return SIN_SESION;

  const { error } = await supabase
    .from("clientes")
    .update({ no_molestar: valor })
    .eq("id", clienteId);

  if (error) {
    return { ok: false, error: faltaLaTabla(error) || /no_molestar/.test(error.message) ? FALTA_MIGRACION : error.message };
  }

  revalidatePath("/");
  return { ok: true, error: null };
}
