"use client";

import { useState } from "react";

import { crearCliente, type NuevoCliente } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { T } from "@/lib/theme";
import type { CatalogItem } from "@/lib/types";

interface Props {
  accent: string;
  onCerrar: () => void;
  /** Se llama tras un alta exitosa, con el código asignado. */
  onCreado: (codigo: string) => void;
}

/** Hoy en formato ISO, en hora local — no UTC, que en El Salvador va un día atrás. */
function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const vacio = (): NuevoCliente => ({
  nombre: "",
  telefono: null,
  correo: null,
  vendedor_id: null,
  producto_id: null,
  territorio_id: null,
  canal_id: null,
  etapa_id: null,
  estado_id: null,
  fecha_registro: hoyISO(),
  fecha_cierre: null,
  valor_oportunidad: null,
  descuento_promocion: null,
});

/** Texto vacío → null, para no guardar cadenas en blanco. */
const oNull = (v: string): string | null => (v.trim() ? v.trim() : null);

export function NuevoClienteForm({ accent, onCerrar, onCreado }: Props) {
  const cat = useCatalogo();
  const [d, setD] = useState<NuevoCliente>(vacio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof NuevoCliente>(k: K, v: NuevoCliente[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const guardar = async () => {
    setBusy(true);
    setError(null);
    const r = await crearCliente(d);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCreado(r.codigo ?? "");
  };

  const campo = {
    width: "100%",
    height: 34,
    padding: "0 10px",
    fontSize: 13,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    background: T.surface,
    color: T.ink,
  } as const;

  const Etiqueta = ({
    texto,
    children,
  }: {
    texto: string;
    children: React.ReactNode;
  }) => (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
        {texto}
      </span>
      {children}
    </label>
  );

  const Select = ({
    valor,
    items,
    onPick,
  }: {
    valor: number | null;
    items: readonly CatalogItem[];
    onPick: (v: number | null) => void;
  }) => (
    <select
      value={valor ?? ""}
      onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}
      style={campo}
    >
      <option value="">Sin definir</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.nombre}
        </option>
      ))}
    </select>
  );

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 11,
  } as const;

  const seccion = {
    margin: "0 0 9px",
    fontSize: 10,
    letterSpacing: "0.1em",
    color: T.faint,
    textTransform: "uppercase",
  } as const;

  return (
    <>
      <div
        onClick={onCerrar}
        style={{ position: "fixed", inset: 0, background: "rgba(31,29,26,0.35)", zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-label="Nuevo cliente"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(760px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: T.paper,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          zIndex: 80,
          boxShadow: "0 12px 40px rgba(31,29,26,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            padding: "16px 20px",
            borderBottom: `1px solid ${T.border}`,
            background: T.surface,
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div>
            <p className="dsp" style={{ margin: "0 0 3px", fontSize: 17, fontWeight: 700 }}>
              Nuevo cliente
            </p>
            <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
              Se crea el cliente y su primera oportunidad. El código se asigna solo.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ fontSize: 18, color: T.faint, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <p className="mono" style={seccion}>
            Datos del cliente
          </p>
          <div style={{ ...grid, marginBottom: 20 }}>
            <Etiqueta texto="Nombre *">
              <input
                value={d.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Nombre y apellido"
                autoFocus
                style={campo}
              />
            </Etiqueta>
            <Etiqueta texto="Teléfono">
              <input
                value={d.telefono ?? ""}
                onChange={(e) => set("telefono", oNull(e.target.value))}
                placeholder="opcional"
                style={campo}
              />
            </Etiqueta>
            <Etiqueta texto="Correo">
              <input
                type="email"
                value={d.correo ?? ""}
                onChange={(e) => set("correo", oNull(e.target.value))}
                placeholder="opcional"
                style={campo}
              />
            </Etiqueta>
          </div>

          <p className="mono" style={seccion}>
            Oportunidad
          </p>
          <div style={{ ...grid, marginBottom: 20 }}>
            <Etiqueta texto="Programa">
              <Select valor={d.producto_id} items={cat.productos} onPick={(v) => set("producto_id", v)} />
            </Etiqueta>
            <Etiqueta texto="Vendedor">
              <Select valor={d.vendedor_id} items={cat.vendedores} onPick={(v) => set("vendedor_id", v)} />
            </Etiqueta>
            <Etiqueta texto="Etapa">
              <Select valor={d.etapa_id} items={cat.etapas} onPick={(v) => set("etapa_id", v)} />
            </Etiqueta>
            <Etiqueta texto="Estado">
              <Select valor={d.estado_id} items={cat.estados} onPick={(v) => set("estado_id", v)} />
            </Etiqueta>
            <Etiqueta texto="Canal">
              <Select valor={d.canal_id} items={cat.canales} onPick={(v) => set("canal_id", v)} />
            </Etiqueta>
            <Etiqueta texto="Territorio">
              <Select valor={d.territorio_id} items={cat.territorios} onPick={(v) => set("territorio_id", v)} />
            </Etiqueta>
          </div>

          <p className="mono" style={seccion}>
            Fechas y montos
          </p>
          <div style={grid}>
            <Etiqueta texto="Fecha de registro *">
              <input
                type="date"
                value={d.fecha_registro}
                onChange={(e) => set("fecha_registro", e.target.value)}
                style={campo}
              />
            </Etiqueta>
            <Etiqueta texto="Fecha de cierre">
              <input
                type="date"
                value={d.fecha_cierre ?? ""}
                onChange={(e) => set("fecha_cierre", e.target.value || null)}
                style={campo}
              />
            </Etiqueta>
            <Etiqueta texto="Valor de la oportunidad">
              <input
                type="number"
                min="0"
                step="0.01"
                value={d.valor_oportunidad ?? ""}
                onChange={(e) =>
                  set("valor_oportunidad", e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder="0.00"
                style={campo}
              />
            </Etiqueta>
            <Etiqueta texto="Descuento o promoción">
              <input
                value={d.descuento_promocion ?? ""}
                onChange={(e) => set("descuento_promocion", oNull(e.target.value))}
                placeholder="opcional"
                style={campo}
              />
            </Etiqueta>
          </div>

          {error && (
            <p
              style={{
                margin: "16px 0 0",
                padding: "10px 13px",
                fontSize: 12.5,
                borderRadius: 7,
                background: "#F7EBE9",
                color: "#8C3B2F",
              }}
            >
              {error}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderTop: `1px solid ${T.border}`,
            background: T.surface,
            borderRadius: "0 0 12px 12px",
          }}
        >
          <button type="button" onClick={onCerrar} style={{ fontSize: 13, color: T.muted, padding: "0 8px" }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={busy || !d.nombre.trim()}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 13,
              borderRadius: 7,
              background: !busy && d.nombre.trim() ? accent : T.border,
              color: !busy && d.nombre.trim() ? "#fff" : T.faint,
              cursor: !busy && d.nombre.trim() ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Guardando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </>
  );
}
