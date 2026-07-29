"use client";

import { useState } from "react";

import { addNota } from "@/app/actions";
import { Drawer, DrawerClose, SectionLabel } from "@/components/ui/Drawer";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useCatalogo } from "@/lib/catalog";
import { fechaCorta, mesLargo, money } from "@/lib/format";
import { estadoTone } from "@/lib/selectors";
import { T, softer } from "@/lib/theme";
import type { CatalogItem, Oportunidad, OportunidadPatch } from "@/lib/types";

interface Props {
  oportunidad: Oportunidad;
  accent: string;
  menu: string | null;
  onToggleMenu: (key: string) => void;
  onEditar: (
    id: number,
    patch: OportunidadPatch,
    display: Partial<Oportunidad>,
  ) => void;
  onClose: () => void;
}

export function ClienteDrawer({
  oportunidad: o,
  accent,
  menu,
  onToggleMenu,
  onEditar,
  onClose,
}: Props) {
  const cat = useCatalogo();
  const soft = softer(accent);
  const [nota, setNota] = useState("");
  const [notaEstado, setNotaEstado] = useState<"idle" | "guardando" | "listo">("idle");

  const [estadoFg, estadoBg] = estadoTone(o.estado, accent);

  /**
   * Each dropdown writes the foreign key and, separately, the label the UI
   * shows — so the change is visible immediately without a re-fetch.
   */
  const campos: {
    key: string;
    label: string;
    items: CatalogItem[];
    current: number | null;
    columna: keyof OportunidadPatch;
    display: keyof Oportunidad;
    displayId: keyof Oportunidad;
  }[] = [
    { key: "etapa", label: "Etapa", items: cat.etapas, current: o.etapaId, columna: "etapa_id", display: "etapa", displayId: "etapaId" },
    { key: "estado", label: "Estado", items: cat.estados, current: o.estadoId, columna: "estado_id", display: "estado", displayId: "estadoId" },
    { key: "producto", label: "Programa", items: cat.productos, current: o.productoId, columna: "producto_id", display: "producto", displayId: "productoId" },
    { key: "vendedor", label: "Vendedor", items: cat.vendedores, current: o.vendedorId, columna: "vendedor_id", display: "vendedor", displayId: "vendedorId" },
    { key: "canal", label: "Canal", items: cat.canales, current: o.canalId, columna: "canal_id", display: "canal", displayId: "canalId" },
    { key: "territorio", label: "Territorio", items: cat.territorios, current: o.territorioId, columna: "territorio_id", display: "territorio", displayId: "territorioId" },
  ];

  const etapaIdx = cat.etapas.findIndex((e) => e.id === o.etapaId);
  const perdida = o.estado === "Perdido";

  const registro: [string, string][] = [
    ["Código", o.codigo],
    ["Fecha de registro", fechaCorta(o.fechaRegistro)],
    ["Mes", mesLargo(o.mes)],
    ["Fecha de cierre", o.fechaCierre ? fechaCorta(o.fechaCierre) : "—"],
    ["Descuento / promoción", o.descuento ?? "—"],
  ];

  const guardarNota = async () => {
    if (!nota.trim()) return;
    setNotaEstado("guardando");
    const r = await addNota(o.id, nota);
    setNotaEstado(r.ok ? "listo" : "idle");
    if (r.ok) setNota("");
  };

  const miniBtn = {
    height: 28,
    padding: "0 11px",
    fontSize: 12,
    borderRadius: 6,
    background: T.surface,
    border: `1px solid ${T.border}`,
    color: T.ink,
  } as const;

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
        <div style={{ minWidth: 0 }}>
          <p
            className="mono"
            style={{ margin: "0 0 5px", fontSize: 11, letterSpacing: "0.08em", color: T.faint }}
          >
            {o.codigo} · {fechaCorta(o.fechaRegistro)}
          </p>
          <h2
            className="dsp"
            style={{ margin: "0 0 4px", fontSize: 23, fontWeight: 700, lineHeight: 1.15 }}
          >
            {o.cliente}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            {o.producto} · {o.territorio}
          </p>
        </div>
        <DrawerClose onClose={onClose} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: estadoBg, color: estadoFg }}>
          {o.estado}
        </span>
        <span style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, background: T.paper, color: T.muted }}>
          {o.canal}
        </span>
      </div>

      <SectionLabel>Etapa del proceso</SectionLabel>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {cat.etapas.map((e, i) => {
          // A lost deal lights only its own step; the funnel never completed.
          const done = perdida ? i === etapaIdx : etapaIdx >= 0 && i <= etapaIdx;
          return (
            <div
              key={e.id}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: done ? (perdida ? "#B85042" : accent) : T.border,
              }}
            />
          );
        })}
      </div>
      <p style={{ margin: "0 0 22px", fontSize: 12, color: T.muted }}>
        {etapaIdx >= 0
          ? `Etapa ${etapaIdx + 1} de ${cat.etapas.length} · ${o.etapa}`
          : "Sin etapa asignada"}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Valor oportunidad", value: money(o.valor), bg: T.paper, color: undefined as string | undefined },
          { label: "Venta cerrada", value: money(o.cerrada), bg: o.cerrada ? soft : T.paper, color: o.cerrada ? accent : T.faint },
          { label: "Descuento", value: o.descuento ?? "—", bg: T.paper, color: undefined },
        ].map((m) => (
          <div key={m.label} style={{ background: m.bg, borderRadius: 8, padding: "11px 12px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: T.muted, lineHeight: 1.3 }}>
              {m.label}
            </p>
            <p
              className="mono dsp"
              style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: m.color }}
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
        {campos.map((f) => {
          const key = `d:${f.key}`;
          return (
            <FilterMenu
              key={key}
              menuKey={key}
              label={f.label}
              variant="stacked"
              options={f.items.map((i) => ({ label: i.nombre, value: i.id }))}
              current={f.current}
              valueText={f.items.find((i) => i.id === f.current)?.nombre ?? "—"}
              open={menu === key}
              accent={accent}
              onToggle={() => onToggleMenu(key)}
              onPick={(v) => {
                const id = v as number;
                const nombre = f.items.find((i) => i.id === id)?.nombre ?? "—";
                onEditar(
                  o.id,
                  { [f.columna]: id } as OportunidadPatch,
                  { [f.display]: nombre, [f.displayId]: id } as Partial<Oportunidad>,
                );
              }}
            />
          );
        })}
      </div>

      <SectionLabel>Registro</SectionLabel>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, marginBottom: 20 }}>
        {registro.map(([label, value], i) => (
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
            <span style={{ fontSize: 13, textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>

      <SectionLabel>Contacto</SectionLabel>
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
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
          <span className="mono" style={{ fontSize: 13 }}>{o.telefono ?? "Sin teléfono"}</span>
          {o.telefono && (
            <div style={{ display: "flex", gap: 6 }}>
              <a href={`tel:${o.telefono}`} style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}>
                Llamar
              </a>
              <a
                href={`https://wa.me/503${o.telefono}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}
              >
                WhatsApp
              </a>
            </div>
          )}
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
            {o.correo ?? "Sin correo"}
          </span>
          {o.correo && (
            <a href={`mailto:${o.correo}`} style={{ ...miniBtn, textDecoration: "none", lineHeight: "28px" }}>
              Escribir
            </a>
          )}
        </div>
      </div>

      <SectionLabel>Registrar seguimiento</SectionLabel>
      <textarea
        value={nota}
        onChange={(e) => {
          setNota(e.target.value);
          setNotaEstado("idle");
        }}
        placeholder="Qué pasó en el contacto, objeciones, acuerdos…"
        style={{
          width: "100%",
          minHeight: 74,
          padding: "11px 13px",
          font: "inherit",
          fontSize: 13,
          color: T.ink,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          background: T.paper,
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={guardarNota}
          disabled={!nota.trim() || notaEstado === "guardando"}
          style={{
            height: 36,
            padding: "0 16px",
            fontSize: 13,
            borderRadius: 7,
            background: nota.trim() ? accent : T.border,
            color: nota.trim() ? "#fff" : T.faint,
            cursor: nota.trim() ? "pointer" : "not-allowed",
          }}
        >
          {notaEstado === "guardando" ? "Guardando…" : "Guardar nota"}
        </button>
        {notaEstado === "listo" && (
          <span style={{ fontSize: 12, color: "#2F6B4F" }}>Nota guardada.</span>
        )}
      </div>
    </Drawer>
  );
}
