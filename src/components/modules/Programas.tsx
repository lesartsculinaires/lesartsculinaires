"use client";

import { PROGRAMAS, PROGRAMA_TABS } from "@/data/programas";
import { money } from "@/lib/format";
import { isOpen } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import type { Cliente } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  accent: string;
  tipo: string;
  onTipo: (tipo: string) => void;
  onOpenLeads: (programa: string) => void;
}

/** Below this fill rate a cohort is flagged as needing enrolments. */
const LOW_FILL = 50;

export function Programas({ clientes, accent, tipo, onTipo, onOpenLeads }: Props) {
  const soft = softer(accent);
  const shown = PROGRAMAS.filter((p) => tipo === "Todos" || p.tipo === tipo);
  const llenos = PROGRAMAS.reduce((a, p) => a + p.cuposLlenos, 0);
  const totales = PROGRAMAS.reduce((a, p) => a + p.cuposTotal, 0);

  const stats = [
    { label: "Programas activos", value: String(PROGRAMAS.length) },
    { label: "Cupos vendidos", value: `${llenos}/${totales}` },
    { label: "Ocupación", value: `${Math.round((llenos / totales) * 100)}%` },
    {
      label: "Ingreso proyectado",
      value: money(PROGRAMAS.reduce((a, p) => a + p.precio * p.cuposLlenos, 0)),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "12px 15px",
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{s.label}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 21, fontWeight: 500 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {PROGRAMA_TABS.map(([value, plural]) => {
          const on = value === tipo;
          const n =
            value === "Todos"
              ? PROGRAMAS.length
              : PROGRAMAS.filter((p) => p.tipo === value).length;
          return (
            <button
              type="button"
              key={value}
              onClick={() => onTipo(value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 32,
                padding: "0 13px",
                fontSize: 13,
                borderRadius: 7,
                border: `1px solid ${on ? accent : T.border}`,
                background: on ? soft : T.surface,
                color: on ? accent : T.muted,
              }}
            >
              {plural}
              <span style={{ fontSize: 11, color: on ? accent : T.faint }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {shown.map((p) => {
          const leads = clientes.filter((c) => c.producto === p.nombre);
          const abiertos = leads.filter(isOpen);
          const inscritos = leads.filter((c) => c.estado === "Ganado").length;
          const pct = Math.round((p.cuposLlenos / p.cuposTotal) * 100);
          const full = p.cuposLlenos >= p.cuposTotal;
          const low = pct < LOW_FILL;
          const estado = full ? "Lleno" : low ? "Cupos abiertos" : "Casi lleno";

          return (
            <section
              key={p.nombre}
              className="card"
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T.faint,
                  }}
                >
                  {p.tipo}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    borderRadius: 20,
                    whiteSpace: "nowrap",
                    background: full ? "#E6F0E9" : low ? "#F6EEDC" : soft,
                    color: full ? "#2F6B4F" : low ? "#9C7118" : accent,
                  }}
                >
                  {estado}
                </span>
              </div>

              <h3
                className="dsp"
                style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}
              >
                {p.nombre}
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: T.muted }}>
                {p.duracion} · {p.cuposTotal} cupos
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 12, color: T.muted }}>Cupos</span>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: low ? T.warn : T.muted }}
                >
                  {p.cuposLlenos}/{p.cuposTotal}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: "#EDEBE6",
                  borderRadius: 3,
                  overflow: "hidden",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: full ? "#2F6B4F" : low ? T.warn : accent,
                    borderRadius: 3,
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: `1px solid ${T.border}`,
                  paddingTop: 12,
                }}
              >
                <span className="mono dsp" style={{ fontSize: 17, fontWeight: 500 }}>
                  {money(p.precio)}
                </span>
                <span style={{ fontSize: 12, color: T.muted }}>Inicia {p.inicio}</span>
              </div>

              <div
                onClick={() => onOpenLeads(p.nombre)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 12,
                  paddingTop: 11,
                  borderTop: `1px solid ${T.border}`,
                  cursor: "pointer",
                  color: T.muted,
                }}
              >
                <span style={{ fontSize: 12 }}>
                  {leads.length
                    ? `${abiertos.length} en pipeline · ${money(
                        abiertos.reduce((a, c) => a + (c.valor || 0), 0),
                      )}${inscritos ? ` · ${inscritos} inscrito${inscritos > 1 ? "s" : ""}` : ""}`
                    : "Sin leads registrados"}
                </span>
                <span style={{ fontSize: 12, color: accent, whiteSpace: "nowrap" }}>
                  Ver clientes ›
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
