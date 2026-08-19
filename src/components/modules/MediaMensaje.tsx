"use client";

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
}: {
  mensaje: Mensaje;
  /** Dirección firmada, o null mientras se pide o si no se pudo. */
  url: string | null;
  mio: boolean;
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
  );
}
