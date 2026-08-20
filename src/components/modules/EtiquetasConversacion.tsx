"use client";

import { useState } from "react";

import { crearEtiqueta, marcarConversacion } from "@/app/etiquetas-actions";
import { T } from "@/lib/theme";
import type { Etiqueta } from "@/lib/types";

/** Colores para elegir. Ninguno tan claro que su texto blanco no se lea. */
const COLORES = [
  "#031B4F", "#1F6F4A", "#8A5200", "#9B2C2C",
  "#5B3E8E", "#0E6E7D", "#6B665F", "#A8541B",
];

interface Props {
  conversacionId: number;
  /** Las que ya tiene puestas esta conversación. */
  puestas: number[];
  /** El catálogo entero. */
  etiquetas: Etiqueta[];
  accent: string;
  onCambio: () => void;
}

/**
 * Las etiquetas de una conversación.
 *
 * Son de la conversación, no de la venta: acá va «pidió beca», «no contesta»,
 * «pago pendiente». La etapa y el estado del pipeline se muestran aparte y
 * salen de la oportunidad misma —a propósito, para que no haya dos versiones
 * de lo mismo que puedan discrepar.
 *
 * Crear una etiqueta nueva se hace desde acá, en el momento: obligar a ir a
 * otra pantalla a darla de alta haría que nadie las use.
 */
export function EtiquetasConversacion({
  conversacionId,
  puestas,
  etiquetas,
  accent,
  onCambio,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disponibles = etiquetas.filter((e) => e.activa || puestas.includes(e.id));
  const suyas = disponibles.filter((e) => puestas.includes(e.id));

  const alternar = async (id: number, poner: boolean) => {
    setTrabajando(true);
    setError(null);
    const r = await marcarConversacion(conversacionId, id, poner);
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCambio();
  };

  const agregar = async () => {
    const nombre = nueva.trim();
    if (!nombre) return;

    setTrabajando(true);
    setError(null);
    const r = await crearEtiqueta(nombre, color);

    if (!r.ok || !r.etiqueta) {
      setTrabajando(false);
      setError(r.error);
      return;
    }

    // Recién creada, se pone sola: nadie crea una etiqueta para no usarla.
    const puesta = await marcarConversacion(conversacionId, r.etiqueta.id, true);
    setTrabajando(false);
    if (!puesta.ok) {
      setError(puesta.error);
      return;
    }
    setNueva("");
    onCambio();
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
      {suyas.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => void alternar(e.id, false)}
          disabled={trabajando}
          title="Quitar esta etiqueta"
          className="pill"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 21,
            padding: "0 8px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 11,
            background: e.color,
            color: "#fff",
            cursor: trabajando ? "wait" : "pointer",
          }}
        >
          {e.nombre}
          <span aria-hidden style={{ opacity: 0.75, fontSize: 12 }}>×</span>
        </button>
      ))}

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setAbierto((x) => !x)}
          style={{
            height: 21,
            padding: "0 8px",
            fontSize: 11,
            borderRadius: 11,
            border: `1px dashed ${T.border}`,
            color: T.muted,
          }}
        >
          + Etiqueta
        </button>

        {abierto && (
          <>
            {/* Cierra al hacer clic en cualquier otro lado. */}
            <div
              onClick={() => setAbierto(false)}
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
            />
            <div
              style={{
                position: "absolute",
                top: 26,
                left: 0,
                zIndex: 41,
                width: 232,
                padding: 10,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 9,
                boxShadow: "0 12px 30px rgba(3, 27, 79, 0.16)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
                {disponibles.length === 0 && (
                  <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                    Todavía no hay etiquetas. Creá la primera acá abajo.
                  </p>
                )}
                {disponibles.map((e) => {
                  const activa = puestas.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => void alternar(e.id, !activa)}
                      disabled={trabajando}
                      style={{
                        height: 21,
                        padding: "0 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 11,
                        border: `1px solid ${e.color}`,
                        background: activa ? e.color : "transparent",
                        color: activa ? "#fff" : e.color,
                        cursor: trabajando ? "wait" : "pointer",
                      }}
                    >
                      {e.nombre}
                    </button>
                  );
                })}
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <input
                  value={nueva}
                  onChange={(e) => {
                    setNueva(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void agregar();
                  }}
                  placeholder="Nueva etiqueta…"
                  style={{
                    width: "100%",
                    height: 27,
                    padding: "0 7px",
                    fontSize: 12,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    background: T.surface,
                    color: T.ink,
                  }}
                />

                <div style={{ display: "flex", gap: 4, margin: "7px 0" }}>
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      style={{
                        width: 17,
                        height: 17,
                        borderRadius: "50%",
                        background: c,
                        border: c === color ? `2px solid ${T.ink}` : "none",
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void agregar()}
                  disabled={trabajando || !nueva.trim()}
                  style={{
                    width: "100%",
                    height: 28,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    background: nueva.trim() ? accent : T.border,
                    color: nueva.trim() ? "#fff" : T.faint,
                    cursor: trabajando ? "wait" : nueva.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  {trabajando ? "Un momento…" : "Crear y ponerla"}
                </button>
              </div>

              {error && (
                <p style={{ margin: "7px 0 0", fontSize: 11, color: T.warn, lineHeight: 1.4 }}>
                  {error}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {error && !abierto && (
        <span style={{ fontSize: 11, color: T.warn }}>{error}</span>
      )}
    </div>
  );
}
