"use client";

import type { CSSProperties } from "react";

import type { Area } from "@/data/area";
import { modulesFor } from "@/data/area";
import { T, soft } from "@/lib/theme";

interface Props {
  area: Area;
  accent: string;
  mod: string;
  onSelect: (mod: string) => void;
  onLogout: () => void;
}

export function Sidebar({ area, accent, mod, onSelect, onLogout }: Props) {
  const navStyle = (label: string): CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    marginBottom: 2,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.3,
    background: mod === label ? soft(accent) : "transparent",
    color: mod === label ? accent : T.muted,
  });

  return (
    <aside
      style={{
        width: 230,
        flexShrink: 0,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        padding: 16,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <p
        className="mono"
        style={{
          margin: "0 0 14px",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Les Arts Culinaires
      </p>

      <div
        style={{
          background: soft(accent),
          color: accent,
          borderRadius: 9,
          padding: "11px 12px",
        }}
      >
        <p
          className="mono"
          style={{
            margin: "0 0 3px",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          Sesión activa
        </p>
        <p className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {area.label}
        </p>
        <p className="mono" style={{ margin: "2px 0 0", fontSize: 10, opacity: 0.8 }}>
          {area.email}
        </p>
      </div>

      <p
        className="mono"
        style={{
          margin: "18px 0 6px",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Módulos
      </p>
      <nav style={{ flex: 1 }}>
        {modulesFor(area).map((m) => (
          <button
            type="button"
            key={m}
            className="nav"
            onClick={() => onSelect(m)}
            style={navStyle(m)}
          >
            {m}
          </button>
        ))}
      </nav>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          borderTop: `1px solid ${T.border}`,
          marginTop: 16,
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          className="nav"
          onClick={() => onSelect("Configuración")}
          style={{ ...navStyle("Configuración"), marginBottom: 0 }}
        >
          Configuración
        </button>
        <button
          type="button"
          onClick={onLogout}
          style={{
            textAlign: "left",
            padding: "8px 10px",
            fontSize: 13,
            color: T.faint,
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
