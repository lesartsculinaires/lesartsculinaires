"use client";

import { CAL_HOURS, HOUR_ROW, TIPOS, TODAY } from "@/data/calendario";
import { eventCount, hora } from "@/lib/format";
import {
  badgeStyle,
  dayLabel,
  dowLabel,
  type EventoVista,
} from "@/lib/calendar";
import { T, softer } from "@/lib/theme";

interface Props {
  /** One entry per visible column: 5 weekdays, or a single day. */
  days: number[];
  accent: string;
  ofDay: (i: number) => EventoVista[];
  onOpen: (id: string) => void;
}

/** Under one hour an event renders as a single compact strip. */
const COMPACT_MINUTES = 60;
/** Below this block height the meta line is dropped rather than clipped. */
const META_MIN_HEIGHT = 58;

export function TimeView({ days, accent, ofDay, onOpen }: Props) {
  const soft = softer(accent);
  const columns = `48px repeat(${days.length}, minmax(0, 1fr))`;

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
          gridTemplateColumns: columns,
          borderBottom: `1px solid ${T.border}`,
          background: T.paper,
        }}
      >
        <span />
        {days.map((i, k) => {
          const evs = ofDay(i);
          return (
            <div
              key={i}
              style={{
                padding: "9px 10px",
                borderLeft: k ? `1px solid ${T.border}` : "none",
                background: i === TODAY ? soft : "transparent",
              }}
            >
              <span
                className="mono"
                style={{
                  display: "block",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: i === TODAY ? accent : T.faint,
                }}
              >
                {dowLabel(i)}
              </span>
              <span
                className="dsp"
                style={{ display: "block", margin: "2px 0", fontSize: 15, fontWeight: 500 }}
              >
                {dayLabel(i)}
              </span>
              <span style={{ fontSize: 11, color: T.faint }}>
                {evs.length ? eventCount(evs.length) : "libre"}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: columns }}>
        <div style={{ borderRight: `1px solid ${T.border}` }}>
          {CAL_HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_ROW, padding: "0 8px", textAlign: "right" }}
            >
              <span className="mono" style={{ fontSize: 10, color: T.faint }}>
                {h}:00
              </span>
            </div>
          ))}
        </div>

        {days.map((i) => (
          <div
            key={i}
            style={{
              position: "relative",
              borderLeft: `1px solid ${T.border}`,
              background: i === TODAY ? "#FCFBF9" : "transparent",
            }}
          >
            {CAL_HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_ROW, borderTop: "1px solid #EDEBE6" }} />
            ))}

            {ofDay(i).map((e) => {
              const compact = e.dur < COMPACT_MINUTES;
              const height = compact ? 26 : (e.dur / 60) * HOUR_ROW - 4;
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  style={{
                    position: "absolute",
                    left: 3,
                    right: 3,
                    textAlign: "left",
                    top: (e.h - CAL_HOURS[0]) * HOUR_ROW,
                    height,
                    display: "flex",
                    gap: 6,
                    overflow: "hidden",
                    borderRadius: 6,
                    flexDirection: compact ? "row" : "column",
                    alignItems: compact ? "center" : "stretch",
                    padding: compact ? "0 7px" : "5px 7px",
                    background: e.estado === "Pendiente" ? T.surface : T.paper,
                    border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${TIPOS[e.t].color}`,
                    opacity: e.estado === "No se presentó" ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                  >
                    <span className="mono" style={badgeStyle(e.t, 17)}>
                      {TIPOS[e.t].code}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "#5F5A53" }}>
                      {hora(e.h)}
                    </span>
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: compact ? 11 : 12,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: compact ? "1 1 auto" : "none",
                      marginTop: compact ? 0 : 2,
                    }}
                  >
                    {e.leadName}
                  </span>
                  {!compact && height >= META_MIN_HEIGHT && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: T.faint,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.canal} · {e.vend.split(" ")[0]} · {e.dur}′
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
