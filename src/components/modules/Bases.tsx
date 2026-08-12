"use client";

import { useMemo, useState } from "react";

import { agruparBases, resumirBase } from "@/lib/bases";
import { fechaCorta, horaDe, money } from "@/lib/format";
import { T, softer } from "@/lib/theme";
import type { Importacion, Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  importaciones: Importacion[];
  /** La tabla de importaciones todavía no existe. */
  faltaMigracion: boolean;
  accent: string;
  /** Abre una oportunidad en Clientes. */
  onAbrir: (id: number) => void;
}

export function Bases({
  oportunidades,
  importaciones,
  faltaMigracion,
  accent,
  onAbrir,
}: Props) {
  const bases = useMemo(
    () => agruparBases(oportunidades, importaciones),
    [oportunidades, importaciones],
  );
  const [abierta, setAbierta] = useState<string | null>(null);

  const th = {
    textAlign: "left" as const,
    padding: "9px 14px",
    fontWeight: 500,
    fontSize: 11.5,
    color: T.muted,
    whiteSpace: "nowrap" as const,
    borderBottom: `1px solid ${T.border}`,
  };
  const td = { padding: "11px 14px", whiteSpace: "nowrap" as const };

  const totalFilas = bases.reduce((a, b) => a + b.oportunidades.length, 0);

  return (
    <div>
      {faltaMigracion && (
        <p
          style={{
            margin: "0 0 14px",
            padding: "11px 14px",
            fontSize: 12.5,
            lineHeight: 1.55,
            borderRadius: 9,
            background: "#F6EEDC",
            color: "#7A5A12",
          }}
        >
          Las cargas de abajo están agrupadas por el día en que entraron, que es
          todo lo que se puede saber por ahora. Para que cada base quede
          registrada con el nombre del archivo y quién la subió, corré{" "}
          <code>supabase/migrations/20260731120000_bases_importadas.sql</code> en
          Supabase → SQL Editor. Aplica de ahí en adelante: las cargas
          anteriores seguirán agrupadas por fecha.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {[
          { l: "Bases", v: String(bases.length) },
          { l: "Registros cargados", v: String(totalFilas) },
          {
            l: "Última carga",
            v: bases[0]?.fecha ? fechaCorta(bases[0].fecha) : "—",
          },
        ].map((k) => (
          <div
            key={k.l}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "12px 15px",
            }}
          >
            <p style={{ margin: "0 0 5px", fontSize: 11, color: T.muted }}>{k.l}</p>
            <p className="mono dsp" style={{ margin: 0, fontSize: 21, fontWeight: 500 }}>
              {k.v}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <p className="dsp" style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 500 }}>
            Bases subidas
          </p>
          <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
            De la más reciente a la más antigua. Clic en una para ver sus registros.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                <th style={th}>Base</th>
                <th style={th}>Ingresada</th>
                <th style={{ ...th, textAlign: "right" }}>Registros</th>
                <th style={{ ...th, textAlign: "right" }}>Clientes</th>
                <th style={{ ...th, textAlign: "right" }}>Ganados</th>
                <th style={{ ...th, textAlign: "right" }}>Venta cerrada</th>
                <th style={{ width: 34, borderBottom: `1px solid ${T.border}` }} />
              </tr>
            </thead>
            <tbody>
              {bases.map((b, i) => {
                const r = resumirBase(b);
                const expandida = abierta === b.clave;
                return (
                  <>
                    <tr
                      key={b.clave}
                      className="row"
                      onClick={() => setAbierta(expandida ? null : b.clave)}
                      style={{
                        borderTop: i ? `1px solid ${T.border}` : "none",
                        cursor: "pointer",
                        background: expandida ? softer(accent) : "transparent",
                      }}
                    >
                      <td style={{ ...td, whiteSpace: "normal", color: T.ink }}>
                        <span style={{ display: "block", fontSize: 13 }}>{b.titulo}</span>
                        {!b.registrada && (
                          <span style={{ display: "block", marginTop: 2, fontSize: 11, color: T.faint }}>
                            Sin archivo registrado
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ ...td, color: T.muted }}>
                        {b.fecha ? fechaCorta(b.fecha) : "—"}
                        {b.momento && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: T.faint }}>
                            {horaDe(b.momento)}
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ ...td, textAlign: "right" }}>
                        {b.oportunidades.length}
                        {b.filasDeclaradas != null &&
                          b.filasDeclaradas !== b.oportunidades.length && (
                            <span
                              style={{ marginLeft: 6, fontSize: 11, color: T.warn }}
                              title={`Se cargaron ${b.filasDeclaradas}; el resto se eliminó después`}
                            >
                              de {b.filasDeclaradas}
                            </span>
                          )}
                      </td>
                      <td className="mono" style={{ ...td, textAlign: "right", color: T.muted }}>
                        {r.clientes}
                      </td>
                      <td className="mono" style={{ ...td, textAlign: "right", color: T.muted }}>
                        {r.ganados}
                      </td>
                      <td className="mono" style={{ ...td, textAlign: "right" }}>
                        {money(r.cerrado || null)}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: T.borderStrong }}>
                        {expandida ? "▾" : "›"}
                      </td>
                    </tr>

                    {expandida && (
                      <tr key={`${b.clave}-detalle`}>
                        <td colSpan={7} style={{ padding: 0, background: T.paper }}>
                          {b.oportunidades.length === 0 ? (
                            <p style={{ margin: 0, padding: "18px 20px", fontSize: 12.5, color: T.faint }}>
                              Esta base no tiene registros vivos. Se subió, pero sus
                              clientes fueron eliminados después.
                            </p>
                          ) : (
                            <div style={{ maxHeight: 380, overflowY: "auto" }}>
                              {b.oportunidades.slice(0, 200).map((o, j) => (
                                <div
                                  key={o.id}
                                  className="row"
                                  onClick={() => onAbrir(o.id)}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "90px minmax(0, 1fr) minmax(0, 1fr) 90px",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "9px 20px",
                                    cursor: "pointer",
                                    fontSize: 12.5,
                                    borderTop: j ? `1px solid ${T.border}` : "none",
                                  }}
                                >
                                  <span className="mono" style={{ color: T.muted }}>{o.codigo}</span>
                                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {o.cliente}
                                  </span>
                                  <span style={{ color: T.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {o.producto}
                                  </span>
                                  <span className="mono" style={{ textAlign: "right" }}>
                                    {money(o.valor)}
                                  </span>
                                </div>
                              ))}
                              {b.oportunidades.length > 200 && (
                                <p style={{ margin: 0, padding: "10px 20px", fontSize: 12, color: T.faint }}>
                                  Mostrando 200 de {b.oportunidades.length}. Usá Clientes
                                  para ver la lista completa.
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {bases.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "26px 18px", fontSize: 12.5, color: T.faint }}>
                    Todavía no hay bases cargadas. Subí una desde Clientes → Subir
                    base de datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
