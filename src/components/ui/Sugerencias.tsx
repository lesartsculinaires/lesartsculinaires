"use client";

import { T } from "@/lib/theme";
import type { PromocionUsada } from "@/lib/promociones";

interface Props {
  opciones: readonly PromocionUsada[];
  /** Texto actual, para marcar cuál está elegida. */
  valor: string;
  onElegir: (texto: string) => void;
  accent: string;
}

/**
 * Promociones ya usadas, para repetir una con un clic.
 *
 * No roban el foco: en el panel de cliente el campo guarda al perderlo, y un
 * clic que primero desenfoca dispararía un guardado a medio camino.
 */
export function Sugerencias({ opciones, valor, onElegir, accent }: Props) {
  if (opciones.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.faint, marginRight: 2 }}>Ya usadas:</span>
      {opciones.map((o) => {
        const elegida = valor.trim() === o.texto;
        return (
          <button
            key={o.texto}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onElegir(elegida ? "" : o.texto)}
            title={
              elegida
                ? "Quitar"
                : `Usada en ${o.veces} ${o.veces === 1 ? "oportunidad" : "oportunidades"}`
            }
            style={{
              padding: "3px 9px",
              fontSize: 11.5,
              lineHeight: 1.35,
              borderRadius: 20,
              border: `1px solid ${elegida ? accent : T.border}`,
              background: elegida ? accent : T.surface,
              color: elegida ? "#fff" : T.muted,
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
