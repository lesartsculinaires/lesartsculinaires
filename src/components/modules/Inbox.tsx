"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { archivar, marcarLeida } from "@/app/whatsapp-actions";
import { asignar, enviarFoto, noEraLead, responderConversacion, urlsDeMedia } from "@/app/inbox-actions";
import { useCatalogo } from "@/lib/catalog";
import { T, softer } from "@/lib/theme";
import { EstadoDelLead } from "@/components/modules/EstadoDelLead";
import { EtiquetasConversacion } from "@/components/modules/EtiquetasConversacion";
import { MandarPlantilla } from "@/components/modules/MandarPlantilla";
import { NuevoChat } from "@/components/modules/NuevoChat";
import { MediaMensaje } from "@/components/modules/MediaMensaje";
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
 * WhatsApp abre una ventana de 24 horas cada vez que la persona escribe. Hay
 * dos formas de estar afuera y las dos importan:
 *
 *   escribió hace más de 24 horas   la ventana se cerró.
 *   nunca escribió                  nunca se abrió. Es el caso de un chat que
 *                                   abrimos nosotros desde «Nuevo chat».
 *
 * El segundo es el que se pasaba por alto: sin mensajes entrantes no hay horas
 * que contar, y tratar eso como «ventana abierta» mostraría el cuadro de texto
 * para que el mensaje falle recién en Meta, con un error que no explica nada.
 */
function ventanaAbierta(msgs: Mensaje[]): boolean {
  const horas = horasDesdeEntrante(msgs);
  return horas != null && horas < 24;
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
  const [nuevoChat, setNuevoChat] = useState(false);
  const fotoRef = useRef<HTMLInputElement | null>(null);
  const [mandandoFoto, setMandandoFoto] = useState(false);
  const [nota, setNota] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const soft = softer(accent);

  const lista = useMemo(
    () =>
      conversaciones.filter(
        (c) =>
          // `verTodas` ignora el archivado: es «todos los chats», que es
          // distinto de las activas y de las archivadas por separado.
          (verTodas || c.archivada === verArchivadas) &&
          (!soloSinAsignar || c.vendedorId == null) &&
          (porEtiqueta == null || c.etiquetaIds.includes(porEtiqueta)),
      ),
    [conversaciones, verArchivadas, verTodas, soloSinAsignar, porEtiqueta],
  );

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

  useEffect(() => {
    setAviso(null);
    setNota(false);
  }, [actual]);

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

  const ventanaCerrada = !ventanaAbierta(delHilo);
  /** Nunca escribió: el aviso tiene que decir otra cosa. */
  const nuncaEscribio = horasDesdeEntrante(delHilo) == null;

  /**
   * Manda una foto.
   *
   * El pie de foto es lo que esté escrito en la caja: es lo que uno espera al
   * escribir algo y después adjuntar, y ahorra mandar dos mensajes.
   */
  const mandarFoto = async (archivo: File) => {
    if (!actual) return;
    setMandandoFoto(true);
    setAviso(null);

    const datos = new FormData();
    datos.set("archivo", archivo);
    datos.set("conversacionId", String(actual.id));
    datos.set("pie", texto);

    const r = await enviarFoto(datos);
    setMandandoFoto(false);

    if (r.ok) {
      setTexto("");
      onRefrescar();
    } else {
      setAviso(r.error);
    }
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
              <button
                key={c.id}
                type="button"
                onClick={() => setAbierta(c.id)}
                className="row"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderBottom: `1px solid ${T.border}`,
                  background: activa ? soft : "transparent",
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: c.sinLeer ? 600 : 400, color: T.ink }}>
                    {c.nombrePerfil ?? c.telefono}
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
                  {c.sinLeer > 0 && (
                    <span className="pill" style={chip("#fff", accent)}>{c.sinLeer}</span>
                  )}
                </span>
              </button>
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
                <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                  +{actual.telefono}
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
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: mio ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "74%",
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
                        {mio && m.estado ? ` · ${m.estado}` : ""}
                      </span>
                      {m.error && (
                        <span style={{ display: "block", marginTop: 3, fontSize: 10.5, color: "#FFD9D4" }}>
                          {m.error}
                        </span>
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
              <p
                style={{
                  margin: 0,
                  padding: "9px 14px",
                  fontSize: 12,
                  lineHeight: 1.5,
                  background: "#FFF6D6",
                  color: "#8A5200",
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                {nuncaEscribio
                  ? "Esta persona todavía no le escribió al WhatsApp de la escuela. Hasta que lo haga, WhatsApp sólo deja llegarle con una plantilla aprobada."
                  : "Pasaron más de 24 horas desde su último mensaje. WhatsApp ya no deja escribirle libremente hasta que vuelva a escribir."}
                <MandarPlantilla
                  conversacionId={actual.id}
                  plantillas={plantillas}
                  accent={accent}
                  onEnviado={onRefrescar}
                />
              </p>
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
              {/* El clip. Sólo fotos: los documentos del cliente van a los
                  adjuntos de su ficha, que es donde después se los busca. */}
              <input
                ref={fotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Se limpia siempre: si no, elegir la misma foto dos veces
                  // seguidas no dispara nada y parece que el botón se rompió.
                  e.target.value = "";
                  if (f) void mandarFoto(f);
                }}
              />
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                disabled={!puedeResponder || nota || mandandoFoto || ventanaCerrada}
                title={
                  nota
                    ? "Una nota interna no lleva foto"
                    : ventanaCerrada
                      ? "Pasadas las 24 horas sólo se puede mandar una plantilla"
                      : "Adjuntar una foto"
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
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder={
                  puedeResponder ? "Escribí tu respuesta… (Enter envía)" : "WhatsApp no está configurado en el servidor."
                }
                disabled={!puedeResponder}
                style={{
                  flex: 1,
                  minHeight: 40,
                  maxHeight: 120,
                  padding: "10px 12px",
                  font: "inherit",
                  fontSize: 13,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  background: puedeResponder ? T.paper : T.border,
                  resize: "vertical",
                }}
              />
              <button
                type="button"
                onClick={enviar}
                disabled={!puedeResponder || !texto.trim() || enviando}
                style={{
                  ...botonLleno(accent),
                  height: 40,
                  padding: "0 18px",
                  opacity: !puedeResponder || !texto.trim() ? 0.5 : 1,
                }}
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
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
