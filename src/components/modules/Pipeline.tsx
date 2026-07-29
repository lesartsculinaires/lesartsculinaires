"use client";

import { ETAPAS, ETAPA_DESC, LOST } from "@/data/taxonomia";
import { leadCount, money } from "@/lib/format";
import { T, soft } from "@/lib/theme";
import type { Cliente, ClientePatch, Estado, Etapa } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  accent: string;
  drag: string | null;
  over: string | null;
  onSetDrag: (id: string | null) => void;
  onSetOver: (stage: string | null) => void;
  onPatch: (id: string, patch: ClientePatch) => void;
}

/**
 * Stages that also imply a status change when a card lands in them. Stages
 * absent from this map leave `estado` untouched.
 */
const ESTADO_AL_SOLTAR: Partial<Record<Etapa, Estado>> = {
  Ganado: "Ganado",
  "Perdido / dormido": "Perdido",
  "Reserva de cupo": "Reserva",
};

export function Pipeline({
  clientes,
  accent,
  drag,
  over,
  onSetDrag,
  onSetOver,
  onPatch,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(172px, 1fr)",
        gap: 10,
        alignItems: "start",
        overflowX: "auto",
        paddingBottom: 6,
      }}
    >
      {ETAPAS.map((label) => {
        const inStage = clientes.filter((c) => c.etapa === label);
        const isOver = over === label;
        const lost = label === LOST;
        const tone = lost ? "#B85042" : label === "Ganado" ? "#2F6B4F" : accent;

        return (
          <div key={label}>
            <div
              style={{
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: `2px solid ${tone}`,
              }}
            >
              <span
                style={{ display: "block", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}
              >
                {label}
              </span>
              <span
                style={{
                  display: "block",
                  margin: "2px 0 0",
                  fontSize: 10.5,
                  color: T.faint,
                  lineHeight: 1.25,
                }}
              >
                {ETAPA_DESC[label]}
              </span>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 3,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: T.muted }}>
                  {leadCount(inStage.length)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: inStage.length ? (lost ? T.muted : T.ink) : T.faint,
                  }}
                >
                  {money(inStage.reduce((a, c) => a + (c.valor || 0), 0))}
                </span>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== label) onSetOver(label);
              }}
              onDragLeave={() => {
                if (over === label) onSetOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = drag || e.dataTransfer.getData("text/plain");
                if (id) {
                  const estado = ESTADO_AL_SOLTAR[label];
                  onPatch(id, { etapa: label, ...(estado ? { estado } : {}) });
                }
                onSetDrag(null);
                onSetOver(null);
              }}
              style={{
                minHeight: 108,
                borderRadius: 9,
                padding: 5,
                margin: -5,
                background: isOver ? soft(accent) : "transparent",
                outline: isOver
                  ? `1px dashed ${accent}`
                  : "1px dashed transparent",
              }}
            >
              {inStage.map((c) => (
                <div
                  key={c.id}
                  className="card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    try {
                      e.dataTransfer.setData("text/plain", c.id);
                    } catch {
                      // Some browsers block setData outside a user gesture; the
                      // drag id in state covers that case.
                    }
                    onSetDrag(c.id);
                  }}
                  onDragEnd={() => {
                    onSetDrag(null);
                    onSetOver(null);
                  }}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    cursor: "grab",
                    opacity: drag === c.id ? 0.4 : 1,
                  }}
                >
                  <p style={{ margin: "0 0 4px", fontSize: 13 }}>{c.nombre}</p>
                  <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                    {c.producto} · {money(c.valor)}
                  </p>
                </div>
              ))}

              {inStage.length === 0 && (
                <p
                  style={{
                    margin: 0,
                    padding: "26px 8px",
                    textAlign: "center",
                    fontSize: 12,
                    color: isOver ? accent : T.faint,
                  }}
                >
                  Soltá una tarjeta acá
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
