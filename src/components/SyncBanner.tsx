"use client";

import { T } from "@/lib/theme";

interface Props {
  loadError: string | null;
  syncError: string | null;
  /** True when the query succeeded but returned nothing. */
  vacio: boolean;
  onDismiss: () => void;
}

const BOX = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 14px",
  marginBottom: 14,
  borderRadius: 9,
  fontSize: 12.5,
  lineHeight: 1.45,
} as const;

/** Silent when everything is healthy, so it never becomes wallpaper. */
export function SyncBanner({ loadError, syncError, vacio, onDismiss }: Props) {
  if (syncError) {
    return (
      <div style={{ ...BOX, background: "#F7EBE9", color: "#8C3B2F" }}>
        <span>
          No se pudo guardar el último cambio: {syncError}. Lo que ves sigue
          actualizado, pero todavía no está guardado.
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Descartar"
          style={{ flexShrink: 0, color: "#8C3B2F", fontSize: 14 }}
        >
          ✕
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ ...BOX, background: "#F6EEDC", color: "#7A5A12" }}>
        <span>No se pudieron cargar los datos: {loadError}</span>
      </div>
    );
  }

  if (vacio) {
    return (
      <div
        style={{
          ...BOX,
          background: T.surface,
          border: `1px dashed ${T.borderStrong}`,
          color: T.muted,
        }}
      >
        <span>
          No hay oportunidades visibles. Si esperabas ver datos, revisá que tu
          usuario tenga permiso de lectura en las políticas de Supabase.
        </span>
      </div>
    );
  }

  return null;
}
