"use client";

import { enCastellano } from "@/lib/supabase/enCastellano";
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
    /*
     * El botón de recargar aparece sólo cuando recargar sirve.
     *
     * Es el caso más común y el más confuso: la pestaña quedó abierta desde
     * antes del último despliegue, el servidor ya no entiende lo que le pide, y
     * el aviso decía «todavía no está guardado» sin ofrecer ninguna salida.
     * Quien lo leía se quedaba mirando, o recargaba por intuición.
     *
     * Para los demás errores no se ofrece: recargar no arregla que el servidor
     * haya dicho que no, y un botón que no sirve enseña a ignorarlo.
     */
    const conviene = /Recargá y seguí/.test(syncError);
    return (
      <div style={{ ...BOX, background: "#F7EBE9", color: "#8C3B2F" }}>
        <span>
          No se pudo guardar el último cambio. {syncError}
          {!conviene && " Lo que ves sigue actualizado, pero todavía no está guardado."}
          {conviene && (
            <button
              type="button"
              data-recargar-crm
              onClick={() => window.location.reload()}
              style={{
                marginLeft: 10,
                padding: "2px 10px",
                borderRadius: 6,
                border: "1px solid #D8B4AC",
                background: "#fff",
                color: "#8C3B2F",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Recargar
            </button>
          )}
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
    /*
     * Traducido, porque lo lee una asesora y no quien mantiene la base.
     *
     * «JWT issued at future» en una barra amarilla no dice qué pasó, si se
     * perdió algo ni qué hacer: deja a la persona mirando cero leads y
     * pensando que se borraron. Lo que cuesta eso no es el susto, es el rato
     * que se pierde revisando y la desconfianza que queda después.
     */
    const explicado = enCastellano(loadError);
    return (
      <div style={{ ...BOX, background: "#F6EEDC", color: "#7A5A12" }}>
        <span>No se pudieron cargar los datos. {explicado?.texto}</span>
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
