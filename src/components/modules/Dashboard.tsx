"use client";

import { Evolucion } from "@/components/modules/Evolucion";
import { money } from "@/lib/format";
import { estaAbierta, esGanada, groupBars, totalCerrado } from "@/lib/selectors";
import { T, openTone } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
}

export function Dashboard({ oportunidades, accent }: Props) {
  const open = openTone(accent);
  const total = oportunidades.length;
  const abiertas = oportunidades.filter(estaAbierta);
  const ganadas = oportunidades.filter(esGanada);

  const metrics = [
    { label: "Oportunidades", value: String(total) },
    { label: "En pipeline", value: String(abiertas.length) },
    { label: "Venta cerrada", value: money(totalCerrado(oportunidades) || null) },
    {
      label: "Tasa de cierre",
      value: total ? `${Math.round((ganadas.length / total) * 100)}%` : "—",
    },
  ];

  const charts = [
    { title: "Vendedores", hint: "por cartera", bars: groupBars(oportunidades, "vendedor") },
    { title: "Etapas", hint: "embudo", bars: groupBars(oportunidades, "etapa") },
    { title: "Canales", hint: "origen del lead", bars: groupBars(oportunidades, "canal", 8) },
    { title: "Territorio", hint: "top 8 departamentos", bars: groupBars(oportunidades, "territorio", 8) },
    { title: "Programas", hint: "top 8 del catálogo", bars: groupBars(oportunidades, "producto", 8) },
    { title: "Estados", hint: "situación actual", bars: groupBars(oportunidades, "estado") },
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {metrics.map((m) => (
          <div key={m.label} style={{ background: T.paper, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: T.muted }}>{m.label}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <Evolucion oportunidades={oportunidades} accent={accent} />

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: accent }} />
          Venta cerrada
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: open }} />
          En pipeline
        </span>
        <span style={{ fontSize: 11, color: T.faint }}>
          Las barras se escalan contra el grupo más grande, no contra el total.
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 14,
        }}
      >
        {charts.map((ch) => (
          <section
            key={ch.title}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <h3 className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                {ch.title}
              </h3>
              <span style={{ fontSize: 11, color: T.faint }}>{ch.hint}</span>
            </div>
            {ch.bars.map((b) => (
              <div key={b.label} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{b.label}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: T.faint }}>{b.count}</span>
                    <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                      {b.value}
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 7,
                    background: "#EDEBE6",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${b.wonPct}%`, background: accent }} />
                  <div style={{ width: `${b.openPct}%`, background: open }} />
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
