"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  archivar,
  crearLeadDesdeConversacion,
  marcarLeida,
  responder,
} from "@/app/whatsapp-actions";
import { T, softer } from "@/lib/theme";
import type { Conversacion, Mensaje } from "@/lib/types";

interface Props {
  conversaciones: Conversacion[];
  mensajes: Mensaje[];
  faltaMigracion: boolean;
  /** False cuando el servidor no tiene token de WhatsApp: no se puede responder. */
  puedeResponder: boolean;
  accent: string;
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

const contenido = (m: Mensaje): string =>
  m.texto ?? ETIQUETA[m.tipo] ?? "Mensaje";

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
  onRefrescar,
  onVerCliente,
}: Props) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombreLead, setNombreLead] = useState("");
  const finRef = useRef<HTMLDivElement | null>(null);
  const soft = softer(accent);

  const lista = useMemo(
    () => conversaciones.filter((c) => c.archivada === verArchivadas),
    [conversaciones, verArchivadas],
  );

  const actual = useMemo(
    () => conversaciones.find((c) => c.id === abierta) ?? null,
    [conversaciones, abierta],
  );

  const delHilo = useMemo(
    () => (abierta == null ? [] : mensajes.filter((m) => m.conversacionId === abierta)),
    [mensajes, abierta],
  );

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
    setNombreLead(actual?.nombrePerfil ?? "");
    setAviso(null);
  }, [actual]);

  const horas = horasDesdeEntrante(delHilo);
  const ventanaCerrada = horas != null && horas >= 24;

  const enviar = async () => {
    if (!actual || !texto.trim()) return;
    setEnviando(true);
    setAviso(null);
    const r = await responder(actual.id, texto);
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      onRefrescar();
    } else {
      setAviso(r.error);
    }
  };

  const convertir = async () => {
    if (!actual) return;
    setAviso(null);
    const r = await crearLeadDesdeConversacion(actual.id, nombreLead);
    if (r.ok) onRefrescar();
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
        <div style={{ ...th, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setVerArchivadas(false)}
            style={pestana(!verArchivadas, accent)}
          >
            Activas
          </button>
          <button
            type="button"
            onClick={() => setVerArchivadas(true)}
            style={pestana(verArchivadas, accent)}
          >
            Archivadas
          </button>
        </div>

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

                <span style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
                  {c.clienteId == null && (
                    <span className="pill" style={chip("#8A5200", "#FFF6D6")}>sin lead</span>
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
                {actual.clienteId != null ? (
                  <button
                    type="button"
                    onClick={() => onVerCliente(actual.clienteId!)}
                    style={boton(accent)}
                  >
                    Ver ficha del cliente
                  </button>
                ) : (
                  <>
                    <input
                      value={nombreLead}
                      onChange={(e) => setNombreLead(e.target.value)}
                      placeholder="Nombre del cliente"
                      style={{
                        height: 30,
                        padding: "0 9px",
                        fontSize: 12.5,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        background: T.paper,
                        width: 160,
                      }}
                    />
                    <button type="button" onClick={convertir} style={botonLleno(accent)}>
                      Crear lead
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void archivar(actual.id, !actual.archivada).then(onRefrescar)}
                  style={boton(T.muted)}
                >
                  {actual.archivada ? "Desarchivar" : "Archivar"}
                </button>
              </span>
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
                        background: mio ? accent : T.surface,
                        color: mio ? "#fff" : T.ink,
                        border: mio ? "none" : `1px solid ${T.border}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {contenido(m)}
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
                Pasaron más de 24 horas desde su último mensaje. WhatsApp ya no deja
                escribirle libremente hasta que vuelva a escribir.
              </p>
            )}

            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${T.border}` }}>
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
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 20,
  background: activa ? accent : "transparent",
  color: activa ? "#fff" : T.muted,
  border: activa ? "none" : `1px solid ${T.border}`,
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
