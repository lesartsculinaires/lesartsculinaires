"use client";

import { useEffect, type ReactNode } from "react";

import { T } from "@/lib/theme";

/**
 * La ventana que muestra un archivo en grande.
 *
 * ------------------------------------------------------------------------
 * SIRVE PARA LAS DOS DIRECCIONES
 * ------------------------------------------------------------------------
 *
 * Al recibir, para mirar el comprobante de una transferencia sin salir del
 * CRM: antes la foto se abría en una pestaña nueva, y volver al hilo era
 * cerrarla y buscar dónde había quedado la conversación.
 *
 * Al mandar, para ver qué se está por mandar. Ahí no es comodidad: elegir el
 * archivo equivocado y que salga solo, sin una pantalla de por medio, es un
 * error que no se puede deshacer —del otro lado hay un cliente que ya lo vio—.
 *
 * ------------------------------------------------------------------------
 * QUÉ SE VE DE CADA COSA
 * ------------------------------------------------------------------------
 *
 *   imagen        se ve.
 *   pdf           se ve, incrustado.
 *   audio y video se escuchan y se miran acá mismo.
 *   lo demás      no se puede mostrar, así que se dice qué es y se ofrece
 *                 abrirlo. Un visor en blanco haría pensar que el archivo
 *                 llegó roto.
 */
export function VisorArchivo({
  url,
  mime,
  nombre,
  titulo,
  pie,
  onCerrar,
}: {
  url: string;
  mime: string;
  nombre: string | null;
  /** Lo que se lee arriba: «Comprobante.pdf» o «Se va a enviar». */
  titulo: string;
  /** Los botones de abajo. En el visor a secas, ninguno. */
  pie?: ReactNode;
  onCerrar: () => void;
}) {
  // Escape cierra, como en el resto del CRM. Un visor que tapa la pantalla y
  // sólo se cierra con el ratón interrumpe a quien está escribiendo.
  useEffect(() => {
    const salir = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", salir);
    return () => document.removeEventListener("keydown", salir);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(3, 27, 79, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 820,
          maxHeight: "92vh",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 20px 56px rgba(3, 27, 79, 0.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: T.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {titulo}
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ fontSize: 18, lineHeight: 1, color: T.muted, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: 16,
            display: "grid",
            placeItems: "center",
            background: T.paper,
          }}
        >
          <Contenido url={url} mime={mime} nombre={nombre} />
        </div>

        {pie && (
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>{pie}</div>
        )}
      </div>
    </div>
  );
}

function Contenido({
  url,
  mime,
  nombre,
}: {
  url: string;
  mime: string;
  nombre: string | null;
}) {
  if (mime.startsWith("image/")) {
    // Sin `next/image` a propósito: las direcciones vienen firmadas y caducan,
    // así que el optimizador no puede cachearlas ni conoce el dominio. Y en el
    // caso de enviar, la dirección es del propio navegador.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={nombre ?? "Archivo"}
        style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 8, display: "block" }}
      />
    );
  }

  if (mime === "application/pdf") {
    return (
      <iframe
        src={url}
        title={nombre ?? "Documento"}
        style={{ width: "100%", height: "72vh", border: "none", borderRadius: 8, background: "#fff" }}
      />
    );
  }

  if (mime.startsWith("audio/")) {
    return <audio controls src={url} style={{ width: "100%" }} />;
  }

  if (mime.startsWith("video/")) {
    return (
      <video controls src={url} style={{ maxWidth: "100%", maxHeight: "72vh", borderRadius: 8 }} />
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "28px 12px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: T.ink }}>
        {nombre ?? "Archivo"}
      </p>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted }}>
        {mime || "tipo desconocido"} — no se puede ver acá dentro.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-block",
          padding: "9px 16px",
          fontSize: 12.5,
          fontWeight: 600,
          borderRadius: 7,
          border: `1px solid ${T.border}`,
          background: T.surface,
          color: T.ink,
          textDecoration: "none",
        }}
      >
        Abrirlo en una pestaña
      </a>
    </div>
  );
}
