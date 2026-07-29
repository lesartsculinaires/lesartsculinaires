"use client";

import { AREAS } from "@/data/area";
import { T, soft } from "@/lib/theme";

interface Props {
  accent: string;
  onEnter: (key: string) => void;
}

/** Area picker shown before a session exists. */
export function LoginGate({ accent, onEnter }: Props) {
  return (
    <div
      className="lac"
      style={{
        minHeight: "100vh",
        background: T.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <p
          className="mono"
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: T.faint,
            textTransform: "uppercase",
          }}
        >
          Les Arts Culinaires · CRM
        </p>
        <h1
          className="dsp"
          style={{ margin: "0 0 6px", fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}
        >
          Entrá al CRM
        </h1>
        <p
          style={{
            margin: "0 0 26px",
            fontSize: 14,
            color: T.muted,
            maxWidth: "46ch",
            textWrap: "pretty",
          }}
        >
          Ventas administra sus propios datos: leads, seguimiento y cierre de
          matrículas.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          {AREAS.map((a) => (
            <button
              type="button"
              key={a.key}
              className="gate"
              onClick={() => onEnter(a.key)}
              style={{
                display: "block",
                textAlign: "left",
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "18px 18px 16px",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: accent,
                  marginBottom: 14,
                }}
              />
              <span
                className="dsp"
                style={{
                  display: "block",
                  fontSize: 19,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {a.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  color: T.muted,
                  lineHeight: 1.45,
                  marginBottom: 16,
                }}
              >
                {a.scope}
              </span>
              <span
                className="mono"
                style={{
                  display: "block",
                  fontSize: 11,
                  color: T.faint,
                  marginBottom: 14,
                }}
              >
                {a.email}
              </span>
              <span
                style={{
                  display: "inline-block",
                  padding: "7px 14px",
                  fontSize: 13,
                  borderRadius: 6,
                  background: soft(accent),
                  color: accent,
                }}
              >
                Iniciar sesión
              </span>
            </button>
          ))}
        </div>

        <p style={{ margin: "22px 0 0", fontSize: 12, color: T.faint }}>
          ¿Problemas para entrar? Escribí a sistemas@lesarts.com
        </p>
      </div>
    </div>
  );
}
