"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

import { signOut } from "@/app/actions";
import { getBrowserClient } from "@/lib/supabase/browser";
import { T, soft } from "@/lib/theme";

export const MODULOS = [
  "Dashboard",
  "Clientes",
  "Pipeline",
  "Calendario",
  "Equipos",
  "Programas",
] as const;

interface Props {
  accent: string;
  mod: string;
  userEmail: string;
  onSelect: (mod: string) => void;
}

export function Sidebar({ accent, mod, userEmail, onSelect }: Props) {
  const router = useRouter();

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

  const cerrarSesion = async () => {
    // Clear the browser copy of the session as well as the server cookie,
    // otherwise the client would keep a stale token in memory.
    await getBrowserClient().auth.signOut();
    await signOut();
    router.replace("/login");
    router.refresh();
  };

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
          Ventas
        </p>
        <p
          className="mono"
          style={{
            margin: "2px 0 0",
            fontSize: 10,
            opacity: 0.8,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {userEmail}
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
        {MODULOS.map((m) => (
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
          borderTop: `1px solid ${T.border}`,
          marginTop: 16,
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          onClick={cerrarSesion}
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
