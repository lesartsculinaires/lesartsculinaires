"use client";

import { TODAY } from "@/data/calendario";
import { eventCount, hora } from "@/lib/format";
import { useCatalog } from "@/lib/catalog";
import {
  badgeStyle,
  dayLabel,
  dowLabel,
  estadoTone,
  type EventoVista,
} from "@/lib/calendar";
import { T } from "@/lib/theme";

interface Props {
  /** First day of the agenda run. */
  from: number;
  accent: string;
  ofDay: (i: number) => EventoVista[];
  onOpen: (id: string) => void;
}

/** Look this far ahead, then show at most this many days that have events. */
const LOOKAHEAD_DAYS = 14;
const MAX_DAYS = 6;

export function AgendaView({ from, accent, ofDay, onOpen }: Props) {
  const { tipos } = useCatalog();
  const days = Array.from({ length: LOOKAHEAD_DAYS }, (_, k) => from + k)
    .filter((i) => i <= 62 && ofDay(i).length)
    .slice(0, MAX_DAYS);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {days.map((i, k) => (
        <div
          key={i}
          style={{
            padding: "15px 18px",
            borderTop: k ? `1px solid ${T.border}` : "none",
            background: i === TODAY ? "#FCFBF9" : "transparent",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span
              className="dsp"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: i === TODAY ? accent : T.ink,
              }}
            >
              {dowLabel(i)} {dayLabel(i)}
              {i === TODAY ? " · hoy" : ""}
            </span>
            <span style={{ fontSize: 11.5, color: T.faint }}>
              {eventCount(ofDay(i).length)}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {ofDay(i).map((e) => {
              const [fg, bg] = estadoTone(e.estado, accent);
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: T.paper,
                  }}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 11.5, color: T.muted, width: 44, textAlign: "left" }}
                  >
                    {hora(e.h)}
                  </span>
                  <span className="mono" style={badgeStyle(tipos[e.t], 18)}>
                    {tipos[e.t].code}
                  </span>
                  <span style={{ minWidth: 0, textAlign: "left" }}>
                    <span style={{ display: "block", fontSize: 13 }}>{e.leadName}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: T.faint }}>
                      {tipos[e.t].label} · {e.programa}
                    </span>
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      flexShrink: 0,
                      fontSize: 11,
                      padding: "3px 9px",
                      borderRadius: 20,
                      background: bg,
                      color: fg,
                    }}
                  >
                    {e.estado}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
