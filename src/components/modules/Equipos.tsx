"use client";

import { useCatalogo } from "@/lib/catalog";
import { leadCount, money } from "@/lib/format";
import {
  estaAbierta,
  esGanada,
  groupBars,
  totalCerrado,
  valorPipeline,
} from "@/lib/selectors";
import { T, openTone, softer } from "@/lib/theme";
import type { Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
  vend: number;
  onSelectVend: (i: number) => void;
  onOpen: (id: number) => void;
  onVerTodos: (vendedorId: number) => void;
}

export function Equipos({
  oportunidades,
  accent,
  vend,
  onSelectVend,
  onOpen,
  onVerTodos,
}: Props) {
  const { vendedores, etapas } = useCatalogo();
  const soft = softer(accent);
  const open = openTone(accent);

  if (vendedores.length === 0) {
    return (
      <p style={{ fontSize: 13, color: T.muted }}>
        No hay vendedores cargados en el catálogo.
      </p>
    );
  }

  const vi = Math.min(vend, vendedores.length - 1);
  const v = vendedores[vi];

  const deVendedor = (id: number | null) =>
    oportunidades.filter((o) => o.vendedorId === id);

  const sinAsignar = oportunidades.filter((o) => o.vendedorId == null);
  const propias = deVendedor(v.id);
  const ganadas = propias.filter(esGanada);

  const kpis = [
    { label: "Oportunidades", value: String(propias.length) },
    { label: "En pipeline", value: money(valorPipeline(propias) || null) },
    { label: "Venta cerrada", value: money(totalCerrado(propias) || null) },
    {
      label: "Tasa de cierre",
      value: propias.length
        ? `${Math.round((ganadas.length / propias.length) * 100)}%`
        : "—",
    },
  ];

  const territorios = [...new Set(propias.map((o) => o.territorio))].filter(
    (t) => t !== "—",
  );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          flex: "1 1 240px",
          maxWidth: 300,
          minWidth: 0,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 14, borderBottom: `1px solid ${T.border}` }}>
          <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
            Equipo de ventas
          </p>
          <p className="mono" style={{ margin: 0, fontSize: 11, color: T.faint }}>
            {vendedores.length} ejecutivos · {oportunidades.length} oportunidades
          </p>
        </div>

        {vendedores.map((x, i) => {
          const xs = deVendedor(x.id);
          const cerrado = totalCerrado(xs);
          return (
            <button
              type="button"
              key={x.id}
              className="nav"
              onClick={() => onSelectVend(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "13px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                background: i === vi ? soft : "transparent",
              }}
            >
              <p
                style={{
                  margin: "0 0 3px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: i === vi ? accent : T.ink,
                }}
              >
                {x.nombre}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 5,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                  {leadCount(xs.length)}
                </span>
                <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                  {money(cerrado || null)}
                </span>
              </div>
            </button>
          );
        })}

        {sinAsignar.length > 0 && (
          <div
            style={{
              padding: "13px 14px",
              borderTop: `1px solid ${T.border}`,
              background: "#F6EEDC",
              color: "#7A5A12",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
              {sinAsignar.length}{" "}
              {sinAsignar.length === 1 ? "oportunidad" : "oportunidades"} sin
              vendedor asignado. Nadie les da seguimiento.
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          flex: "999 1 400px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <h2 className="dsp" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>
              {v.nombre}
            </h2>
            <button
              type="button"
              onClick={() => onVerTodos(v.id)}
              style={{ fontSize: 12.5, color: accent }}
            >
              Ver en Clientes ›
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
              gap: 9,
            }}
          >
            {kpis.map((k) => (
              <div key={k.label} style={{ background: T.paper, borderRadius: 8, padding: "12px 14px" }}>
                <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{k.label}</p>
                <p className="mono dsp" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(252px, 1fr))",
            gap: 14,
          }}
        >
          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 20,
            }}
          >
            <h3 className="dsp" style={{ margin: "0 0 15px", fontSize: 15, fontWeight: 500 }}>
              Sus oportunidades por etapa
            </h3>
            {etapas.map((e) => {
              const n = propias.filter((o) => o.etapaId === e.id).length;
              return (
                <div
                  key={e.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
                >
                  <span
                    style={{
                      flex: "0 1 110px",
                      minWidth: 0,
                      fontSize: 11.5,
                      color: n ? T.ink : T.faint,
                      lineHeight: 1.2,
                    }}
                  >
                    {e.nombre}
                  </span>
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
                        width: `${(n / Math.max(propias.length, 1)) * 100}%`,
                        background: accent,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{ width: 26, textAlign: "right", fontSize: 12, color: n ? T.muted : T.faint }}
                  >
                    {n}
                  </span>
                </div>
              );
            })}
          </section>

          <section
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 20,
            }}
          >
            <h3 className="dsp" style={{ margin: "0 0 15px", fontSize: 15, fontWeight: 500 }}>
              Programas que vende
            </h3>
            {groupBars(propias, "producto", 5).map((p) => (
              <div key={p.label} style={{ marginBottom: 11 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{p.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: T.muted }}>{p.value}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 6,
                    background: "#EDEBE6",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${p.wonPct}%`, background: accent }} />
                  <div style={{ width: `${p.openPct}%`, background: open }} />
                </div>
              </div>
            ))}

            {territorios.length > 0 && (
              <>
                <p
                  className="mono"
                  style={{
                    margin: "16px 0 8px",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    color: T.faint,
                    textTransform: "uppercase",
                  }}
                >
                  Territorios que cubre
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {territorios.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11.5,
                        padding: "5px 10px",
                        borderRadius: 6,
                        background: T.paper,
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <section
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
            <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
              Cartera asignada
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
              {propias.length} en cartera · {money(valorPipeline(propias) || null)} en
              oportunidades abiertas
            </p>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {propias.slice(0, 60).map((o, i) => (
              <div
                key={o.id}
                className="row"
                onClick={() => onOpen(o.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto 90px",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 20px",
                  cursor: "pointer",
                  borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 13 }}>{o.cliente}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: T.faint }}>{o.producto}</p>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    padding: "3px 9px",
                    borderRadius: 20,
                    whiteSpace: "nowrap",
                    background: soft,
                    color: accent,
                  }}
                >
                  {o.etapa}
                </span>
                <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>
                  {money(o.valor)}
                </span>
              </div>
            ))}
            {propias.length > 60 && (
              <p style={{ margin: 0, padding: "12px 20px", fontSize: 12, color: T.faint }}>
                Mostrando 60 de {propias.length}. Usá Clientes para ver la lista
                completa.
              </p>
            )}
            {propias.length === 0 && (
              <p style={{ margin: 0, padding: "26px 20px", fontSize: 12.5, color: T.faint }}>
                {v.nombre} no tiene oportunidades asignadas.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
