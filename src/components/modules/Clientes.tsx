"use client";

import type { CSSProperties } from "react";

import { CLIENTES } from "@/data/clientes";
import { PROGRAMAS } from "@/data/programas";
import { SIN_ASIGNAR, VENDEDORES } from "@/data/vendedores";
import {
  CANALES,
  COLS,
  ESTADOS,
  ESTADO_TONE,
  ETAPAS,
  TERRITORIOS,
} from "@/data/taxonomia";
import { FilterMenu, withTodos } from "@/components/ui/FilterMenu";
import { money } from "@/lib/format";
import { isOpen } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import type { Cliente, ColumnDef } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  accent: string;
  query: string;
  filters: Record<string, string | null>;
  cols: string[];
  extraCount: number;
  selected: string | null;
  menu: string | null;
  onQuery: (q: string) => void;
  onFilter: (key: string, value: string | null) => void;
  onToggleCol: (key: string) => void;
  onToggleMenu: (key: string) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  addBtnStyle: CSSProperties;
}

/** Dropdown filters, in toolbar order. */
const FILTER_DEFS: { key: string; label: string; values: readonly string[] }[] = [
  { key: "canal", label: "Canal", values: CANALES },
  { key: "etapa", label: "Etapa", values: ETAPAS },
  { key: "estado", label: "Estado", values: ESTADOS },
  { key: "territorio", label: "Territorio", values: TERRITORIOS },
  { key: "producto", label: "Programa", values: PROGRAMAS.map((p) => p.nombre) },
  {
    key: "vendedor",
    label: "Vendedor",
    values: [...VENDEDORES.map((v) => v.name), SIN_ASIGNAR],
  },
];

export function Clientes({
  clientes,
  accent,
  query,
  filters,
  cols,
  extraCount,
  selected,
  menu,
  onQuery,
  onFilter,
  onToggleCol,
  onToggleMenu,
  onSelect,
  onAdd,
  addBtnStyle,
}: Props) {
  const soft = softer(accent);
  const q = query.trim().toLowerCase();

  const list = clientes.filter(
    (c) =>
      FILTER_DEFS.every(({ key }) => {
        const want = filters[key];
        return !want || String(c[key as keyof Cliente]) === want;
      }) &&
      (!q || [c.nombre, c.id, c.tel].join(" ").toLowerCase().includes(q)),
  );

  const pipeline = list.filter(isOpen).reduce((a, c) => a + (c.valor || 0), 0);
  const ganado = list.reduce((a, c) => a + (c.cerrada ?? 0), 0);
  const ticket = list.length
    ? Math.round(list.reduce((a, c) => a + (c.valor || 0), 0) / list.length)
    : 0;

  const visibleCols = COLS.filter((c) => cols.includes(c.key));

  const resumen = [
    { label: "Oportunidades", value: String(list.length) },
    { label: "Valor en pipeline", value: money(pipeline) },
    { label: "Venta cerrada", value: money(ganado) },
    { label: "Ticket promedio", value: money(ticket) },
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

      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
        }}
      >
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
            placeholder="Buscar nombre, ID o teléfono"
            style={{
              flex: 1,
              minWidth: 190,
              height: 32,
              padding: "0 12px",
              fontSize: 13,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              background: T.paper,
            }}
          />

          {FILTER_DEFS.map((f) => {
            const key = `f:${f.key}`;
            return (
              <FilterMenu
                key={key}
                menuKey={key}
                label={f.label}
                options={withTodos(f.values)}
                current={filters[f.key] ?? null}
                open={menu === key}
                accent={accent}
                onToggle={() => onToggleMenu(key)}
                onPick={(v) => onFilter(f.key, v as string | null)}
              />
            );
          })}

          <FilterMenu
            menuKey="f:cols"
            label="Columnas"
            options={COLS.map((c) => ({ label: c.label, value: c.key }))}
            open={menu === "f:cols"}
            accent={accent}
            multi={{ selected: cols, summary: `${cols.length} de ${COLS.length}` }}
            onToggle={() => onToggleMenu("f:cols")}
            onPick={(v) => onToggleCol(v as string)}
          />

          <button type="button" onClick={onAdd} style={addBtnStyle}>
            Agregar
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.paper }}>
                {visibleCols.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: col.kind === "money" ? "right" : "left",
                      padding: "9px 14px",
                      fontWeight: 500,
                      fontSize: 11.5,
                      color: T.muted,
                      whiteSpace: "nowrap",
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th style={{ width: 34, borderBottom: `1px solid ${T.border}` }} />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr
                  key={c.id}
                  className="row"
                  onClick={() => onSelect(c.id)}
                  style={{
                    borderTop: `1px solid ${T.border}`,
                    cursor: "pointer",
                    background: selected === c.id ? T.paper : "transparent",
                  }}
                >
                  {visibleCols.map((col) => (
                    <Cell key={col.key} cliente={c} col={col} accent={accent} soft={soft} />
                  ))}
                  <td
                    style={{
                      padding: "10px 14px 10px 0",
                      textAlign: "right",
                      color: T.borderStrong,
                    }}
                  >
                    ›
                  </td>
                </tr>
              ))}
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
            Mostrando {list.length} de {CLIENTES.length + extraCount} clientes
          </span>
          <span>Clic en una fila para ver la ficha completa</span>
        </div>
      </div>
    </div>
  );
}

function Cell({
  cliente,
  col,
  accent,
  soft,
}: {
  cliente: Cliente;
  col: ColumnDef;
  accent: string;
  soft: string;
}) {
  const raw = cliente[col.key];
  const isMoney = col.kind === "money";
  const base: CSSProperties = {
    padding: "11px 14px",
    whiteSpace: "nowrap",
    color: col.key === "nombre" ? T.ink : T.muted,
    textAlign: isMoney ? "right" : "left",
  };

  if (col.kind === "pill") {
    const [fg, bg] =
      col.key === "estado"
        ? (ESTADO_TONE[cliente.estado] ?? [T.muted, T.paper])
        : [accent, soft];
    return (
      <td style={{ ...base, padding: "9px 14px" }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 20,
            background: bg,
            color: fg,
          }}
        >
          {String(raw)}
        </span>
      </td>
    );
  }

  if (col.kind === "name") {
    return (
      <td style={{ ...base, padding: "9px 14px" }}>
        <span style={{ display: "block", fontSize: 13, color: T.ink }}>
          {String(raw)}
        </span>
        <span
          style={{ display: "block", marginTop: 2, fontSize: 11, color: T.faint }}
        >
          {cliente.correo}
        </span>
      </td>
    );
  }

  const text = isMoney
    ? money(raw as number | null)
    : raw === "" || raw == null
      ? "—"
      : String(raw);

  return (
    <td className={col.kind === "mono" || isMoney ? "mono" : ""} style={base}>
      {text}
    </td>
  );
}
