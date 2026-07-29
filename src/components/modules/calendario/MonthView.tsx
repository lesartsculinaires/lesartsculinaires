"use client";

import { DOW, TODAY } from "@/data/calendario";
import { hora } from "@/lib/format";
import { useCatalog } from "@/lib/catalog";
import {
  acadOf,
  badgeStyle,
  md,
  type EventoVista,
} from "@/lib/calendar";
import { T, softer } from "@/lib/theme";

interface Props {
  /** Index of the first cell — the Monday on or before the 1st of the month. */
  gridStart: number;
  month: number;
  accent: string;
  ofDay: (i: number) => EventoVista[];
  onOpen: (id: string) => void;
}

/** Fixed 5-week grid; days outside the current month render greyed. */
const CELLS = 35;
/** Events beyond this per cell collapse into a "+N más" line. */
const MAX_PER_CELL = 2;

export function MonthView({ gridStart, month, accent, ofDay, onOpen }: Props) {
  const { tipos, programas } = useCatalog();
  const soft = softer(accent);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          background: T.paper,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {DOW.map((d) => (
          <span
            key={d}
            className="mono"
            style={{
              padding: "8px 10px",
              fontSize: 10,
              letterSpacing: "0.08em",
              color: T.muted,
              textTransform: "uppercase",
            }}
          >
            {d}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {Array.from({ length: CELLS }, (_, k) => {
          const i = gridStart + k;
          const valid = i >= 1 && i <= 62;
          const inMonth = valid && md(i).m === month;
          const evs = valid ? ofDay(i) : [];
          const isToday = i === TODAY;

          return (
            <div
              key={k}
              style={{
                minHeight: 96,
                padding: "7px 8px",
                borderTop: `1px solid ${T.border}`,
                borderRight: (k + 1) % 7 ? `1px solid ${T.border}` : "none",
                background: !inMonth ? "#FAF9F7" : isToday ? soft : T.surface,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    fontWeight: isToday ? 500 : 400,
                    color: !inMonth ? T.faint : isToday ? accent : T.ink,
                  }}
                >
                  {valid ? md(i).d : ""}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    lineHeight: 1.2,
                    textAlign: "right",
                    color: T.faint,
                    maxWidth: "72%",
                  }}
                >
                  {inMonth ? acadOf(i, programas) : ""}
                </span>
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}
              >
                {evs.slice(0, MAX_PER_CELL).map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onOpen(e.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      width: "100%",
                      textAlign: "left",
                      padding: "2px 0",
                    }}
                  >
                    <span className="mono" style={badgeStyle(tipos[e.t], 16)}>
                      {tipos[e.t].code}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: T.muted }}>
                      {hora(e.h)}
                    </span>
                    <span
                      style={{
                        minWidth: 0,
                        fontSize: 10.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: e.estado === "Pendiente" ? T.ink : T.faint,
                      }}
                    >
                      {e.leadName}
                    </span>
                  </button>
                ))}
                {evs.length > MAX_PER_CELL && (
                  <span style={{ fontSize: 10.5, color: T.faint }}>
                    +{evs.length - MAX_PER_CELL} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
