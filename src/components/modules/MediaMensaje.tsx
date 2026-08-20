"use client";

import { useState } from "react";

import { guardarEnFicha } from "@/app/inbox-actions";
import { T } from "@/lib/theme";
import type { Mensaje } from "@/lib/types";

/**
 * El archivo que trajo un mensaje de WhatsApp.
 *
 * Tres casos, y los tres importan:
 *
 *   la foto llegó    se ve en el hilo, y se abre en grande al hacer clic.
 *   no llegó         se dice por qué. Esto no es un adorno: cuando alguien
 *                    busca el comprobante de un pago, «no se pudo bajar» y
 *                    «no había foto» llevan a hacer cosas distintas.
 *   falta la migración   el mensaje sabe que era una foto pero no hay dónde
 *                    guardarla; se muestra la etiqueta de siempre.
 */
export function MediaMensaje({
  mensaje: m,
  url,
  mio,
  oportunidadId,
  onGuardado,
}: {
  mensaje: Mensaje;
  /** Dirección firmada, o null mientras se pide o si no se pudo. */
  url: string | null;
  mio: boolean;
  /**
   * La oportunidad de este contacto. Null cuando la conversación todavía no
   * tiene ficha: ahí no hay dónde guardar el archivo y no se ofrece.
   */
  oportunidadId: number | null;
  onGuardado: () => void;
}) {
  if (m.mediaError) {
    return (
      <span
        style={{
          display: "block",
          marginTop: 4,
          fontSize: 11,
          lineHeight: 1.45,
          opacity: 0.85,
        }}
      >
        No se pudo traer el archivo. {m.mediaError}
      </span>
    );
  }

  if (!m.mediaRuta) return null;

  const mime = m.mediaMime ?? "";

  if (!url) {
    return (
      <span style={{ display: "block", marginTop: 4, fontSize: 11, opacity: 0.7 }}>
        Abriendo el archivo…
      </span>
    );
  }

  if (mime.startsWith("image/")) {
    return (
      <>
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5 }}>
        {/* Sin next/image a propósito: la dirección viene firmada y caduca, así
            que el optimizador no puede cachearla ni conoce el dominio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={m.texto ?? "Foto enviada por WhatsApp"}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 260,
            borderRadius: 8,
            border: `1px solid ${mio ? "rgba(255,255,255,0.3)" : T.border}`,
          }}
        />
      </a>
      <AFicha mensaje={m} oportunidadId={oportunidadId} mio={mio} onGuardado={onGuardado} />
      </>
    );
  }

  if (mime.startsWith("audio/")) {
    return (
      <audio controls src={url} style={{ display: "block", marginTop: 5, maxWidth: "100%" }} />
    );
  }

  if (mime.startsWith("video/")) {
    return (
      <video
        controls
        src={url}
        style={{ display: "block", marginTop: 5, maxWidth: "100%", maxHeight: 260, borderRadius: 8 }}
      />
    );
  }

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-block",
          marginTop: 5,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "underline",
          color: "inherit",
        }}
      >
        {m.mediaNombre ?? "Abrir el archivo"}
      </a>
      <AFicha mensaje={m} oportunidadId={oportunidadId} mio={mio} onGuardado={onGuardado} />
    </>
  );
}

/**
 * Pasar a la ficha del cliente un archivo que llegó por el chat.
 *
 * Es el paso que faltaba entre las dos mitades del CRM: la captura de una
 * transferencia llega al hilo y ahí se queda, mientras la documentación del
 * cliente vive en los adjuntos de su oportunidad. Sin esto hay que bajarla y
 * volver a subirla a mano, y por eso nunca se hace.
 *
 * Sólo para lo que mandó el cliente: guardar en su ficha algo que le mandamos
 * nosotros no es documentación suya.
 */
function AFicha({
  mensaje: m,
  oportunidadId,
  mio,
  onGuardado,
}: {
  mensaje: Mensaje;
  oportunidadId: number | null;
  mio: boolean;
  onGuardado: () => void;
}) {
  const [estado, setEstado] = useState<"listo" | "yendo" | "guardado">("listo");
  const [error, setError] = useState<string | null>(null);

  if (mio || oportunidadId == null || !m.mediaRuta) return null;

  const guardar = async () => {
    setEstado("yendo");
    setError(null);
    const r = await guardarEnFicha(m.id, oportunidadId);
    if (!r.ok) {
      setEstado("listo");
      setError(r.error);
      return;
    }
    setEstado("guardado");
    onGuardado();
  };

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={() => void guardar()}
        disabled={estado !== "listo"}
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: estado === "guardado" ? T.muted : T.ink,
          textDecoration: estado === "guardado" ? "none" : "underline",
          cursor: estado === "listo" ? "pointer" : "default",
        }}
      >
        {estado === "yendo"
          ? "Guardando…"
          : estado === "guardado"
            ? "✓ Guardado en la ficha"
            : "Guardar en la ficha"}
      </button>
      {error && (
        <span style={{ display: "block", fontSize: 10.5, color: T.warn, lineHeight: 1.4 }}>
          {error}
        </span>
      )}
    </div>
  );
}
