"use client";

import { useEffect, useState } from "react";

import { carteraDe, traspasarCartera, type Cartera } from "@/app/vendedores-actions";
import { T } from "@/lib/theme";
import type { Vendedor } from "@/lib/types";

interface Props {
  de: Vendedor;
  /** A quiénes se le puede pasar: los activos, menos la misma persona. */
  candidatas: Vendedor[];
  accent: string;
  onCerrar: () => void;
  onHecho: () => void;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/**
 * Pasar la cartera de una persona a otra.
 *
 * Primero muestra qué se va a mover —contado en el momento, no lo que vio la
 * pantalla hace un rato— y recién con el clic lo mueve todo junto.
 */
export function TraspasarCartera({ de, candidatas, accent, onCerrar, onHecho }: Props) {
  const [cartera, setCartera] = useState<Cartera | null>(null);
  const [a, setA] = useState<number | "">("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<Cartera | null>(null);

  useEffect(() => {
    let vigente = true;
    void carteraDe(de.id).then((c) => {
      if (vigente) setCartera(c);
    });
    return () => {
      vigente = false;
    };
  }, [de.id]);

  const vacia = cartera != null && cartera.leads + cartera.conversaciones + cartera.citas === 0;
  const destino = candidatas.find((x) => x.id === a);

  const traspasar = async () => {
    if (a === "") return;
    setTrabajando(true);
    setError(null);
    const r = await traspasarCartera(de.id, a);
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setListo(r.movido ?? { leads: 0, conversaciones: 0, citas: 0 });
    onHecho();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Traspasar la cartera de ${de.nombre}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(3, 27, 79, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !trabajando) onCerrar();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: "0 18px 48px rgba(3, 27, 79, 0.22)",
          padding: "18px 20px",
        }}
      >
        <h2 className="dsp" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
          Traspasar la cartera de {de.nombre}
        </h2>

        {listo ? (
          <>
            <p data-traspaso-listo style={{ margin: "8px 0 14px", fontSize: 13, color: T.ink, lineHeight: 1.55 }}>
              Listo: {destino?.nombre ?? "la nueva asesora"} recibió{" "}
              {n(listo.leads, "lead abierto", "leads abiertos")},{" "}
              {n(listo.conversaciones, "chat", "chats")} y {n(listo.citas, "cita", "citas")}. Ya
              aparecen en su Pipeline, su Inbox, Clientes y el Dashboard.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onCerrar} style={{ ...BOTON, background: accent, color: "#fff" }}>
                Cerrar
              </button>
            </div>
          </>
        ) : cartera == null ? (
          <p style={{ margin: "8px 0 14px", fontSize: 12.5, color: T.muted }}>Viendo qué tiene a su nombre…</p>
        ) : vacia ? (
          <>
            <p style={{ margin: "8px 0 14px", fontSize: 12.5, color: T.muted }}>
              No tiene leads abiertos, chats ni citas por venir. No hay nada que traspasar.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onCerrar} style={BOTON}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
              Se le pasa todo junto a la persona que elijas:
            </p>
            <ul data-cartera style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5, color: T.ink, lineHeight: 1.7 }}>
              <li>{n(cartera.leads, "lead abierto", "leads abiertos")}</li>
              <li>{n(cartera.conversaciones, "chat del Inbox", "chats del Inbox")}</li>
              <li>{n(cartera.citas, "cita por venir", "citas por venir")}</li>
            </ul>
            <p style={{ margin: "0 0 12px", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
              Los leads ya ganados o perdidos se quedan con {de.nombre}: son su historia y cuentan en
              sus números de cada mes. Cada cambio queda en el historial del lead.
            </p>

            <label htmlFor="traspaso-a" style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>
              Pasarle la cartera a
            </label>
            <select
              id="traspaso-a"
              value={a}
              onChange={(e) => setA(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={trabajando}
              style={{
                width: "100%",
                height: 36,
                font: "inherit",
                fontSize: 13,
                padding: "0 10px",
                border: `1px solid ${T.border}`,
                borderRadius: 7,
                background: T.surface,
                color: T.ink,
                marginBottom: 12,
              }}
            >
              <option value="">Elegí a alguien…</option>
              {candidatas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>

            {error && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.warn, lineHeight: 1.45 }}>{error}</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
              <button type="button" onClick={onCerrar} disabled={trabajando} style={BOTON}>
                Cancelar
              </button>
              <button
                type="button"
                data-traspasar
                onClick={() => void traspasar()}
                disabled={trabajando || a === ""}
                style={{
                  ...BOTON,
                  fontWeight: 600,
                  border: "none",
                  background: a === "" ? T.border : accent,
                  color: "#fff",
                  cursor: trabajando ? "wait" : a === "" ? "not-allowed" : "pointer",
                }}
              >
                {trabajando ? "Un momento…" : destino ? `Pasarle todo a ${destino.nombre}` : "Traspasar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const BOTON: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  fontSize: 13,
  borderRadius: 7,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
};
