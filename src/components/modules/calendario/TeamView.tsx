"use client";

import { eventCount, hora } from "@/lib/format";
import { useCatalog } from "@/lib/catalog";
import { badgeStyle, type EventoVista } from "@/lib/calendar";
import { T } from "@/lib/theme";

interface Props {
  /** The single day being compared across the team. */
  day: number;
  ofDay: (i: number) => EventoVista[];
  onOpen: (id: string) => void;
}

/** One column per sales rep, showing that day's load side by side. */
export function TeamView({ day, ofDay, onOpen }: Props) {
  const { tipos, vendedores } = useCatalog();
  const dayEvents = ofDay(day);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        alignItems: "start",
      }}
    >
      {vendedores.map((v) => {
        const evs = dayEvents.filter((e) => e.vend === v.name);
        const mins = evs.reduce((a, e) => a + e.dur, 0);

        return (
          <div
            key={v.name}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: `1px solid ${T.border}`,
                background: T.paper,
              }}
            >
              <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>
                {v.name}
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
                <span style={{ fontSize: 11, color: T.muted }}>
                  {eventCount(evs.length)}
                </span>
                <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                  {Math.round((mins / 60) * 10) / 10} h
                </span>
              </div>
            </div>

            <div
              style={{ padding: 10, display: "flex", flexDirection: "column", gap: 7 }}
            >
              {evs.map((e) => (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: 8,
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${tipos[e.t].color}`,
                    opacity: e.estado === "Pendiente" ? 1 : 0.65,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <span className="mono" style={badgeStyle(tipos[e.t], 17)}>
                      {tipos[e.t].code}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: T.muted }}>
                      {hora(e.h)} · {e.dur}′
                    </span>
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, textAlign: "left" }}>
                    {e.leadName}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: T.faint,
                      textAlign: "left",
                    }}
                  >
                    {tipos[e.t].label} · {e.canal}
                  </span>
                </button>
              ))}

              {evs.length === 0 && (
                <p
                  style={{
                    margin: 0,
                    padding: "22px 8px",
                    textAlign: "center",
                    fontSize: 11.5,
                    color: T.faint,
                  }}
                >
                  Sin eventos · agenda libre
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
