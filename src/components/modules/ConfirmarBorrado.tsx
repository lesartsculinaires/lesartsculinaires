"use client";

import { useEffect, useRef } from "react";

import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  /** Los leads que se van a borrar, ya resueltos a fichas. */
  leads: Oportunidad[];
  borrando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

/**
 * «¿Seguro que querés borrar esto?», pero diciendo qué es «esto».
 *
 * ------------------------------------------------------------------------
 * POR QUÉ LISTA LOS LEADS Y NO SÓLO CUENTA
 * ------------------------------------------------------------------------
 *
 * Porque «¿Borrar 3 leads?» no se puede contestar. Entre marcar la casilla y
 * llegar acá pudo colarse una fila de más —un clic en la cabecera marca todas,
 * un filtro que cambió— y quien confirma no tiene forma de saberlo. Con los
 * nombres y los códigos a la vista, un error se ve antes de que sea
 * irreversible, que es el único momento en que sirve verlo.
 *
 * Por lo mismo se muestra la plata: borrar un lead con una venta cerrada
 * encima casi nunca es lo que alguien quiso hacer, y es la señal más barata de
 * que la selección está mal.
 *
 * ------------------------------------------------------------------------
 * EL BOTÓN QUE CONFIRMA NO ES EL QUE TIENE EL FOCO
 * ------------------------------------------------------------------------
 *
 * Al abrirse, el foco va a «Cancelar». Un Enter de más —que es exactamente lo
 * que pasa cuando uno viene tecleando— tiene que salir de acá sin borrar nada.
 */
export function ConfirmarBorrado({ leads, borrando, onCancelar, onConfirmar }: Props) {
  const cancelarRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelarRef.current?.focus();
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !borrando) onCancelar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [borrando, onCancelar]);

  const conPlata = leads.filter(
    (o) => Number(o.cerrada) > 0 || Number(o.reserva) > 0,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar borrado de leads"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(3, 27, 79, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onClick={() => {
        if (!borrando) onCancelar();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.28)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 10px" }}>
          <h3 className="dsp" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.ink }}>
            {leads.length === 1 ? "Borrar este lead" : `Borrar estos ${leads.length} leads`}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            Se va también su bitácora, sus adjuntos y sus pagos. La ficha del cliente
            queda. <strong style={{ color: T.warn }}>Esto no se puede deshacer.</strong>
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
          {leads.map((o) => (
            <div
              key={o.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 0",
                borderTop: `1px solid ${T.border}`,
                fontSize: 12.5,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="mono" style={{ color: T.faint }}>{o.codigo}</span>{" "}
                <span style={{ color: T.ink }}>{o.cliente}</span>
                <span style={{ color: T.muted }}> · {o.etapa}</span>
              </span>
              {(Number(o.cerrada) > 0 || Number(o.reserva) > 0) && (
                <span style={{ color: T.warn, whiteSpace: "nowrap", fontWeight: 600 }}>
                  con plata
                </span>
              )}
            </div>
          ))}
        </div>

        {conPlata.length > 0 && (
          <p
            style={{
              margin: 0,
              padding: "10px 18px",
              background: "#FFF6D6",
              color: "#8A5200",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            ⚠ {conPlata.length === 1 ? "Uno tiene" : `${conPlata.length} tienen`} reserva o venta
            cerrada. Revisá que sea lo que querés borrar.
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 18px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <button
            ref={cancelarRef}
            type="button"
            onClick={onCancelar}
            disabled={borrando}
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 13,
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.ink,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={borrando}
            style={{
              height: 34,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 7,
              border: "none",
              background: "#B85042",
              color: "#fff",
              cursor: borrando ? "wait" : "pointer",
            }}
          >
            {borrando ? "Borrando…" : leads.length === 1 ? "Borrar" : `Borrar ${leads.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
