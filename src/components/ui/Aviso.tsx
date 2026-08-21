"use client";

import { useEffect } from "react";

import { T } from "@/lib/theme";

/**
 * El aviso que confirma que algo se guardó.
 *
 * Flota sobre la pantalla, abajo a la derecha, y se va solo. Es distinto del
 * panel de «listo» que reemplaza al formulario: ese contesta «¿y ahora qué?»,
 * y éste contesta «¿de verdad se guardó?». La diferencia importa cuando se
 * cargan veinte leads seguidos en una feria, porque el aviso sigue ahí
 * mientras ya se está tecleando el siguiente —que es justo el momento en que
 * uno duda si el anterior entró—.
 *
 * QUÉ PRUEBA
 *
 * El código que muestra lo asigna la base al guardar, no el navegador. Que
 * haya un código es la prueba de que la fila existe: si el guardado hubiera
 * fallado, no habría número que mostrar.
 */
export function Aviso({
  texto,
  detalle,
  accion,
  onCerrar,
  /** Cuánto queda antes de irse solo. En cero, se queda hasta que lo cierren. */
  duracionMs = 9000,
}: {
  texto: string;
  detalle?: string;
  accion?: { texto: string; onClick: () => void };
  onCerrar: () => void;
  duracionMs?: number;
}) {
  useEffect(() => {
    if (duracionMs <= 0) return;
    const id = window.setTimeout(onCerrar, duracionMs);
    return () => window.clearTimeout(id);
  }, [duracionMs, onCerrar]);

  return (
    <div
      // `status` y no `alert`: es una confirmación de algo que salió bien, y
      // un lector de pantalla no tiene por qué interrumpir lo que esté
      // leyendo para decirla.
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 120,
        maxWidth: "calc(100vw - 40px)",
        display: "flex",
        alignItems: "flex-start",
        gap: 11,
        padding: "13px 15px",
        borderRadius: 10,
        border: "1px solid #2F6B4F",
        background: "#EAF2ED",
        boxShadow: "0 14px 34px rgba(3, 27, 79, 0.18)",
      }}
    >
      <Tilde />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#2F6B4F" }}>{texto}</p>
        {detalle && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: T.muted, lineHeight: 1.45 }}>
            {detalle}
          </p>
        )}
        {accion && (
          <button
            type="button"
            onClick={accion.onClick}
            style={{
              marginTop: 7,
              padding: 0,
              fontSize: 12.5,
              fontWeight: 600,
              color: "#2F6B4F",
              textDecoration: "underline",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {accion.texto}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar el aviso"
        style={{
          marginLeft: 4,
          width: 22,
          height: 22,
          flexShrink: 0,
          fontSize: 12,
          lineHeight: 1,
          borderRadius: 5,
          color: T.muted,
          background: "transparent",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function Tilde() {
  return (
    <span
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: "50%",
        background: "#2F6B4F",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
