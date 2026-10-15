"use client";

import { useState } from "react";

import { hoyEnElSalvador } from "@/lib/reporte";
import { T } from "@/lib/theme";

/**
 * Los dos botones del Dashboard: el reporte del día y el del mes.
 *
 * Se abren en otra pestaña para no perder el tablero, y cada uno se puede
 * imprimir, guardar en PDF o bajar para Excel. El del mes toma el mes que se
 * está mirando en el tablero; si se está mirando un año o todo el histórico,
 * el mes en curso.
 */
export function BotonesDeReporte({ periodoClave }: { periodoClave: string }) {
  const [dia, setDia] = useState(() => hoyEnElSalvador());
  const mes = /^\d{4}-\d{2}$/.test(periodoClave) ? periodoClave : hoyEnElSalvador().slice(0, 7);

  const boton = {
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 14px",
    minHeight: 40,
    borderRadius: 9,
    border: `1px solid ${T.ink}`,
    color: T.ink,
    background: "#fff",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as const;

  return (
    <div
      data-reportes
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: "0 0 18px" }}
    >
      <span style={{ fontSize: 12.5, color: T.muted }}>Reportes:</span>
      <label htmlFor="reporte-dia" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        Día del reporte
      </label>
      <input
        id="reporte-dia"
        type="date"
        value={dia}
        max={hoyEnElSalvador()}
        onChange={(e) => setDia(e.target.value || hoyEnElSalvador())}
        style={{ font: "inherit", fontSize: 13, padding: "8px 10px", border: `1px solid ${T.borderStrong}`, borderRadius: 9, color: T.ink }}
      />
      <a href={`/reporte?dia=${dia}`} target="_blank" rel="noopener" style={boton} data-reporte="dia">
        Reporte del día
      </a>
      <a href={`/reporte?mes=${mes}`} target="_blank" rel="noopener" style={boton} data-reporte="mes">
        Reporte del mes
      </a>
    </div>
  );
}
