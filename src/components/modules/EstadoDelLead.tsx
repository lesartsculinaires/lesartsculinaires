"use client";

import { useState } from "react";

import { updateOportunidad } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { estadoTone } from "@/lib/selectors";
import { T } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

/**
 * En qué anda la venta, dentro de la bandeja.
 *
 * ESTO NO ES UNA ETIQUETA, Y ES A PROPÓSITO
 *
 * «Negociación», «Ganado» y «Perdido» ya existen en el CRM: son la etapa y el
 * estado de la oportunidad, y de ahí salen todas las métricas del tablero. Si
 * además fueran etiquetas de la bandeja, habría dos versiones del mismo dato y
 * tarde o temprano dirían cosas distintas —la conversación marcada Ganado y la
 * oportunidad en Negociación— sin manera de saber cuál vale.
 *
 * Así que la bandeja no las copia: muestra las de verdad y las deja cambiar
 * desde acá. Cambiarlas acá es exactamente lo mismo que cambiarlas en la ficha,
 * porque es la misma fila.
 */
export function EstadoDelLead({
  oportunidad: o,
  accent,
  onCambio,
  onVerFicha,
}: {
  oportunidad: Oportunidad;
  accent: string;
  onCambio: () => void;
  onVerFicha: () => void;
}) {
  const cat = useCatalogo();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = async (columna: "etapa_id" | "estado_id", valor: number) => {
    setGuardando(columna);
    setError(null);
    const r = await updateOportunidad(o.id, { [columna]: valor });
    setGuardando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCambio();
  };

  const [fg, bg] = estadoTone(o.estado, accent);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
      <Selector
        etiqueta="Etapa"
        valor={o.etapaId}
        items={cat.etapas}
        cargando={guardando === "etapa_id"}
        onElegir={(v) => void cambiar("etapa_id", v)}
      />

      <Selector
        etiqueta="Estado"
        valor={o.estadoId}
        items={cat.estados}
        cargando={guardando === "estado_id"}
        color={{ fg, bg }}
        onElegir={(v) => void cambiar("estado_id", v)}
      />

      <button
        type="button"
        onClick={onVerFicha}
        style={{ fontSize: 11.5, color: accent, whiteSpace: "nowrap" }}
      >
        Ver ficha ›
      </button>

      {error && <span style={{ fontSize: 11, color: T.warn }}>{error}</span>}
    </div>
  );
}

function Selector({
  etiqueta,
  valor,
  items,
  cargando,
  color,
  onElegir,
}: {
  etiqueta: string;
  valor: number | null;
  items: readonly { id: number; nombre: string }[];
  cargando: boolean;
  color?: { fg: string; bg: string };
  onElegir: (id: number) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", color: T.faint }}>
        {etiqueta}
      </span>
      <select
        value={valor ?? ""}
        disabled={cargando}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v) onElegir(v);
        }}
        style={{
          height: 24,
          padding: "0 6px",
          fontSize: 11.5,
          fontWeight: 600,
          borderRadius: 6,
          border: `1px solid ${color?.fg ?? T.border}`,
          background: color?.bg ?? T.surface,
          color: color?.fg ?? T.ink,
          cursor: cargando ? "wait" : "pointer",
        }}
      >
        <option value="">—</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.nombre}</option>
        ))}
      </select>
    </label>
  );
}
