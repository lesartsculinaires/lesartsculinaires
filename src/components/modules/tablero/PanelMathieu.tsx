"use client";

/**
 * El panel de Mathieu en el Dashboard (27/11/2026).
 *
 * Lo ven quienes entrenan al agente (Raquel, Alexandra) y los administradores:
 * para cualquier otra persona —o en HC, donde no hay agente— la base contesta
 * que no y el panel no aparece. El dibujo está en `VistaMathieu`.
 */
import { useEffect, useState } from "react";

import { metricasDeMathieu } from "@/app/entrenamiento-actions";
import { VistaMathieu } from "@/components/modules/tablero/VistaMathieu";
import type { MetricasMathieu } from "@/lib/agente/metricas";
import { hoyEnSalvador } from "@/lib/seguimientos";
import { primeroDelMes } from "@/lib/tablero/proyeccion";

const mesMas = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
};

export function PanelMathieu() {
  const hoy = hoyEnSalvador();
  const esteMes = primeroDelMes(hoy);
  const [mes, setMes] = useState(esteMes);
  const [m, setM] = useState<MetricasMathieu | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void metricasDeMathieu(mes)
      .then((r) => vivo && setM(r))
      .catch(() => vivo && setM(null));
    return () => {
      vivo = false;
    };
  }, [mes]);

  // Sin permiso, o sin la migración: nada.
  if (m === null) return null;
  if (m === undefined) return null;

  const boton = {
    height: 30,
    minWidth: 30,
    padding: "0 10px",
    fontSize: 13,
    borderRadius: 7,
    border: "1px solid var(--crm-border)",
    background: "var(--crm-surface)",
    color: "var(--crm-ink)",
    cursor: "pointer",
  } as const;

  return (
    <div style={{ marginBottom: 18 }}>
      <VistaMathieu
        m={m}
        cabecera={
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label="Mes anterior" onClick={() => setMes((x) => mesMas(x, -1))} style={boton}>
              ‹
            </button>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setMes((x) => mesMas(x, 1))}
              disabled={mes >= esteMes}
              style={{ ...boton, opacity: mes >= esteMes ? 0.4 : 1 }}
            >
              ›
            </button>
          </div>
        }
      />
    </div>
  );
}
