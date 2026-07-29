"use client";

import { ETAPAS, LOST } from "@/data/taxonomia";
import { SIN_ASIGNAR, VENDEDORES } from "@/data/vendedores";
import { ImageSlot } from "@/components/ui/ImageSlot";
import { leadCount, money } from "@/lib/format";
import { groupBars, isOpen } from "@/lib/selectors";
import { T, openTone, softer } from "@/lib/theme";
import type { Cliente, ClientePatch } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  accent: string;
  vend: number;
  onSelectVend: (i: number) => void;
  onPatch: (id: string, patch: ClientePatch) => void;
  onOpenCliente: (id: string) => void;
  onSeeAll: (vendedor: string) => void;
}

/** Below this share of target the meta bar turns amber. */
const BEHIND = 70;

export function Equipos({
  clientes,
  accent,
  vend,
  onSelectVend,
  onPatch,
  onOpenCliente,
  onSeeAll,
}: Props) {
  const soft = softer(accent);
  const open = openTone(accent);

  const vi = Math.min(vend, VENDEDORES.length - 1);
  const v = VENDEDORES[vi];

  const mineOf = (name: string) => clientes.filter((c) => c.vendedor === name);
  const sinAsignar = mineOf(SIN_ASIGNAR);
  const own = mineOf(v.name);
  const openOwn = own.filter(isOpen);
  const wonOwn = own.filter((c) => c.estado === "Ganado");
  const julio = wonOwn
    .filter((c) => c.mes === "Julio")
    .reduce((a, c) => a + (c.cerrada ?? 0), 0);
  const pct = Math.round((julio / v.meta) * 100);

  /** Round-robin the orphaned leads across the team, advancing brand-new ones. */
  const assignAll = () =>
    sinAsignar.forEach((c, i) =>
      onPatch(c.id, {
        vendedor: VENDEDORES[i % VENDEDORES.length].name,
        etapa: c.etapa === "Nuevo lead" ? "Asignado" : c.etapa,
      }),
    );

  const kpis = [
    { label: "Leads asignados", value: String(own.length), color: undefined as string | undefined },
    { label: "En pipeline", value: money(openOwn.reduce((a, c) => a + (c.valor || 0), 0)), color: undefined },
    { label: "Cerrado en julio", value: money(julio), color: undefined },
    { label: `Meta ${money(v.meta)}`, value: `${pct}%`, color: pct < BEHIND ? T.warn : accent },
    {
      label: "Conversión",
      value: own.length ? `${Math.round((wonOwn.length / own.length) * 100)}%` : "—",
      color: undefined,
    },
  ];

  const territorios = [...new Set(own.map((c) => c.territorio))];
  const programas = groupBars(own, "producto", 4);

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
            {VENDEDORES.length} ejecutivos · {clientes.length} leads en cartera
          </p>
        </div>

        {VENDEDORES.map((x, i) => {
          const xs = mineOf(x.name);
          const p = Math.round(
            (xs
              .filter((c) => c.estado === "Ganado" && c.mes === "Julio")
              .reduce((a, c) => a + (c.cerrada ?? 0), 0) /
              x.meta) *
              100,
          );
          return (
            <button
              type="button"
              key={x.name}
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
                {x.name}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{x.role}</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 7,
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: T.faint }}>
                  {leadCount(xs.length)}
                </span>
                <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                  {money(xs.filter(isOpen).reduce((a, c) => a + (c.valor || 0), 0))}
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  background: "#EDEBE6",
                  borderRadius: 3,
                  overflow: "hidden",
                  marginTop: 7,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, p)}%`,
                    background: p < BEHIND ? T.warn : accent,
                    borderRadius: 3,
                  }}
                />
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 10.5, color: T.faint }}>
                {p}% de su meta de julio
              </p>
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
            <p style={{ margin: "0 0 9px", fontSize: 12, lineHeight: 1.45 }}>
              {sinAsignar.length} lead{sinAsignar.length === 1 ? "" : "s"} sin asignar
              en el pipeline. Nadie les da seguimiento.
            </p>
            <button
              type="button"
              onClick={assignAll}
              style={{
                height: 30,
                padding: "0 12px",
                fontSize: 12,
                borderRadius: 6,
                background: "#7A5A12",
                color: "#fff",
              }}
            >
              Repartir entre el equipo
            </button>
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
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <ImageSlot width={96} height={110} radius={8} placeholder="Foto" />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div>
                  <h2
                    className="dsp"
                    style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700 }}
                  >
                    {v.name}
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
                    {v.role} · desde {v.since}
                  </p>
                </div>
                <button
                  type="button"
                  style={{
                    height: 32,
                    padding: "0 13px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: `1px solid ${accent}`,
                    color: accent,
                  }}
                >
                  Editar
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[v.email, v.tel].map((chip) => (
                  <span
                    key={chip}
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      padding: "5px 10px",
                      borderRadius: 6,
                      background: T.paper,
                      color: T.muted,
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
              gap: 9,
              marginTop: 18,
            }}
          >
            {kpis.map((k) => (
              <div
                key={k.label}
                style={{ background: T.paper, borderRadius: 8, padding: "12px 14px" }}
              >
                <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{k.label}</p>
                <p
                  className="mono dsp"
                  style={{ margin: 0, fontSize: 20, fontWeight: 500, color: k.color }}
                >
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
            <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
              Sus leads por etapa
            </h3>
            <p style={{ margin: "0 0 15px", fontSize: 12, color: T.muted }}>
              Mismas etapas del pipeline
            </p>
            {ETAPAS.map((label) => {
              const n = own.filter((c) => c.etapa === label).length;
              return (
                <div
                  key={label}
                  style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
                >
                  <span
                    style={{
                      flex: "0 1 96px",
                      minWidth: 0,
                      fontSize: 11.5,
                      color: n ? T.ink : T.faint,
                      lineHeight: 1.2,
                    }}
                  >
                    {label}
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
                        width: `${(n / Math.max(own.length, 1)) * 100}%`,
                        background: label === LOST ? "#B85042" : accent,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{
                      width: 18,
                      textAlign: "right",
                      fontSize: 12,
                      color: n ? T.muted : T.faint,
                    }}
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
            <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
              Programas que vende
            </h3>
            <p style={{ margin: "0 0 15px", fontSize: 12, color: T.muted }}>
              Catálogo de diplomados y cursos
            </p>
            {programas.map((pr) => (
              <div key={pr.label} style={{ marginBottom: 11 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12.5 }}>{pr.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: T.muted }}>
                    {pr.value}
                  </span>
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
                  <div style={{ width: `${pr.wonPct}%`, background: accent }} />
                  <div style={{ width: `${pr.openPct}%`, background: open }} />
                </div>
              </div>
            ))}

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
                    color: T.ink,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div>
              <h3 className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
                Leads asignados
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                {own.length} en cartera ·{" "}
                {money(own.reduce((a, c) => a + (c.valor || 0), 0))} en oportunidades
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSeeAll(v.name)}
              style={{ fontSize: 12.5, color: accent }}
            >
              Ver en Clientes ›
            </button>
          </div>

          {own.map((c, i) => (
            <div
              key={c.id}
              className="row"
              onClick={() => onOpenCliente(c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto 80px",
                alignItems: "center",
                gap: 12,
                padding: "11px 20px",
                cursor: "pointer",
                borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13 }}>{c.nombre}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: T.faint }}>{c.producto}</p>
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  padding: "3px 9px",
                  borderRadius: 20,
                  whiteSpace: "nowrap",
                  background: c.etapa === LOST ? "#F7EBE9" : soft,
                  color: c.etapa === LOST ? "#B85042" : accent,
                }}
              >
                {c.etapa}
              </span>
              <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>
                {money(c.valor)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
