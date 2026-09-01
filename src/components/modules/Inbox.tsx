"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { archivar, marcarLeida } from "@/app/whatsapp-actions";
import { asignar, enviarArchivo, noEraLead, responderConversacion, urlsDeMedia } from "@/app/inbox-actions";
import {
  ACEPTA_ADJUNTOS,
  BALDE_WHATSAPP,
  CARPETA_SALIENTE,
  TOPE_DOCUMENTO_BYTES,
} from "@/lib/whatsapp/adjuntos";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useCatalogo } from "@/lib/catalog";
import { T, softer } from "@/lib/theme";
import { insertarEnCursor } from "@/lib/texto";
import { canalDe } from "@/lib/canales";
import { coincideHilo, hayBusqueda } from "@/lib/buscarEnBandeja";
import { AccionesDelHilo } from "@/components/modules/AccionesDelHilo";
import { CanalesDeLaBandeja } from "@/components/modules/CanalesDeLaBandeja";
import { GrabadorDeVoz } from "@/components/modules/GrabadorDeVoz";
import { ReaccionesDelMensaje } from "@/components/modules/ReaccionesDelMensaje";
import { SelectorEmoji } from "@/components/ui/SelectorEmoji";
import { EstadoDelLead } from "@/components/modules/EstadoDelLead";
import { EtiquetasConversacion } from "@/components/modules/EtiquetasConversacion";
import { MandarPlantilla } from "@/components/modules/MandarPlantilla";
import { NuevoChat } from "@/components/modules/NuevoChat";
import { MediaMensaje } from "@/components/modules/MediaMensaje";
import { VisorArchivo } from "@/components/ui/VisorArchivo";
import { AcuseDeMensaje } from "@/components/ui/AcuseDeMensaje";
import { COMO_SE_DICE, acuseDe } from "@/lib/acuses";
import { activosCon } from "@/lib/types";
import type { Conversacion, Etiqueta, Mensaje, Oportunidad, Plantilla } from "@/lib/types";

interface Props {
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
  faltaMigracion: boolean;
  /** False cuando el servidor no tiene token de WhatsApp: no se puede responder. */
  puedeResponder: boolean;
  accent: string;
  /** Para mostrar la etapa y el estado reales del lead de cada conversación. */
  oportunidades: Oportunidad[];
  etiquetas: Etiqueta[];
  /** Para poder reabrir un hilo dormido. Sólo se ofrecen las aprobadas. */
  plantillas: Plantilla[];
  onRefrescar: () => void;
  onVerCliente: (clienteId: number) => void;
}

/** Etiqueta legible de un mensaje sin texto. */
const ETIQUETA: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Video",
  audio: "🎤 Nota de voz",
  document: "📄 Documento",
  sticker: "Sticker",
  location: "📍 Ubicación",
  contacts: "Contacto compartido",
};

/**
 * El texto de la burbuja.
 *
 * Cuando el archivo se ve —la foto, el audio— la etiqueta «📷 Foto» sobra y
 * además confunde: parecería el mensaje. Se muestra sólo el pie de foto, si lo
 * hay. La etiqueta queda para cuando no hay nada que mostrar, que es el caso
 * de una ubicación, un sticker o un archivo que no se pudo bajar.
 */
const contenido = (m: Mensaje): string => {
  if (m.texto) return m.texto;
  if (m.mediaRuta) return "";
  return ETIQUETA[m.tipo] ?? "Mensaje";
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short" });

/** Horas desde el último mensaje entrante: define la ventana de WhatsApp. */
function horasDesdeEntrante(msgs: Mensaje[]): number | null {
  const ultimo = [...msgs].reverse().find((m) => m.direccion === "entrante");
  if (!ultimo) return null;
  return (Date.now() - new Date(ultimo.creadoEn).getTime()) / 3_600_000;
}

/**
 * ¿Se le puede escribir libremente a esta conversación?
 *
 * Cada red abre una ventana cada vez que la persona escribe, y NO duran lo
 * mismo: WhatsApp da 24 horas, Instagram y Messenger dan siete días cuando
 * contesta una persona de verdad —que en esta bandeja es siempre—. Cuánto dura
 * cada una está en `@/lib/canales`; acá sólo se cuenta.
 *
 * Hay dos formas de estar afuera y las dos importan:
 *
 *   escribió hace más de 24 horas   la ventana se cerró.
 *   nunca escribió                  nunca se abrió. Es el caso de un chat que
 *                                   abrimos nosotros desde «Nuevo chat».
 *
 * El segundo es el que se pasaba por alto: sin mensajes entrantes no hay horas
 * que contar, y tratar eso como «ventana abierta» mostraría el cuadro de texto
 * para que el mensaje falle recién en Meta, con un error que no explica nada.
 */
function ventanaAbierta(msgs: Mensaje[], horasDeLaVentana: number): boolean {
  const horas = horasDesdeEntrante(msgs);
  return horas != null && horas < horasDeLaVentana;
}

/**
 * Bandeja de WhatsApp.
 *
 * Dos columnas: los hilos a la izquierda, la conversación abierta a la
 * derecha. Un hilo sin cliente muestra «Crear lead», que es la decisión que
 * el sistema deja a una persona a propósito.
 */
export function Inbox({
  conversaciones,
  mensajes,
  faltaMigracion,
  puedeResponder,
  accent,
  oportunidades,
  etiquetas,
  plantillas,
  onRefrescar,
  onVerCliente,
}: Props) {
  const cat = useCatalogo();
  const [abierta, setAbierta] = useState<number | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);
  /** Null = sin filtrar por etiqueta. */
  const [porEtiqueta, setPorEtiqueta] = useState<number | null>(null);
  /** Null = todas las redes juntas, que es como se trabaja hoy. */
  const [porCanal, setPorCanal] = useState<string | null>(null);
  const [nuevoChat, setNuevoChat] = useState(false);
  const fotoRef = useRef<HTMLInputElement | null>(null);
  const [mandandoFoto, setMandandoFoto] = useState(false);
  /**
   * En qué va el envío, para poder decirlo.
   *
   * Con archivos chicos daba igual, pero veinte megas por una conexión de oficina son
   * bastantes segundos: un botón que dice «Enviando…» todo ese rato parece
   * colgado. Diciendo «Subiendo…» primero se entiende que está avanzando.
   */
  const [fase, setFase] = useState<"subiendo" | "enviando" | null>(null);
  /**
   * La foto elegida, esperando confirmación.
   *
   * Antes se mandaba en el mismo instante en que se elegía del disco. Elegir
   * la equivocada era mandársela al cliente sin ninguna pantalla de por medio,
   * y eso no se puede deshacer: del otro lado ya la vio.
   */
  const [porEnviar, setPorEnviar] = useState<{ archivo: File; url: string } | null>(null);
  const [nota, setNota] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  /** Para meter el emoji donde está el cursor y no siempre al final. */
  const cajaTexto = useRef<HTMLTextAreaElement | null>(null);
  /** El grabador está ocupando la fila del mensaje. */
  const [grabando, setGrabando] = useState(false);
  /** Lo escrito en la barra de búsqueda de la lista de hilos. */
  const [busqueda, setBusqueda] = useState("");
  const soft = softer(accent);

  /**
   * Cómo se llama en el CRM la persona de cada hilo.
   *
   * El nombre del CRM es por el que se busca más seguido: en la ficha dice
   * «María José Retana Hernández» y su WhatsApp dice «Majo». Sin esto, buscar
   * lo que se tiene a la vista no encontraría nada.
   */
  const nombreEnElCrm = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of oportunidades) if (!m.has(o.clienteId)) m.set(o.clienteId, o.cliente);
    return (clienteId: number | null) => (clienteId == null ? null : m.get(clienteId) ?? null);
  }, [oportunidades]);

  const buscando = hayBusqueda(busqueda);

  const lista = useMemo(
    () =>
      conversaciones
        .filter(
          (c) =>
            /*
             * Con algo escrito, los filtros se apagan.
             *
             * La escuela lo pidió como «buscar un cliente en todos los
             * canales», y son cuatro los filtros que estorban, no uno: red,
             * etiqueta, archivadas y sin asignar. Si la búsqueda los
             * respetara, no encontrar a alguien no querría decir que no está
             * —querría decir que está detrás de un filtro que nadie recuerda
             * haber puesto—, y eso es una respuesta falsa a una pregunta que
             * se hace con el cliente al teléfono.
             *
             * Al borrar el texto, los filtros vuelven a mandar.
             */
            (buscando ||
              // `verTodas` ignora el archivado: es «todos los chats», que es
              // distinto de las activas y de las archivadas por separado.
              ((verTodas || c.archivada === verArchivadas) &&
                (!soloSinAsignar || c.vendedorId == null) &&
                (porCanal == null || c.canal === porCanal) &&
                (porEtiqueta == null || c.etiquetaIds.includes(porEtiqueta)))) &&
            (!buscando || coincideHilo(c, busqueda, nombreEnElCrm(c.clienteId))),
        )
        /*
         * Las fijadas arriba, el resto por actividad.
         *
         * El orden por actividad lo trae la consulta y sigue valiendo para
         * todo lo demás; acá sólo se levantan las fijadas. `sort` sobre una
         * copia —`filter` ya devolvió una— así que no se toca el arreglo que
         * llegó por props.
         *
         * Sin esto, fijar no serviría de nada: el lead que se está trabajando
         * hoy pero no escribe desde ayer queda debajo de cualquier consulta
         * nueva que no importa, que es justo el problema que fijar resuelve.
         */
        .sort((a, b) => Number(b.fijada) - Number(a.fijada)),
    [conversaciones, verArchivadas, verTodas, soloSinAsignar, porCanal, porEtiqueta, buscando, busqueda, nombreEnElCrm],
  );

  /** Cuántos hilos hay de cada red, para la fila de pestañas. */
  const porRed = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of conversaciones) {
      if (c.archivada) continue;
      m[c.canal] = (m[c.canal] ?? 0) + 1;
    }
    return m;
  }, [conversaciones]);

  /** Hay conversaciones de más de una red: recién ahí sirve marcarlas. */
  const variasRedes = Object.keys(porRed).length > 1;

  const sinAsignar = useMemo(
    () => conversaciones.filter((c) => !c.archivada && c.vendedorId == null).length,
    [conversaciones],
  );

  const actual = useMemo(
    () => conversaciones.find((c) => c.id === abierta) ?? null,
    [conversaciones, abierta],
  );

  const delHilo = useMemo(
    () => (abierta == null ? [] : mensajes.filter((m) => m.conversacionId === abierta)),
    [mensajes, abierta],
  );

  /**
   * Las direcciones firmadas de los archivos del hilo abierto.
   *
   * Se piden al abrir la conversación y no al cargar la bandeja: firmar
   * cientos de archivos que nadie va a mirar es trabajo tirado, y para cuando
   * alguien llegara a ese hilo las firmas ya habrían caducado.
   */
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const rutas = delHilo
      .map((m) => m.mediaRuta)
      .filter((r): r is string => r != null);

    if (rutas.length === 0) {
      setUrls({});
      return;
    }

    let vigente = true;
    void urlsDeMedia(rutas).then((r) => {
      if (vigente) setUrls(r);
    });
    return () => {
      vigente = false;
    };
    // Se rehace cuando cambia el hilo o le llega un mensaje nuevo con archivo.
  }, [delHilo]);

  // Al abrir un hilo se baja al último mensaje: nadie quiere empezar a leer
  // por arriba una conversación de tres semanas.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [abierta, delHilo.length]);

  // Abrirla es haberla leído.
  useEffect(() => {
    if (actual && actual.sinLeer > 0) {
      void marcarLeida(actual.id).then(onRefrescar);
    }
  }, [actual, onRefrescar]);

  /*
   * Al cambiar de conversación se limpia el aviso y la nota interna.
   *
   * Depende del id y no del objeto, y ahí está la diferencia que importa:
   * `actual` se rearma en cada refresco —lo trae la carga en vivo— así que con
   * el objeto como dependencia esto se disparaba sin que nadie cambiara de
   * hilo. El efecto era que cualquier aviso duraba lo que tardaba el siguiente
   * refresco: «No era lead» archivaba, escribía su explicación, llegaba el
   * refresco por el propio archivado y el mensaje desaparecía antes de que
   * alguien lo leyera.
   */
  useEffect(() => {
    setAviso(null);
    setNota(false);
  }, [actual?.id]);

  /**
   * La venta de la que habla esta conversación.
   *
   * Se toma la abierta más reciente: si alguien ya cursó un diplomado y ahora
   * pregunta por otro, lo que importa es en qué anda ahora, no lo que cerró el
   * año pasado.
   */
  const suOportunidad = useMemo(() => {
    if (!actual?.clienteId) return null;
    const suyas = oportunidades.filter((o) => o.clienteId === actual.clienteId);
    return suyas.find((o) => o.fechaCierre == null) ?? suyas[0] ?? null;
  }, [oportunidades, actual]);

  /**
   * De qué red es el hilo abierto.
   *
   * De acá sale todo lo que cambia entre una red y otra: cuánto dura la
   * ventana, si hay plantillas para reabrir, si se puede reaccionar. Antes eso
   * estaba escrito fijo en esta pantalla, que es lo que había que sacar para
   * que agregar Instagram no sea rehacerla.
   */
  const canal = canalDe(actual?.canal);
  const ventanaCerrada = !ventanaAbierta(delHilo, canal.ventanaHoras);
  /** Nunca escribió: el aviso tiene que decir otra cosa. */
  const nuncaEscribio = horasDesdeEntrante(delHilo) == null;

  /**
   * Manda el archivo elegido.
   *
   * Son dos pasos y el primero es el que cambió todo: el archivo sube derecho
   * de acá al bucket de Supabase, sin pasar por el servidor de la aplicación.
   * Antes iba adentro de la llamada al servidor y ahí el techo eran 6 MB, así
   * que un PDF de veinte megas no había forma de mandarlo. Por este camino el
   * tope pasa a ser el del bucket.
   *
   * El segundo paso le pasa al servidor nada más la ruta, y el servidor se
   * encarga de WhatsApp. Si eso falla, él borra lo que se acaba de subir.
   *
   * El mensaje escrito en la caja va junto al archivo: es lo que uno espera al
   * escribir algo y después adjuntar, y ahorra mandar dos mensajes.
   */
  /**
   * Cuánto se espera antes de dar por perdido un envío.
   *
   * Existe porque sin esto no había nada que cortara: una subida que se queda
   * a medias —conexión que se cae, wifi que cambia de antena— dejaba el visor
   * diciendo «Subiendo…» para siempre, y como el visor no se dejaba cerrar
   * mientras creía que estaba mandando, no quedaba más salida que recargar la
   * página. Dos minutos alcanzan de sobra para lo que se manda por acá.
   */
  const ESPERA_MAXIMA_MS = 120_000;

  /**
   * La misma promesa, pero que se rinde en vez de esperar para siempre.
   *
   * `Promise.race` con un reloj. El temporizador se limpia igual si gana la
   * promesa: sin eso quedarían timers vivos por cada archivo mandado.
   */
  const conTiempoLimite = <T,>(promesa: Promise<T>): Promise<T> => {
    let reloj: ReturnType<typeof setTimeout>;
    return Promise.race([
      promesa,
      new Promise<never>((_, rechazar) => {
        reloj = setTimeout(() => rechazar(new Error("TIEMPO")), ESPERA_MAXIMA_MS);
      }),
    ]).finally(() => clearTimeout(reloj)) as Promise<T>;
  };

  /**
   * El envío que está en curso, si hay alguno.
   *
   * Hace falta para dos cosas: poder cancelarlo, y que un resultado que llega
   * tarde —después de que la persona cerró el visor— no vuelva a encender un
   * cartel sobre una pantalla en la que ya está haciendo otra cosa.
   */
  const enCurso = useRef<{ ruta: string; cancelado: boolean } | null>(null);

  /** Traduce a algo que se entienda lo que devuelve un envío que falló. */
  const porQueFallo = (e: unknown, nombre: string): string => {
    const dice = e instanceof Error ? e.message : String(e);

    if (dice === "TIEMPO") {
      return `«${nombre}» tardó demasiado y se canceló. Puede ser la conexión: probá de nuevo.`;
    }
    // El caso más probable la primera vez, y el más difícil de adivinar: la
    // base todavía no tiene el permiso que deja subir al bucket.
    if (/row-level security|Unauthorized|violates|403/i.test(dice)) {
      return (
        "El servidor no deja subir el archivo. Falta correr la migración " +
        "20260921120000_adjuntos_grandes.sql en Supabase."
      );
    }
    if (/mime|content type/i.test(dice)) {
      return `El tipo de «${nombre}» no está permitido en el servidor todavía.`;
    }
    return `No se pudo enviar «${nombre}»: ${dice}`;
  };

  /**
   * Manda el archivo elegido.
   *
   * Son dos pasos y el primero es el que cambió todo: el archivo sube derecho
   * de acá al bucket de Supabase, sin pasar por el servidor de la aplicación.
   * Antes iba adentro de la llamada al servidor y ahí el techo eran 6 MB, así
   * que un PDF de veinte megas no había forma de mandarlo. Por este camino el
   * tope pasa a ser el del bucket.
   *
   * El segundo paso le pasa al servidor nada más la ruta, y el servidor se
   * encarga de WhatsApp. Si eso falla, él borra lo que se acaba de subir.
   *
   * Todo va adentro de un `try`, y eso no es prolijidad: los dos pasos pueden
   * lanzar en vez de devolver un error —una conexión que se corta, el servidor
   * que contesta 500— y sin atraparlo el visor quedaba trabado sin forma de
   * salir.
   *
   * El mensaje escrito en la caja va junto al archivo: es lo que uno espera al
   * escribir algo y después adjuntar, y ahorra mandar dos mensajes.
   */
  const mandarFoto = async (archivo: File) => {
    if (!actual) return;

    if (archivo.size > TOPE_DOCUMENTO_BYTES) {
      setAviso(
        `«${archivo.name}» pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope es ` +
          `${TOPE_DOCUMENTO_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }

    // Un nombre nuevo y sin relación con el original: dos personas mandando
    // «Lista de precios.pdf» el mismo día no se pisan, y el nombre de verdad
    // viaja aparte, que es el que va a ver el cliente.
    const ruta = `${CARPETA_SALIENTE}/${actual.id}/${crypto.randomUUID()}`;
    const envio = { ruta, cancelado: false };
    enCurso.current = envio;

    setMandandoFoto(true);
    setFase("subiendo");
    setAviso(null);

    try {
      const { error: errSubida } = await conTiempoLimite(
        getBrowserClient()
          .storage.from(BALDE_WHATSAPP)
          .upload(ruta, archivo, { contentType: archivo.type, upsert: false }),
      );

      if (envio.cancelado) return;
      if (errSubida) {
        setAviso(porQueFallo(errSubida, archivo.name));
        return;
      }

      setFase("enviando");
      const r = await conTiempoLimite(
        enviarArchivo({
          conversacionId: actual.id,
          ruta,
          nombre: archivo.name,
          mime: archivo.type,
          bytes: archivo.size,
          pie: texto,
        }),
      );

      if (envio.cancelado) return;

      if (r.ok) {
        setTexto("");
        cerrarVisor();
        onRefrescar();
      } else {
        setAviso(r.error);
      }
    } catch (e) {
      if (envio.cancelado) return;
      setAviso(porQueFallo(e, archivo.name));
    } finally {
      if (!envio.cancelado) {
        setMandandoFoto(false);
        setFase(null);
      }
      enCurso.current = null;
    }
  };

  /**
   * Salir del envío, esté donde esté.
   *
   * Se puede en cualquier momento, incluso a mitad de la subida: quedarse
   * mirando una barra que no avanza, sin poder cerrar, es peor que perder la
   * subida y volver a empezar. Lo que haya llegado al bucket se borra —la
   * política deja borrar lo propio bajo «saliente/»— para no dejar un archivo
   * que nadie va a ver.
   */
  const cancelarEnvio = () => {
    const envio = enCurso.current;
    if (envio) {
      envio.cancelado = true;
      void getBrowserClient()
        .storage.from(BALDE_WHATSAPP)
        .remove([envio.ruta])
        .catch(() => {
          // Si no llegó a subir no hay nada que borrar, y si falla el borrado
          // tampoco hay que molestar a nadie con eso.
        });
      enCurso.current = null;
    }
    setMandandoFoto(false);
    setFase(null);
    cerrarVisor();
  };

  /**
   * Suelta la dirección temporal del navegador.
   *
   * `createObjectURL` reserva memoria hasta que se la libera. En una jornada
   * con muchas fotos, no soltarlas deja el navegador cada vez más pesado sin
   * ninguna señal de por qué.
   */
  const cerrarVisor = () => {
    setPorEnviar((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  };

  /**
   * Mete un emoji donde está el cursor.
   *
   * Al final del texto sería lo fácil y estaría mal la mitad de las veces: se
   * escribe el mensaje entero, se relee y recién ahí se quiere poner la carita
   * después del saludo. El cursor vuelve justo detrás de lo insertado para
   * poder seguir escribiendo —o poner otro— sin tocar el mouse.
   */
  const ponerEmoji = (emoji: string) => {
    const caja = cajaTexto.current;
    const desde = caja?.selectionStart ?? texto.length;
    const hasta = caja?.selectionEnd ?? texto.length;
    const { valor, cursor } = insertarEnCursor(texto, desde, hasta, emoji);

    setTexto(valor);
    // En el siguiente cuadro: React todavía no escribió el valor nuevo, y
    // mover el cursor antes lo dejaría donde estaba.
    requestAnimationFrame(() => {
      caja?.focus();
      caja?.setSelectionRange(cursor, cursor);
    });
  };

  const enviar = async () => {
    if (!actual || !texto.trim()) return;
    setEnviando(true);
    setAviso(null);
    const r = await responderConversacion(actual.id, texto, nota);
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      onRefrescar();
    } else {
      setAviso(r.error);
    }
  };

  const cambiarVendedor = async (vendedorId: number | null) => {
    if (!actual) return;
    setAviso(null);
    const r = await asignar(actual.id, vendedorId);
    if (r.ok) onRefrescar();
    else setAviso(r.error);
  };

  const descartar = async () => {
    if (!actual) return;
    setAviso(null);
    const r = await noEraLead(actual.id);
    if (r.ok) { setAbierta(null); onRefrescar(); }
    else setAviso(r.error);
  };

  if (faltaMigracion) {
    return (
      <p
        style={{
          margin: 0,
          padding: "14px 16px",
          fontSize: 13,
          lineHeight: 1.6,
          borderRadius: 9,
          background: "#F6EEDC",
          color: "#7A5A12",
        }}
      >
        La bandeja todavía no tiene sus tablas. Corré{" "}
        <code>supabase/migrations/20260814120000_whatsapp_inbox.sql</code> en Supabase →
        SQL Editor y recargá.
      </p>
    );
  }

  const th: CSSProperties = {
    padding: "11px 14px",
    borderBottom: `1px solid ${T.border}`,
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 320px) 1fr",
        gap: 12,
        height: "calc(100vh - 150px)",
        minHeight: 420,
      }}
    >
      {/* ------------------------------------------------------- los hilos */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/*
          Las pastillas se acomodan en dos renglones antes que salirse.

          La columna de los hilos es angosta y se angosta más en una laptop:
          sin `flexWrap`, la última —«Todas»— se salía del panel y quedaba
          cortada por la mitad, con la mitad del filtro invisible y sin manera
          de saber que estaba ahí.
        */}
        <div style={{ ...th, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => { setVerArchivadas(false); setSoloSinAsignar(false); setVerTodas(false); }}
            style={pestana(!verTodas && !verArchivadas && !soloSinAsignar, accent)}
          >
            Activas
          </button>
          <button
            type="button"
            onClick={() => { setVerArchivadas(false); setSoloSinAsignar(true); setVerTodas(false); }}
            style={pestana(!verTodas && !verArchivadas && soloSinAsignar, accent)}
          >
            Sin asignar
            {sinAsignar > 0 && (
              /* El número, en su propia pastilla. Suelto al lado del texto se
                 lee como parte del nombre —«sin asignar 2»— en vez de como una
                 cantidad. */
              <span
                style={{
                  minWidth: 17,
                  padding: "0 5px",
                  borderRadius: 9,
                  fontSize: 10.5,
                  fontWeight: 700,
                  lineHeight: "16px",
                  textAlign: "center",
                  background: soloSinAsignar ? "rgba(255,255,255,0.25)" : T.paper,
                  color: soloSinAsignar ? "#fff" : T.muted,
                }}
              >
                {sinAsignar}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setVerArchivadas(true); setSoloSinAsignar(false); setVerTodas(false); }}
            style={pestana(!verTodas && verArchivadas, accent)}
          >
            Archivadas
          </button>
          <button
            type="button"
            onClick={() => { setVerTodas(true); setSoloSinAsignar(false); }}
            style={pestana(verTodas, accent)}
          >
            Todas
          </button>

          <span style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => setNuevoChat(true)}
            title="Escribirle a alguien que ya está en el CRM"
            style={{
              height: 24,
              padding: "0 10px",
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 12,
              background: accent,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            + Nuevo chat
          </button>
        </div>

        {nuevoChat && (
          <NuevoChat
            oportunidades={oportunidades}
            plantillas={plantillas}
            accent={accent}
            onCerrar={() => setNuevoChat(false)}
            onAbierta={(id) => {
              setNuevoChat(false);
              // Se sale de cualquier filtro: si el hilo estaba archivado o el
              // filtro de etiqueta lo esconde, abrirlo y no verlo confundiría.
              setVerArchivadas(false);
              setVerTodas(true);
              setSoloSinAsignar(false);
              setPorEtiqueta(null);
              setAbierta(id);
              onRefrescar();
            }}
          />
        )}

      {/*
        Lo que se está por mandar, antes de mandarlo.

        Se ve la foto entera —no la miniatura que quedaría en el hilo— y el pie
        se puede escribir acá mismo. Es la única pantalla entre elegir un
        archivo del disco y que lo tenga el cliente.
      */}
      {porEnviar && (
        <VisorArchivo
          url={porEnviar.url}
          mime={porEnviar.archivo.type}
          nombre={porEnviar.archivo.name}
          titulo={`Se va a enviar: ${porEnviar.archivo.name}`}
          onCerrar={cancelarEnvio}
          pie={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Un mensaje junto al archivo (opcional)"
                style={{
                  flex: 1,
                  minWidth: 180,
                  height: 34,
                  padding: "0 10px",
                  fontSize: 13,
                  border: `1px solid ${T.border}`,
                  borderRadius: 7,
                  background: T.surface,
                  color: T.ink,
                }}
              />
              <button
                type="button"
                onClick={cancelarEnvio}
                style={{
                  height: 34,
                  padding: "0 14px",
                  fontSize: 13,
                  borderRadius: 7,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  color: T.ink,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void mandarFoto(porEnviar.archivo)}
                disabled={mandandoFoto}
                style={{
                  height: 34,
                  padding: "0 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 7,
                  background: accent,
                  color: "#fff",
                  cursor: mandandoFoto ? "wait" : "pointer",
                }}
              >
                {fase === "subiendo" ? "Subiendo…" : fase === "enviando" ? "Enviando…" : "Enviar"}
              </button>
            </div>
          }
        />
      )}

        {/*
          La barra de búsqueda.

          Va arriba de todo, y arriba de los filtros a propósito: mientras hay
          algo escrito los filtros no se aplican —se busca en las cuatro redes,
          en las archivadas y en las de cualquier asesora— y verla por encima
          deja claro que manda ella.
        */}
        <div style={{ padding: "9px 12px 8px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ position: "relative" }}>
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 9,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 12,
                color: T.faint,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, teléfono o mensaje"
              aria-label="Buscar una conversación"
              style={{
                width: "100%",
                height: 32,
                boxSizing: "border-box",
                padding: "0 30px 0 27px",
                fontSize: 12.5,
                borderRadius: 7,
                border: `1px solid ${buscando ? accent : T.border}`,
                background: T.surface,
                color: T.ink,
              }}
            />
            {buscando && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Limpiar la búsqueda"
                title="Limpiar la búsqueda"
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 14,
                  lineHeight: 1,
                  color: T.faint,
                  padding: "2px 4px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>

          {/*
            Decir que se está buscando en todo.

            Sin este renglón, alguien que tenía puesto el filtro «sin asignar»
            ve aparecer hilos asignados y cree que el filtro se rompió. Con él,
            entiende que la búsqueda es a propósito más amplia.
          */}
          {buscando && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: T.muted }}>
              {lista.length === 0
                ? "No hay ninguna conversación con eso."
                : `${lista.length} ${lista.length === 1 ? "conversación" : "conversaciones"}, buscando en todas las redes y también en las archivadas.`}
            </p>
          )}
        </div>

        {/*
          Las redes.

          Va arriba de las etiquetas porque es un corte más grueso: primero por
          dónde llegó, después cómo está marcada. Y a diferencia de las
          etiquetas, esta fila aparece siempre —aunque hoy todo sea WhatsApp—
          porque además de filtrar dice qué redes están previstas y qué le
          falta a cada una.
        */}
        <CanalesDeLaBandeja
          cuantos={porRed}
          elegido={porCanal}
          accent={accent}
          onElegir={setPorCanal}
        />

        {/* Filtro por etiqueta. Sólo aparece si hay etiquetas creadas: una fila
            de controles vacía en una bandeja recién estrenada es ruido. */}
        {etiquetas.some((e) => e.activa) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: "8px 12px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            {etiquetas
              .filter((e) => e.activa)
              .map((e) => {
                const puesta = porEtiqueta === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setPorEtiqueta(puesta ? null : e.id)}
                    style={{
                      height: 20,
                      padding: "0 8px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: 10,
                      border: `1px solid ${e.color}`,
                      background: puesta ? e.color : "transparent",
                      color: puesta ? "#fff" : e.color,
                    }}
                  >
                    {e.nombre}
                  </button>
                );
              })}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {lista.length === 0 && (
            <p style={{ margin: 0, padding: 16, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
              {verArchivadas
                ? "No hay conversaciones archivadas."
                : "Todavía no ha escrito nadie. Cuando llegue el primer mensaje al número de WhatsApp de la escuela, va a aparecer acá."}
            </p>
          )}

          {lista.map((c) => {
            const activa = c.id === abierta;
            return (
              /*
               * Un `div` con dos botones adentro, y no un botón con otro.
               *
               * La fila entera era un `<button>`. Meter el «⋮» adentro sería
               * un botón dentro de un botón: HTML inválido, y el navegador
               * reacomoda el árbol por su cuenta —saca el de adentro— así que
               * React deja de reconocer lo que dibujó y el menú queda pintado
               * pero muerto. Es exactamente el error que ya pasó con el aviso
               * de las 24 horas, y está documentado más abajo.
               */
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: "0 8px 0 0",
                  borderBottom: `1px solid ${T.border}`,
                  background: activa ? soft : "transparent",
                }}
              >
              <button
                type="button"
                onClick={() => setAbierta(c.id)}
                className="row"
                style={{
                  display: "block",
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  padding: "10px 6px 10px 14px",
                  background: "transparent",
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      minWidth: 0,
                      // Negrita también con la marca puesta a mano: para quien
                      // recorre la lista, «pendiente» y «sin abrir» son lo
                      // mismo —algo que todavía debe atenderse— y distinguirlos
                      // con dos pesos de letra distintos no ayudaría a nadie.
                      fontSize: 13,
                      fontWeight: c.sinLeer || c.noLeida ? 600 : 400,
                      color: T.ink,
                    }}
                  >
                    {c.fijada && (
                      <span title="Fijada arriba" style={{ fontSize: 10, flexShrink: 0 }}>
                        📌
                      </span>
                    )}
                    {/*
                      La red, sólo cuando hay más de una.

                      Hoy todo es WhatsApp: poner el mismo icono verde en las
                      cuarenta filas no distinguiría nada y sería ruido. En
                      cuanto entre la primera conversación de Instagram, la
                      marca aparece sola en todas.
                    */}
                    {variasRedes && (
                      <span
                        title={canalDe(c.canal).nombre}
                        style={{ fontSize: 10, flexShrink: 0 }}
                      >
                        {canalDe(c.canal).icono}
                      </span>
                    )}
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.nombrePerfil ?? c.telefono}
                    </span>
                    {c.silenciada && (
                      <span title="Silenciada: no cuenta para el número rojo" style={{ fontSize: 10, flexShrink: 0 }}>
                        🔕
                      </span>
                    )}
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: T.faint, flexShrink: 0 }}>
                    {dia(c.ultimoMensajeEn)}
                  </span>
                </span>

                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    fontSize: 11.5,
                    color: T.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.ultimoTexto ?? "—"}
                </span>

                <span style={{ display: "flex", gap: 4, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Las etiquetas van primero: es lo que se busca de un
                      vistazo cuando se recorre la lista. */}
                  {c.etiquetaIds.map((id) => {
                    const e = etiquetas.find((x) => x.id === id);
                    if (!e) return null;
                    return (
                      <span key={id} className="pill" style={chip("#fff", e.color)}>
                        {e.nombre}
                      </span>
                    );
                  })}
                  {c.vendedorId == null ? (
                    <span className="pill" style={chip("#8A5200", "#FFF6D6")}>sin asignar</span>
                  ) : (
                    <span className="pill" style={chip(T.muted, T.paper)}>
                      {cat.vendedores.find((v) => v.id === c.vendedorId)?.nombre ?? "asignada"}
                    </span>
                  )}
                  {/* Con la marca puesta a mano se dice con todas las letras.
                      El número solo —«1»— se leería como un mensaje sin abrir,
                      que es lo contrario de lo que pasó: alguien lo leyó y
                      decidió dejarlo pendiente. */}
                  {c.noLeida ? (
                    <span className="pill" style={chip("#fff", accent)}>pendiente</span>
                  ) : (
                    c.sinLeer > 0 && (
                      <span
                        className="pill"
                        style={chip("#fff", c.silenciada ? T.faint : accent)}
                      >
                        {c.sinLeer}
                      </span>
                    )
                  )}
                </span>
              </button>

              {/* A la altura del nombre, que es el primer renglón de la fila:
                  el «⋮» centrado sobre tres renglones quedaría apuntando al
                  texto de la vista previa, que no es lo que se acciona. */}
              <div style={{ marginTop: 9 }}>
                <AccionesDelHilo
                  conversacion={c}
                  accent={accent}
                  abierta={activa}
                  onCambio={onRefrescar}
                  onCerrar={() => setAbierta(null)}
                  onVerCliente={onVerCliente}
                />
              </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------- la conversación */}
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!actual ? (
          <p style={{ margin: "auto", fontSize: 13, color: T.muted }}>
            Elegí una conversación de la izquierda.
          </p>
        ) : (
          <>
            <div style={{ ...th, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
                  {actual.nombrePerfil ?? actual.telefono}
                </span>
                <span
                  className="mono"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.faint }}
                >
                  {/*
                    Acá sí va siempre, aunque haya una sola red.

                    Es donde se decide qué escribir, y qué se puede escribir
                    depende de por dónde sale: las plantillas son de WhatsApp,
                    la ventana de Instagram dura siete días. Saber por dónde se
                    está contestando no puede depender de mirar el ícono de la
                    fila de la izquierda.
                  */}
                  <span aria-hidden>{canal.icono}</span>
                  <span style={{ color: canal.color, fontWeight: 600 }}>{canal.nombre}</span>
                  <span>·</span>
                  <span>+{actual.telefono}</span>
                </span>
              </span>

              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={actual.vendedorId ?? ""}
                  onChange={(e) =>
                    void cambiarVendedor(e.target.value === "" ? null : Number(e.target.value))
                  }
                  title="A quién le toca dar seguimiento"
                  style={{
                    height: 30,
                    padding: "0 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: `1px solid ${actual.vendedorId == null ? "#FFCE00" : T.border}`,
                    background: actual.vendedorId == null ? "#FFF6D6" : T.surface,
                    color: T.ink,
                  }}
                >
                  <option value="">Sin asignar</option>
                  {/* Igual que en la ficha: no se ofrece a quien está de baja,
                      pero si el hilo ya es suyo su nombre no desaparece. */}
                  {activosCon(cat.vendedores, actual.vendedorId).map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>

                {actual.clienteId != null && (
                  <button
                    type="button"
                    onClick={() => onVerCliente(actual.clienteId!)}
                    style={boton(accent)}
                  >
                    Ver ficha
                  </button>
                )}
                <button
                  type="button"
                  onClick={descartar}
                  title="Número equivocado o proveedor: quita el cliente creado y archiva"
                  style={boton(T.muted)}
                >
                  No era lead
                </button>
                <button
                  type="button"
                  onClick={() => void archivar(actual.id, !actual.archivada).then(onRefrescar)}
                  style={boton(T.muted)}
                >
                  {actual.archivada ? "Desarchivar" : "Archivar"}
                </button>
              </span>
            </div>

            {/* En qué anda la venta, y las etiquetas de la conversación. Van
                juntos pero son cosas distintas: lo de arriba es el pipeline de
                verdad —la misma fila que ve la ficha— y lo de abajo es lo que
                el pipeline no dice. */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                padding: "9px 14px",
                borderBottom: `1px solid ${T.border}`,
                background: T.surface,
              }}
            >
              {suOportunidad ? (
                <EstadoDelLead
                  oportunidad={suOportunidad}
                  accent={accent}
                  onCambio={onRefrescar}
                  onVerFicha={() => onVerCliente(actual.clienteId!)}
                />
              ) : (
                <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>
                  Todavía no tiene una oportunidad abierta, así que no hay etapa ni
                  estado que mostrar.
                </span>
              )}

              <EtiquetasConversacion
                conversacionId={actual.id}
                puestas={actual.etiquetaIds}
                etiquetas={etiquetas}
                accent={accent}
                onCambio={onRefrescar}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", background: T.paper }}>
              {delHilo.map((m) => {
                const mio = m.direccion === "saliente";
                // Sólo los propios llevan acuse: de un mensaje que mandó el
                // cliente no hay nada que informar sobre su entrega.
                const acuse = mio ? acuseDe(m.estado) : null;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: mio ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    {/*
                      Una columna: la burbuja arriba y sus reacciones debajo.

                      El tope de ancho pasó de la burbuja a esta columna, y por
                      eso hace falta `alignItems`: sin él, la burbuja —que es un
                      bloque— se estiraría al 74% completo aunque el mensaje
                      diga «ok», y el hilo entero quedaría de cajas del mismo
                      tamaño. Alineada al mismo borde que el mensaje, la fila de
                      reacciones cae justo debajo de la burbuja.
                    */}
                    <div
                      style={{
                        maxWidth: "74%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: mio ? "flex-end" : "flex-start",
                      }}
                    >
                    <div
                      style={{
                        maxWidth: "100%",
                        padding: "8px 11px",
                        borderRadius: 10,
                        background: m.privado ? "#FFF6D6" : mio ? accent : T.surface,
                        color: m.privado ? "#8A5200" : mio ? "#fff" : T.ink,
                        border: m.privado
                          ? "1px dashed #C79A2E"
                          : mio
                          ? "none"
                          : `1px solid ${T.border}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.privado && (
                        <span style={{ display: "block", fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
                          NOTA INTERNA
                        </span>
                      )}
                      {contenido(m)}
                      <MediaMensaje
                        mensaje={m}
                        url={m.mediaRuta ? (urls[m.mediaRuta] ?? null) : null}
                        mio={mio}
                        oportunidadId={suOportunidad?.id ?? null}
                        onGuardado={onRefrescar}
                      />
                      <span
                        className="mono"
                        style={{
                          display: "block",
                          marginTop: 4,
                          fontSize: 10,
                          opacity: 0.7,
                          textAlign: "right",
                        }}
                      >
                        {hora(m.creadoEn)}
                        {/*
                          La palabra sigue estando, y en castellano: el estado
                          se guarda como lo manda Meta —«delivered», «read»— y
                          leer inglés en medio de una pantalla en español hace
                          dudar de si dice lo que uno cree. Si el valor no se
                          reconoce se muestra crudo, que es mejor que callarlo.
                        */}
                        {mio && m.estado ? ` · ${acuse ? COMO_SE_DICE[acuse] : m.estado}` : ""}
                        {acuse && (
                          <AcuseDeMensaje
                            acuse={acuse}
                            color={m.privado ? "#8A5200" : mio ? "#fff" : T.ink}
                          />
                        )}
                      </span>
                      {m.error && (
                        <span style={{ display: "block", marginTop: 3, fontSize: 10.5, color: "#FFD9D4" }}>
                          {m.error}
                        </span>
                      )}
                      </div>

                      {/* Las reacciones van FUERA de la burbuja.
                          Adentro heredarían su fondo —el azul de los nuestros—
                          y un emoji sobre azul se lee como parte del mensaje.
                          Afuera se leen como lo que son: algo puesto encima. */}
                      {canal.puede.reaccionar === "si" && (
                        <ReaccionesDelMensaje
                          mensaje={m}
                          mio={mio}
                          accent={accent}
                          ventanaAbierta={!ventanaCerrada}
                          onCambio={onRefrescar}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={finRef} />
            </div>

            {aviso && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  padding: "9px 14px",
                  fontSize: 12,
                  lineHeight: 1.5,
                  background: "#FAE8E6",
                  color: "#9E2F29",
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                {aviso}
              </p>
            )}

            {ventanaCerrada && (
              /*
               * Un `div`, no un `p`.
               *
               * Acá había un `<p>` con el aviso y, adentro, el selector de
               * plantillas —que es un `<div>` con un `<select>` y un botón—.
               * Eso es HTML inválido: el navegador cierra el párrafo antes del
               * div, así que el árbol que arma no es el que React dibujó.
               *
               * La consecuencia no es visual sino peor: React no puede
               * enganchar sus manejadores sobre un árbol que no reconoce, y el
               * botón «Mandar» queda dibujado pero muerto. Se hace clic y no
               * pasa nada, sin ningún error a la vista.
               */
              <div
                style={{
                  padding: "9px 14px",
                  background: "#FFF6D6",
                  color: "#8A5200",
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                {/*
                  El aviso se arma con lo que dice el canal, no con «24 horas»
                  escrito acá. En Instagram y Messenger la ventana dura siete
                  días, y un aviso que dijera 24 horas haría dejar de contestar
                  conversaciones que todavía se pueden contestar.
                */}
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                  {nuncaEscribio ? (
                    /*
                     * Nunca escribió: no hay ventana que se haya pasado.
                     *
                     * Se dice aparte y no con la explicación de la ventana,
                     * que habla del «último mensaje de la persona»: no hay
                     * ninguno. Sonaría a que se dejó pasar un plazo cuando en
                     * realidad nunca empezó a correr.
                     */
                    <>
                      Esta persona todavía no le escribió al {canal.nombre} de la escuela.{" "}
                      {canal.puede.plantillas === "si"
                        ? "Hasta que lo haga, sólo deja llegarle con una plantilla aprobada."
                        : `Hasta que lo haga no hay forma de escribirle: ${canal.nombre} no deja escribir primero.`}
                    </>
                  ) : (
                    <>
                      Se pasó la ventana para contestarle por {canal.nombre}. {canal.laVentana}
                    </>
                  )}
                </p>

                {/*
                  Las plantillas son de WhatsApp y de nadie más.
                  Instagram y Messenger no tienen nada equivalente: pasada la
                  ventana no hay forma de escribir primero, hay que esperar.
                  Ofrecer el selector ahí sería ofrecer algo que no existe.
                */}
                {canal.puede.plantillas === "si" && (
                  <MandarPlantilla
                    conversacionId={actual.id}
                    plantillas={plantillas}
                    accent={accent}
                    onEnviado={onRefrescar}
                  />
                )}
              </div>
            )}

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 12px 0",
                fontSize: 12,
                color: nota ? "#8A5200" : T.muted,
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} />
              Nota interna — la ve el equipo, no el cliente
            </label>

            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "none" }}>
              {/* El clip: fotos y documentos —PDF, Word, Excel, PowerPoint—,
                  que es lo que Meta deja mandar. La lista sale de la misma
                  constante que comprueba el servidor, así que el selector no
                  puede ofrecer algo que después se rechace. */}
              <input
                ref={fotoRef}
                type="file"
                accept={ACEPTA_ADJUNTOS}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Se limpia siempre: si no, elegir el mismo archivo dos veces
                  // seguidas no dispara nada y parece que el botón se rompió.
                  e.target.value = "";
                  // `createObjectURL` lo muestra desde el disco, sin subirlo:
                  // si la persona cancela, el archivo no salió a ningún lado.
                  if (f) setPorEnviar({ archivo: f, url: URL.createObjectURL(f) });
                }}
              />
              {/* Mientras se graba, la fila es del grabador y nada más: el
                  clip, los emojis y el cuadro de texto se van. Una nota de voz
                  no lleva pie —Meta no lo acepta en un audio— así que dejarlos
                  a la vista invitaría a escribir algo que no va a salir. */}
              {!grabando && (
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                disabled={!puedeResponder || nota || mandandoFoto || ventanaCerrada}
                title={
                  nota
                    ? "Una nota interna no lleva archivos"
                    : ventanaCerrada
                      ? "Pasadas las 24 horas sólo se puede mandar una plantilla"
                      : "Adjuntar una foto o un documento"
                }
                style={{
                  alignSelf: "flex-end",
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.surface,
                  color:
                    puedeResponder && !nota && !ventanaCerrada ? T.ink : T.faint,
                  fontSize: 17,
                  cursor:
                    mandandoFoto
                      ? "wait"
                      : puedeResponder && !nota && !ventanaCerrada
                        ? "pointer"
                        : "not-allowed",
                }}
              >
                {mandandoFoto ? "…" : "📎"}
              </button>
              )}

              {/* Los emojis funcionan también en una nota interna y con la
                  ventana de 24 horas cerrada: no salen a WhatsApp por sí
                  mismos, son texto. Se apaga sólo cuando no hay dónde
                  escribir. */}
              {!grabando && (
                <SelectorEmoji
                  accent={accent}
                  disabled={!nota && !puedeResponder}
                  onElegir={ponerEmoji}
                />
              )}

              {/* El micrófono. Mientras se graba o se escucha, ocupa la fila
                  entera: el cuadro de texto se esconde a propósito, porque una
                  nota de voz no lleva pie —Meta no lo acepta en un audio— y
                  dejarlo a la vista invitaría a escribir algo que no va a
                  salir. */}
              {/* Sólo en las redes que aceptan audio. Hoy es WhatsApp; el día
                  que se conecte Instagram, su ficha dice si acepta y esto se
                  enciende solo. */}
              {canal.puede.notaDeVoz === "si" && (
                <GrabadorDeVoz
                  // Cambiar de conversación desmonta el grabador, y eso suelta
                  // el micrófono. Sin esto se seguiría grabando sobre un hilo
                  // que ya no está a la vista, y la nota saldría al cliente
                  // equivocado.
                  key={actual.id}
                  conversacionId={actual.id}
                  accent={accent}
                  disabled={!puedeResponder || nota || ventanaCerrada}
                  onEnviado={onRefrescar}
                  onOcupado={setGrabando}
                />
              )}

              {!grabando && (
              <textarea
                ref={cajaTexto}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder={
                  nota
                    ? "Una nota para el equipo. No sale a WhatsApp."
                    : puedeResponder
                      ? "Escribí tu respuesta… (Enter envía)"
                      : "WhatsApp no está configurado en el servidor."
                }
                /*
                 * Una nota interna se puede escribir siempre.
                 *
                 * Acá se pedía `puedeResponder`, que es tener token de
                 * WhatsApp. Para una respuesta está bien; para una nota del
                 * equipo no: no sale a ningún lado, es un dato del CRM. Con el
                 * token caído —o pasadas las 24 horas— el asesor se quedaba
                 * sin poder anotar lo que acababa de hablar por teléfono, que
                 * es justo cuando más falta hace.
                 */
                disabled={!nota && !puedeResponder}
                style={{
                  flex: 1,
                  minHeight: 40,
                  maxHeight: 120,
                  padding: "10px 12px",
                  font: "inherit",
                  fontSize: 13,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  background: nota || puedeResponder ? T.paper : T.border,
                  resize: "vertical",
                }}
              />
              )}

              {!grabando && (
              <button
                type="button"
                onClick={enviar}
                disabled={(!nota && !puedeResponder) || !texto.trim() || enviando}
                style={{
                  ...botonLleno(accent),
                  height: 40,
                  padding: "0 18px",
                  opacity: (!nota && !puedeResponder) || !texto.trim() ? 0.5 : 1,
                }}
              >
                {enviando
                  ? nota
                    ? "Guardando…"
                    : "Enviando…"
                  : nota
                    ? "Guardar nota"
                    : "Enviar"}
              </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pestana = (activa: boolean, accent: string): CSSProperties => ({
  // En una línea. Sin esto, «Sin asignar 2» se parte en dos renglones apenas
  // aparece el número y esa pastilla queda el doble de alta que las otras
  // tres, con la fila entera descolocada.
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  // Alto fijo y borde siempre presente —transparente en la activa— para que
  // las cuatro midan exactamente igual. Sin esto la activa queda 2px más baja
  // que las otras, porque no tiene borde, y la de «Sin asignar» 1px más alta
  // por el número de adentro: tres alturas distintas en una misma fila.
  height: 26,
  boxSizing: "border-box",
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 20,
  background: activa ? accent : "transparent",
  color: activa ? "#fff" : T.muted,
  border: `1px solid ${activa ? "transparent" : T.border}`,
});

const chip = (color: string, fondo: string): CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 600,
  padding: "1px 7px",
  borderRadius: 20,
  background: fondo,
  color,
});

const boton = (color: string): CSSProperties => ({
  fontSize: 12,
  height: 30,
  padding: "0 11px",
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  color,
  background: T.surface,
});

const botonLleno = (accent: string): CSSProperties => ({
  fontSize: 12.5,
  fontWeight: 600,
  height: 30,
  padding: "0 13px",
  borderRadius: 6,
  background: accent,
  color: "#fff",
});
