"use client";

import type { CSSProperties } from "react";

import { signOut } from "@/app/actions";
import { getBrowserClient } from "@/lib/supabase/browser";
import { T, soft } from "@/lib/theme";

export const MODULOS = [
  "Dashboard",
  "Inbox",
  "Clientes",
  "Bases",
  "Pipeline",
  "Calendario",
  "Equipos",
  "Programas",
  "Autorizaciones",
] as const;

interface Props {
  accent: string;
  mod: string;
  userEmail: string;
  /**
   * Rol de quien entró: «Administrador», «Ventas»…
   *
   * Nulo cuando no se puede saber —faltan las tablas de roles— y entonces no
   * se dice nada, en vez de suponer uno. Antes acá había un «Ventas» escrito
   * a mano que salía igual para todos, así que un administrador leía que
   * estaba en modo ventas.
   */
  rol: string | null;
  /** Nombre de la persona, si su cuenta lo tiene cargado. */
  nombre: string | null;
  /** Extra entries the signed-in user is allowed to open, e.g. admin-only. */
  extras?: readonly string[];
  onSelect: (mod: string) => void;
}

export function Sidebar({
  accent,
  mod,
  userEmail,
  rol,
  nombre,
  extras = [],
  onSelect,
}: Props) {

  // Quién sos, con lo mejor que se sepa y sin repetir.
  const principal = rol ?? nombre ?? userEmail;
  const secundario =
    principal === userEmail ? null : rol && nombre ? `${nombre} · ${userEmail}` : userEmail;

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
    // Limpieza local del token que supabase-js guarda en memoria. Va con
    // scope "local" a propósito: no necesita red, así que no puede fallar y
    // dejar el botón sin efecto. Revocar del lado del servidor es tarea de
    // la acción de abajo, que además borra la cookie y navega.
    try {
      await getBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // Que la limpieza local falle no puede impedir cerrar la sesión.
    }
    await signOut();
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
        {/* Arriba el rol, porque es lo que dice qué se puede hacer. Si no se
            sabe, manda el nombre; y si tampoco, el correo. Nunca un valor
            inventado. */}
        <p className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {principal}
        </p>
        {/* Y abajo el correo, salvo que ya sea lo de arriba: repetirlo dos
            veces se ve a error. */}
        {secundario && (
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
            {secundario}
          </p>
        )}
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
        {[...MODULOS, ...extras].map((m) => (
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
