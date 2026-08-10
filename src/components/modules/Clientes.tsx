"use client";

import { useState, type CSSProperties } from "react";

import { ImportarClientes } from "@/components/modules/ImportarClientes";
import { NuevoClienteForm } from "@/components/modules/NuevoClienteForm";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta, money } from "@/lib/format";
import { estadoTone, totalCerrado, valorPipeline } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import type { CatalogItem, Oportunidad } from "@/lib/types";

interface Props {
  oportunidades: Oportunidad[];
  accent: string;
  query: string;
  filtros: Record<string, number | null>;
  selected: number | null;
  menu: string | null;
  onQuery: (q: string) => void;
  onFiltro: (key: string, value: number | null) => void;
  onToggleMenu: (key: string) => void;
  onSelect: (id: number) => void;
  onLimpiar: () => void;
  /** Recarga los datos del servidor tras dar de alta un cliente. */
  onRefresh: () => void;
}

/** Which `Oportunidad` id field each catalogue filter tests. */
const CAMPO: Record<string, keyof Oportunidad> = {
  vendedor: "vendedorId",
  producto: "productoId",
  etapa: "etapaId",
  estado: "estadoId",
  canal: "canalId",
  territorio: "territorioId",
};

export function Clientes({
  oportunidades,
  accent,
  query,
  filtros,
  selected,
  menu,
  onQuery,
  onFiltro,
  onToggleMenu,
  onSelect,
  onLimpiar,
  onRefresh,
}: Props) {
  const cat = useCatalogo();
  const [alta, setAlta] = useState(false);
  const [importando, setImportando] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);
  const soft = softer(accent);
  const q = query.trim().toLowerCase();

  const filtros_def: { key: string; label: string; items: CatalogItem[] }[] = [
    { key: "vendedor", label: "Vendedor", items: cat.vendedores },
    { key: "etapa", label: "Etapa", items: cat.etapas },
    { key: "estado", label: "Estado", items: cat.estados },
    { key: "producto", label: "Programa", items: cat.productos },
    { key: "canal", label: "Canal", items: cat.canales },
    { key: "territorio", label: "Territorio", items: cat.territorios },
  ];

  const list = oportunidades.filter(
    (o) =>
      filtros_def.every(({ key }) => {
        const want = filtros[key];
        return want == null || o[CAMPO[key]] === want;
      }) &&
      (!q ||
        [o.cliente, o.codigo, o.telefono ?? "", o.correo ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );

  const activos = filtros_def.filter((f) => filtros[f.key] != null).length;

  const resumen = [
    { label: "Oportunidades", value: String(list.length) },
    { label: "Valor en pipeline", value: money(valorPipeline(list) || null) },
    { label: "Venta cerrada", value: money(totalCerrado(list) || null) },
    {
      label: "Ticket promedio",
      value: (() => {
        const conValor = list.filter((o) => o.valor != null);
        return conValor.length
          ? money(
              Math.round(
                conValor.reduce((a, o) => a + (o.valor ?? 0), 0) / conValor.length,
              ),
            )
          : "—";
      })(),
    },
  ];

  const th: CSSProperties = {
    textAlign: "left",
    padding: "9px 14px",
    fontWeight: 500,
    fontSize: 11.5,
    color: T.muted,
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${T.border}`,
  };
  const td: CSSProperties = {
    padding: "11px 14px",
    whiteSpace: "nowrap",
    color: T.muted,
  };

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
        {resumen.map((s) => (
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

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            padding: 14,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar nombre, código, teléfono o correo"
            style={{
              flex: 1,
              minWidth: 220,
              height: 32,
              padding: "0 12px",
              fontSize: 13,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              background: T.paper,
            }}
          />

          {filtros_def.map((f) => {
            const key = `f:${f.key}`;
            return (
              <FilterMenu
                key={key}
                menuKey={key}
                label={f.label}
                options={[
                  { label: "Todos", value: null },
                  ...f.items.map((i) => ({ label: i.nombre, value: i.id })),
                ]}
                current={filtros[f.key] ?? null}
                valueText={
                  filtros[f.key] == null
                    ? "Todos"
                    : (f.items.find((i) => i.id === filtros[f.key])?.nombre ?? "Todos")
                }
                open={menu === key}
                accent={accent}
                onToggle={() => onToggleMenu(key)}
                onPick={(v) => onFiltro(f.key, v as number | null)}
              />
            );
          })}

          {(activos > 0 || q) && (
            <button
              type="button"
              onClick={onLimpiar}
              style={{ fontSize: 12.5, color: accent, padding: "0 6px" }}
            >
              Limpiar
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setCreado(null);
              setAlta(true);
            }}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 6,
              background: accent,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            + Nuevo cliente
          </button>

          <button
            type="button"
            onClick={() => {
              setCreado(null);
              setImportando(true);
            }}
            style={{
              height: 32,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: 6,
              border: `1px solid ${accent}`,
              color: accent,
              background: "transparent",
              whiteSpace: "nowrap",
            }}
          >
            ↑ Subir base de datos
          </button>
        </div>

        {creado && (
          <p
            style={{
              margin: 0,
              padding: "10px 16px",
              fontSize: 12.5,
              borderBottom: `1px solid ${T.border}`,
              background: "#E6F0E9",
              color: "#2F6B4F",
            }}
          >
            {creado}
          </p>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                <th style={th}>Código</th>
                <th style={th}>Fecha</th>
                <th style={th}>Cliente</th>
                <th style={th}>Programa</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Etapa</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
                <th style={{ ...th, textAlign: "right" }}>Cerrada</th>
                <th style={{ width: 34, borderBottom: `1px solid ${T.border}` }} />
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const [fg, bg] = estadoTone(o.estado, accent);
                return (
                  <tr
                    key={o.id}
                    className="row"
                    onClick={() => onSelect(o.id)}
                    style={{
                      borderTop: `1px solid ${T.border}`,
                      cursor: "pointer",
                      background: selected === o.id ? T.paper : "transparent",
                    }}
                  >
                    <td className="mono" style={td}>{o.codigo}</td>
                    <td className="mono" style={td}>{fechaCorta(o.fechaRegistro)}</td>
                    <td style={{ ...td, padding: "9px 14px", color: T.ink }}>
                      <span style={{ display: "block", fontSize: 13 }}>{o.cliente}</span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 11, color: T.faint }}>
                        {o.correo ?? o.telefono ?? "—"}
                      </span>
                    </td>
                    <td style={td}>{o.producto}</td>
                    <td style={td}>{o.vendedor}</td>
                    <td style={{ ...td, padding: "9px 14px" }}>
                      <span className="pill"
                        style={{
                          display: "inline-block",
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: soft,
                          color: accent,
                        }}
                      >
                        {o.etapa}
                      </span>
                    </td>
                    <td style={{ ...td, padding: "9px 14px" }}>
                      <span className="pill"
                        style={{
                          display: "inline-block",
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: bg,
                          color: fg,
                        }}
                      >
                        {o.estado}
                      </span>
                    </td>
                    <td className="mono" style={{ ...td, textAlign: "right" }}>
                      {money(o.valor)}
                    </td>
                    <td className="mono" style={{ ...td, textAlign: "right" }}>
                      {money(o.cerrada)}
                    </td>
                    <td style={{ padding: "10px 14px 10px 0", textAlign: "right", color: T.borderStrong }}>
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: "11px 16px",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: T.muted,
          }}
        >
          <span>
            Mostrando {list.length} de {oportunidades.length} oportunidades
          </span>
          <span>Clic en una fila para ver la ficha completa</span>
        </div>
      </div>

      {alta && (
        <NuevoClienteForm
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setAlta(false)}
          onCreado={(codigo) => {
            setAlta(false);
            setCreado(`Cliente creado con el código ${codigo}. Ya aparece en la lista.`);
            onRefresh();
          }}
        />
      )}

      {importando && (
        <ImportarClientes
          accent={accent}
          oportunidades={oportunidades}
          onCerrar={() => setImportando(false)}
          onImportado={(resumen) => {
            setImportando(false);
            setCreado(resumen);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
