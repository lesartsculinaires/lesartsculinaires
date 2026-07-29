"use client";

import { T } from "@/lib/theme";

interface Props {
  /** False when the seed data is being shown instead of Supabase. */
  live: boolean;
  /** Set when the initial server-side read failed. */
  loadError: string | null;
  /** Set when a background write failed. */
  syncError: string | null;
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

/**
 * Tells the user which data source is in play. Silent in the normal case —
 * connected to Supabase with no failures — so it never becomes wallpaper.
 */
export function SyncBanner({ live, loadError, syncError, onDismiss }: Props) {
  if (syncError) {
    return (
      <div style={{ ...BOX, background: "#F7EBE9", color: "#8C3B2F" }}>
        <span>
          No se pudo guardar el último cambio en Supabase: {syncError}. Lo que ves
          en pantalla sigue actualizado, pero todavía no está guardado.
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
        <span>
          Supabase está configurado pero la consulta falló: {loadError}. Se están
          mostrando los datos de ejemplo.
        </span>
      </div>
    );
  }

  if (!live) {
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
          Datos de ejemplo. Definí NEXT_PUBLIC_SUPABASE_URL y
          NEXT_PUBLIC_SUPABASE_ANON_KEY en <code>.env.local</code> para conectar
          la base real.
        </span>
      </div>
    );
  }

  return null;
}
