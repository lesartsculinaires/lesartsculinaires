"use client";

import type { CSSProperties } from "react";

import { CANALES, ESTADOS, ESTADO_TONE, ETAPAS, ETAPA_DESC, LOST, TERRITORIOS } from "@/data/taxonomia";
import { PROGRAMAS } from "@/data/programas";
import { Drawer, DrawerClose, SectionLabel } from "@/components/ui/Drawer";
import { FilterMenu, type MenuValue } from "@/components/ui/FilterMenu";
import { money } from "@/lib/format";
import { T, softer } from "@/lib/theme";
import type { Cliente, ClientePatch } from "@/lib/types";

interface Props {
  cliente: Cliente;
  accent: string;
  menu: string | null;
  onToggleMenu: (key: string) => void;
  onPatch: (id: string, patch: ClientePatch) => void;
  onClose: () => void;
}

/** Editable classification fields, each backed by a controlled dropdown. */
const CLASIFICACION: {
  key: "etapa" | "estado" | "producto" | "canal" | "territorio";
  label: string;
  values: readonly string[];
}[] = [
  { key: "etapa", label: "Etapa", values: ETAPAS },
  { key: "estado", label: "Estado", values: ESTADOS },
  { key: "producto", label: "Programa", values: PROGRAMAS.map((p) => p.nombre) },
  { key: "canal", label: "Canal", values: CANALES },
  { key: "territorio", label: "Territorio", values: TERRITORIOS },
];

export function ClienteDrawer({
  cliente: c,
  accent,
  menu,
  onToggleMenu,
  onPatch,
  onClose,
}: Props) {
  const soft = softer(accent);
  const stageIdx = ETAPAS.indexOf(c.etapa);
  const lost = c.etapa === LOST;
  const [estadoFg, estadoBg] = ESTADO_TONE[c.estado] ?? [T.muted, T.paper];

  const miniBtn: CSSProperties = {
    height: 28,
    padding: "0 11px",
    fontSize: 12,
    borderRadius: 6,
    background: T.surface,
    border: `1px solid ${T.border}`,
    color: T.ink,
  };

  const registro: [string, string, string][] = [
    ["Fecha de ingreso", c.fecha, "mono"],
    ["Mes", c.mes, ""],
    ["Vendedor asignado", c.vendedor, ""],
    ["Descuento / promoción", c.descuento || "—", ""],
  ];

  const cajas = [
    {
      label: "Valor oportunidad",
      value: money(c.valor),
      background: T.paper,
      fontSize: 17,
      color: undefined as string | undefined,
    },
    {
      label: "Venta cerrada",
      value: money(c.cerrada),
      background: c.cerrada ? soft : T.paper,
      fontSize: 17,
      color: c.cerrada ? accent : T.faint,
    },
    {
      label: "Descuento / promoción",
      value: c.descuento || "—",
      background: T.paper,
      fontSize: 13,
      color: undefined,
    },
  ];

  return (
    <Drawer width={500} onClose={onClose}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <p
            className="mono"
            style={{
              margin: "0 0 5px",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: T.faint,
            }}
          >
            {c.id} · {c.fecha}
          </p>
          <h2
            className="dsp"
            style={{ margin: "0 0 4px", fontSize: 23, fontWeight: 700, lineHeight: 1.15 }}
          >
            {c.nombre}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            {c.producto} · {c.territorio}
          </p>
        </div>
        <DrawerClose onClose={onClose} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <span
          style={{
            fontSize: 12,
            padding: "4px 11px",
            borderRadius: 20,
            background: estadoBg,
            color: estadoFg,
          }}
        >
          {c.estado}
        </span>
        <span
          style={{
            fontSize: 12,
            padding: "4px 11px",
            borderRadius: 20,
            background: T.paper,
            color: T.muted,
          }}
        >
          {c.canal}
        </span>
      </div>

      <SectionLabel>Etapa del proceso</SectionLabel>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {ETAPAS.map((label, i) => {
          // A lost lead lights only its own step; the funnel never "completed".
          const done = lost ? i === stageIdx : i <= stageIdx;
          return (
            <div
              key={label}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: done ? (lost ? "#B85042" : accent) : T.border,
              }}
            />
          );
        })}
      </div>
      <p style={{ margin: "0 0 22px", fontSize: 12, color: T.muted }}>
        Etapa {stageIdx + 1} de {ETAPAS.length} · {c.etapa} — {ETAPA_DESC[c.etapa] ?? ""}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {cajas.map((m) => (
          <div
            key={m.label}
            style={{ background: m.background, borderRadius: 8, padding: "11px 12px" }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 11, color: T.muted, lineHeight: 1.3 }}>
              {m.label}
            </p>
            <p
              className="mono dsp"
              style={{
                margin: 0,
                fontSize: m.fontSize,
                fontWeight: 500,
                lineHeight: m.fontSize === 13 ? 1.3 : undefined,
                color: m.color,
              }}
            >
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <SectionLabel>Clasificación</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {CLASIFICACION.map((f) => {
          const key = `d:${f.key}`;
          return (
            <FilterMenu
              key={key}
              menuKey={key}
              label={f.label}
              variant="stacked"
              options={f.values.map((v) => ({ label: v, value: v }))}
              current={c[f.key]}
              open={menu === key}
              accent={accent}
              onToggle={() => onToggleMenu(key)}
              onPick={(v: MenuValue) =>
                onPatch(c.id, { [f.key]: v } as ClientePatch)
              }
            />
          );
        })}
      </div>

      <SectionLabel>Registro</SectionLabel>
      <div
        style={{ border: `1px solid ${T.border}`, borderRadius: 9, marginBottom: 20 }}
      >
        {registro.map(([label, value, cls], i) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              padding: "9px 13px",
              borderTop: i ? `1px solid ${T.border}` : "none",
            }}
          >
            <span style={{ fontSize: 12, color: T.muted }}>{label}</span>
            <span className={cls} style={{ fontSize: 13, textAlign: "right" }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <SectionLabel>Contacto</SectionLabel>
      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: T.paper,
            borderRadius: 8,
            padding: "11px 14px",
          }}
        >
          <span className="mono" style={{ fontSize: 13 }}>
            {c.tel}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={miniBtn}>
              Llamar
            </button>
            <button type="button" style={miniBtn}>
              WhatsApp
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: T.paper,
            borderRadius: 8,
            padding: "11px 14px",
          }}
        >
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.correo}
          </span>
          <button type="button" style={miniBtn}>
            Escribir
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={{
            flex: 1,
            height: 38,
            fontSize: 13,
            borderRadius: 7,
            background: accent,
            color: "#fff",
          }}
        >
          Registrar seguimiento
        </button>
        <button
          type="button"
          onClick={() => onPatch(c.id, { etapa: "Ganado", estado: "Ganado" })}
          style={{
            flex: 1,
            height: 38,
            fontSize: 13,
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            color: T.ink,
            background: T.surface,
          }}
        >
          Marcar como ganado
        </button>
      </div>
    </Drawer>
  );
}
