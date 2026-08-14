"use client";

import type { CSSProperties } from "react";

import { T } from "@/lib/theme";
import { listar, paraMostrar, type Pendientes } from "@/lib/cambios";

interface Props {
  pendientes: Pendientes;
  accent: string;
  /** Nombre del cliente, para que se vea sobre quién se está escribiendo. */
  cliente: string;
  guardando: boolean;
  onAceptar: () => void;
  onCancelar: () => void;
  onQuitar: (clave: string) => void;
}

/**
 * Repaso de lo que se va a guardar, antes de tocar la base.
 *
 * Muestra cada campo con su valor de antes y el de después, porque el punto
 * es poder cachar el error de dedo: ver sólo el valor nuevo no dice si es el
 * que uno quería poner.
 *
 * Cancelar no descarta nada: cierra el repaso y devuelve a la ficha con los
 * cambios puestos. Descartarlos es una decisión aparte, y va campo por campo,
 * para no perder diez ediciones buenas por una mala.
 */
export function ConfirmarCambios({
  pendientes,
  accent,
  cliente,
  guardando,
  onAceptar,
  onCancelar,
  onQuitar,
}: Props) {
  const cambios = listar(pendientes);
  if (cambios.length === 0) return null;

  const valor: CSSProperties = {
    fontSize: 12.5,
    lineHeight: 1.4,
    wordBreak: "break-word",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cambios"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCancelar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
        }}
      >
        <div style={{ padding: "18px 20px 12px" }}>
          <h2 className="dsp" style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
            Revisá antes de guardar
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            {cambios.length === 1 ? "1 cambio" : `${cambios.length} cambios`} en la ficha
            de <strong style={{ color: T.ink }}>{cliente}</strong>. Nada se guarda hasta
            que aceptes.
          </p>
        </div>

        <div
          style={{
            overflowY: "auto",
            borderTop: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {cambios.map((c) => (
            <div
              key={c.clave}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "2px 10px",
                alignItems: "start",
                padding: "11px 20px",
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <span
                style={{
                  gridColumn: "1 / -1",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: T.muted,
                }}
              >
                {c.etiqueta}
              </span>

              {/* Cada celda va colocada a mano: dejándolo al acomodo
                  automático, el botón se comía la columna del texto. */}
              <span
                style={{
                  ...valor,
                  gridColumn: 1,
                  gridRow: 2,
                  color: T.faint,
                  textDecoration: "line-through",
                }}
              >
                {paraMostrar(c.antes)}
              </span>
              <span
                style={{ ...valor, gridColumn: 1, gridRow: 3, color: T.ink, fontWeight: 500 }}
              >
                {paraMostrar(c.despues)}
              </span>
              <button
                type="button"
                onClick={() => onQuitar(c.clave)}
                disabled={guardando}
                title="Dejar este campo como estaba"
                style={{
                  gridColumn: 2,
                  gridRow: "2 / span 2",
                  alignSelf: "center",
                  justifySelf: "end",
                  whiteSpace: "nowrap",
                  fontSize: 11.5,
                  padding: "3px 9px",
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  color: T.muted,
                  background: T.surface,
                }}
              >
                Descartar
              </button>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 9,
            padding: "14px 20px",
          }}
        >
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 13,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              color: T.ink,
              background: T.surface,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onAceptar}
            disabled={guardando}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              background: accent,
              color: "#fff",
              cursor: guardando ? "wait" : "pointer",
            }}
          >
            {guardando ? "Guardando…" : "Aceptar y guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
