"use client";

import { GOAL, GOAL_HISTORY, MES_LARGO, YEAR } from "@/data/dashboard";
import { money } from "@/lib/format";
import { groupBars, isOpen, monthWon, pipelineValue } from "@/lib/selectors";
import { T, openTone } from "@/lib/theme";
import type { Cliente } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  accent: string;
}

/** Below this share of target the goal readouts switch to the warning hue. */
const BEHIND = 70;

export function Dashboard({ clientes, accent }: Props) {
  const open = openTone(accent);

  // A month recorded as 0 has not happened yet; null means derive it from leads.
  const series = YEAR.map(([month, v]) => ({
    month,
    value: v === null ? monthWon(clientes, MES_LARGO[month] ?? month) : v,
  }));
  // Keep the goal line inside the plot even when every month undershoots it.
  const maxY = Math.max(...series.map((s) => s.value), GOAL * 1.15);
  const acumulado = series
    .filter((s) => s.value > 0)
    .reduce((a, s) => a + s.value, 0);

  const julio = monthWon(clientes, "Julio");
  const pct = Math.round((julio / GOAL) * 100);
  const behind = pct < BEHIND;

  const metrics = [
    { label: "Leads activos", value: String(clientes.filter(isOpen).length) },
    { label: "Valor en pipeline", value: money(pipelineValue(clientes)) },
    { label: "Cerrado en julio", value: money(julio) },
    {
      label: "Conversión",
      value: `${Math.round(
        (clientes.filter((c) => c.estado === "Ganado").length / clientes.length) * 100,
      )}%`,
    },
  ];

  const charts = [
    { title: "Vendedores", hint: "por cartera", bars: groupBars(clientes, "vendedor") },
    { title: "Canales", hint: "origen del lead", bars: groupBars(clientes, "canal") },
    { title: "Territorio", hint: "top 7 departamentos", bars: groupBars(clientes, "territorio", 7) },
    { title: "Diplomados y cursos", hint: "top 8 programas", bars: groupBars(clientes, "producto", 8) },
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
          <div
            key={m.label}
            style={{ background: T.paper, borderRadius: 8, padding: "14px 16px" }}
          >
            <p style={{ margin: "0 0 6px", fontSize: 12, color: T.muted }}>{m.label}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <section
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
              marginBottom: 20,
            }}
          >
            <div>
              <h3
                className="dsp"
                style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}
              >
                Ventas del año
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                Acumulado {money(acumulado)} · meta anual {money(GOAL * 12)}
              </p>
            </div>
            <span className="mono" style={{ fontSize: 11, color: T.faint }}>
              2026
            </span>
          </div>

          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(GOAL / maxY) * 100}%`,
                borderTop: `1px dashed ${T.borderStrong}`,
                pointerEvents: "none",
              }}
            />
            {series.map((s) => {
              const future = s.value === 0;
              return (
                <div
                  key={s.month}
                  style={{
                    minWidth: 0,
                    height: 168,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "stretch",
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      display: "block",
                      marginBottom: 5,
                      fontSize: 10,
                      textAlign: "center",
                      color: T.faint,
                    }}
                  >
                    {s.value ? "$" + Math.round(s.value / 100) / 10 + "k" : ""}
                  </span>
                  <div
                    style={{
                      height: future ? 3 : `${Math.max(3, (s.value / maxY) * 100)}%`,
                      background: future
                        ? T.border
                        : s.value >= GOAL
                          ? accent
                          : open,
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gap: 6,
              marginTop: 8,
            }}
          >
            {series.map((s) => (
              <span
                key={s.month}
                style={{
                  flex: 1,
                  fontSize: 10.5,
                  textAlign: "center",
                  color: s.value === 0 ? T.faint : T.muted,
                }}
              >
                {s.month}
              </span>
            ))}
          </div>

          <p style={{ margin: "14px 0 0", fontSize: 11, color: T.faint }}>
            La línea punteada marca la meta mensual de {money(GOAL)}. Agosto a
            diciembre aún sin registrar.
          </p>
        </section>

        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: 18,
          }}
        >
          <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
            Meta mensual
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: T.muted }}>
            Julio 2026 · faltan 3 días
          </p>
          <p
            className="mono dsp"
            style={{
              margin: 0,
              fontSize: 38,
              fontWeight: 500,
              lineHeight: 1,
              color: behind ? T.warn : accent,
            }}
          >
            {pct}%
          </p>
          <div
            style={{
              height: 9,
              background: "#EDEBE6",
              borderRadius: 5,
              overflow: "hidden",
              margin: "10px 0 12px",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, pct)}%`,
                background: behind ? T.warn : accent,
                borderRadius: 5,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: T.muted,
              marginBottom: 18,
            }}
          >
            <span className="mono">{money(julio)}</span>
            <span className="mono">Meta {money(GOAL)}</span>
          </div>

          <p
            className="mono"
            style={{
              margin: "0 0 10px",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: T.faint,
              textTransform: "uppercase",
            }}
          >
            Meses anteriores
          </p>
          {GOAL_HISTORY.map(([month, v]) => {
            const value = v === null ? monthWon(clientes, MES_LARGO[month] ?? month) : v;
            const p = Math.round((value / GOAL) * 100);
            return (
              <div
                key={month}
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}
              >
                <span style={{ width: 30, fontSize: 12, color: T.muted }}>{month}</span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: "#EDEBE6",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, p)}%`,
                      background:
                        p >= 100 ? accent : p < BEHIND ? T.warn : `${accent}80`,
                    }}
                  />
                </div>
                <span
                  className="mono"
                  style={{
                    width: 34,
                    textAlign: "right",
                    fontSize: 11,
                    color: p >= 100 ? accent : T.muted,
                  }}
                >
                  {p}%
                </span>
              </div>
            );
          })}
        </section>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <span
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: accent }} />
          Venta cerrada
        </span>
        <span
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: open }} />
          En pipeline
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
