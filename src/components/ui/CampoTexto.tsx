"use client";

import { useRef, type CSSProperties } from "react";

import { TecladoAcentos } from "@/components/ui/TecladoAcentos";
import { revisarNombre } from "@/lib/texto";
import { T } from "@/lib/theme";

interface Props {
  valor: string;
  onCambio: (v: string) => void;
  /** Un `textarea` en vez de un `input`. */
  multilinea?: boolean;
  filas?: number;
  placeholder?: string;
  autoFocus?: boolean;
  estilo?: CSSProperties;
  accent: string;
  /** Muestra el botón de capitalizar y el aviso de ortografía. */
  esNombre?: boolean;
  onEnter?: () => void;
  onBlur?: () => void;
}

/**
 * Campo de texto con teclado de acentos.
 *
 * Muchos equipos trabajan en teclados sin tildes ni eñes a mano, y el
 * resultado son nombres escritos "Penaloza" o "MARIA JOSE" que después no
 * coinciden con nada al buscarlos. Los botones ponen el carácter en la
 * posición del cursor, sin obligar a aprender combinaciones de teclas.
 */
export function CampoTexto({
  valor,
  onCambio,
  multilinea = false,
  filas = 3,
  placeholder,
  autoFocus,
  estilo,
  accent,
  esNombre = false,
  onEnter,
  onBlur,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const base: CSSProperties = {
    width: "100%",
    padding: multilinea ? "9px 10px" : "0 10px",
    height: multilinea ? undefined : 34,
    fontSize: 13,
    fontFamily: "inherit",
    lineHeight: multilinea ? 1.5 : undefined,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    background: T.surface,
    color: T.ink,
    resize: multilinea ? "vertical" : undefined,
    ...estilo,
  };

  const aviso = esNombre ? revisarNombre(valor) : null;

  return (
    <div>
      {multilinea ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          rows={filas}
          value={valor}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onCambio(e.target.value)}
          onBlur={onBlur}
          style={base}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={valor}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onCambio(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          style={base}
        />
      )}

      <div style={{ marginTop: 6 }}>
        <TecladoAcentos
          campo={ref}
          valor={valor}
          onCambio={onCambio}
          accent={accent}
          conCapitalizar={esNombre}
        />
      </div>

      {aviso && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: T.warn }}>
          {aviso} Podés dejarlo así si es correcto, o usar «Aa Capitalizar».
        </p>
      )}
    </div>
  );
}
