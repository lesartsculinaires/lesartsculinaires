"use client";

import { useState, type CSSProperties, type InputHTMLAttributes } from "react";

import { useT } from "@/lib/i18n/idioma";

/**
 * Un campo de contraseña con un ojo para mostrar lo escrito (13/11/2026).
 *
 * Pedido: en el inicio de sesión, para que la persona vea si está escribiendo
 * bien la contraseña; y en Usuarios y Roles (sólo administración), al crear
 * una cuenta o ponerle una contraseña nueva a alguien.
 *
 * Empieza oculta. El ojo sólo muestra lo que se está escribiendo en ESTE
 * campo: las contraseñas ya guardadas no se pueden ver, porque Supabase guarda
 * sólo su huella cifrada, no la contraseña.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Ocupa todo el ancho (como en el login). Si no, el ancho lo da `style.width`. */
  bloque?: boolean;
};

export function CampoClave({ bloque = false, style, ...resto }: Props) {
  const t = useT();
  const [ver, setVer] = useState(false);
  const caja: CSSProperties = {
    position: "relative",
    display: bloque ? "block" : "inline-block",
    width: bloque ? "100%" : style?.width,
  };

  return (
    <span style={caja}>
      <input
        {...resto}
        type={ver ? "text" : "password"}
        data-campo-clave
        style={{ ...style, width: "100%", paddingRight: 40, boxSizing: "border-box" }}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? t("Ocultar contraseña") : t("Mostrar contraseña")}
        aria-pressed={ver}
        title={ver ? t("Ocultar contraseña") : t("Mostrar contraseña")}
        data-ver-clave
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          width: 32,
          height: 28,
          display: "grid",
          placeItems: "center",
          padding: 0,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: "#6B7488",
          cursor: "pointer",
        }}
      >
        {ver ? <OjoTachado /> : <Ojo />}
      </button>
    </span>
  );
}

function Ojo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OjoTachado() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6C3.6 8.6 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
