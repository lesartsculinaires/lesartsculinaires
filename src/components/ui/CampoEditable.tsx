"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { TecladoAcentos } from "@/components/ui/TecladoAcentos";
import { T } from "@/lib/theme";

type Tipo = "texto" | "fecha" | "monto";

interface Props {
  label: string;
  /** Current stored value. Empty string renders as the placeholder. */
  value: string;
  tipo?: Tipo;
  accent: string;
  placeholder?: string;
  /** Blocks clearing the field; use for `not null` columns. */
  requerido?: boolean;
  /** Called on blur or Enter, only when the value actually changed. */
  onGuardar: (nuevo: string) => void;
  /** Muestra el teclado de tildes mientras se edita. Para texto libre. */
  acentos?: boolean;
  /** Agrega el botón de capitalizar. Para nombres propios. */
  esNombre?: boolean;
}

/**
 * One inline-editable row.
 *
 * Commits on blur or Enter and only when the value changed, so tabbing through
 * the drawer does not fire a write per field. Escape restores the stored value.
 */
export function CampoEditable({
  label,
  value,
  tipo = "texto",
  accent,
  placeholder,
  requerido = false,
  onGuardar,
  acentos = false,
  esNombre = false,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [focus, setFocus] = useState(false);

  // Follow the stored value when it changes elsewhere — a rename from another
  // opportunity of the same client, or a server refresh.
  useEffect(() => {
    if (!focus) setDraft(value);
  }, [value, focus]);

  const vacioInvalido = requerido && draft.trim() === "";

  const commit = () => {
    setFocus(false);
    const limpio = tipo === "monto" ? draft.replace(/[^0-9.]/g, "") : draft.trim();
    if (vacioInvalido) {
      setDraft(value);
      return;
    }
    if (limpio === value) return;
    onGuardar(limpio);
  };

  const input: CSSProperties = {
    width: "100%",
    height: 30,
    padding: "0 8px",
    font: "inherit",
    fontSize: 13,
    textAlign: tipo === "texto" ? "left" : "right",
    color: T.ink,
    border: `1px solid ${vacioInvalido ? "#B85042" : focus ? accent : "transparent"}`,
    borderRadius: 6,
    background: focus ? T.surface : "transparent",
    outline: "none",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        padding: "5px 8px 5px 13px",
      }}
    >
      <span style={{ fontSize: 12, color: T.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, maxWidth: tipo === "texto" ? "62%" : 150 }}>
        <input
          ref={ref}
          type={tipo === "fecha" ? "date" : "text"}
          inputMode={tipo === "monto" ? "decimal" : undefined}
          value={draft}
          placeholder={placeholder ?? "—"}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(value);
              setFocus(false);
              e.currentTarget.blur();
            }
          }}
          className={tipo === "texto" ? undefined : "mono"}
          style={input}
        />
        {acentos && focus && (
          <div style={{ marginTop: 6 }}>
            <TecladoAcentos
              campo={ref}
              valor={draft}
              onCambio={setDraft}
              accent={accent}
              conCapitalizar={esNombre}
            />
          </div>
        )}
      </span>
    </div>
  );
}
