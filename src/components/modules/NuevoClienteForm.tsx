"use client";

import { useMemo, useState } from "react";

import { crearCliente, type NuevoCliente } from "@/app/actions";
import { CampoTexto } from "@/components/ui/CampoTexto";
import { useCatalogo } from "@/lib/catalog";
import {
  buscarDuplicados,
  describirMotivos,
  type Coincidencia,
  type ContactoConocido,
} from "@/lib/duplicados";
import { T } from "@/lib/theme";
import type { CatalogItem, Oportunidad } from "@/lib/types";

interface Props {
  accent: string;
  /** De acá salen los contactos ya guardados con los que comparar. */
  oportunidades: readonly Oportunidad[];
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

/**
 * `Etiqueta` y `Select` viven fuera del componente a propósito.
 *
 * Declaradas adentro, React las ve como un tipo distinto en cada render:
 * desmonta el subárbol y lo vuelve a montar, así que el <input> se destruye
 * y se recrea con cada tecla. Además de ser un desperdicio, hace imposible
 * controlar dónde queda el cursor, que es justo lo que necesita el teclado
 * de acentos.
 */
const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  fontSize: 13,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  background: T.surface,
  color: T.ink,
};

function Etiqueta({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", marginBottom: 4, fontSize: 11.5, color: T.muted }}>
        {texto}
      </span>
      {children}
    </label>
  );
}

function Select({
  valor,
  items,
  onPick,
}: {
  valor: number | null;
  items: readonly CatalogItem[];
  onPick: (v: number | null) => void;
}) {
  return (
    <select
      value={valor ?? ""}
      onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}
      style={CAMPO}
    >
      <option value="">Sin definir</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.nombre}
        </option>
      ))}
    </select>
  );
}

export function NuevoClienteForm({ accent, oportunidades, onCerrar, onCreado }: Props) {
  const cat = useCatalogo();
  const [d, setD] = useState<NuevoCliente>(vacio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Coincidencias que devolvió el servidor al intentar guardar. */
  const [choque, setChoque] = useState<Coincidencia[] | null>(null);

  // Un contacto puede tener varias oportunidades; interesa una sola vez.
  const conocidos: ContactoConocido[] = useMemo(() => {
    const m = new Map<number, ContactoConocido>();
    for (const o of oportunidades) {
      if (!m.has(o.clienteId)) {
        m.set(o.clienteId, {
          clienteId: o.clienteId,
          nombre: o.cliente,
          telefono: o.telefono,
          correo: o.correo,
          codigo: o.codigo,
        });
      }
    }
    return [...m.values()];
  }, [oportunidades]);

  // Aviso en vivo mientras se escribe, contra la copia que ya tiene la
  // pantalla. Es instantáneo y sin pedidos al servidor; la palabra final la
  // tiene igual el servidor al guardar.
  const posibles = useMemo(
    () => buscarDuplicados({ nombre: d.nombre, telefono: d.telefono, correo: d.correo }, conocidos),
    [d.nombre, d.telefono, d.correo, conocidos],
  );

  const coincidencias = choque ?? posibles;

  const set = <K extends keyof NuevoCliente>(k: K, v: NuevoCliente[K]) => {
    setChoque(null);
    setD((prev) => ({ ...prev, [k]: v }));
  };

  const guardar = async (forzar = false) => {
    setBusy(true);
    setError(null);
    const r = await crearCliente(d, forzar);
    setBusy(false);

    if (!r.ok) {
      if (r.coincidencias && r.coincidencias.length > 0) {
        // El servidor encontró algo que la pantalla no tenía: alguien más lo
        // creó mientras se llenaba el formulario.
        setChoque(r.coincidencias);
        setError(null);
        return;
      }
      setError(r.error);
      return;
    }
    onCreado(r.codigo ?? "");
  };

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
              <CampoTexto
                valor={d.nombre}
                onCambio={(v) => set("nombre", v)}
                placeholder="Nombre y apellido"
                autoFocus
                accent={accent}
                esNombre
              />
            </Etiqueta>
            <Etiqueta texto="Teléfono">
              <input
                value={d.telefono ?? ""}
                onChange={(e) => set("telefono", oNull(e.target.value))}
                placeholder="opcional"
                style={CAMPO}
              />
            </Etiqueta>
            <Etiqueta texto="Correo">
              <input
                type="email"
                value={d.correo ?? ""}
                onChange={(e) => set("correo", oNull(e.target.value))}
                placeholder="opcional"
                style={CAMPO}
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
                style={CAMPO}
              />
            </Etiqueta>
            <Etiqueta texto="Fecha de cierre">
              <input
                type="date"
                value={d.fecha_cierre ?? ""}
                onChange={(e) => set("fecha_cierre", e.target.value || null)}
                style={CAMPO}
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
                style={CAMPO}
              />
            </Etiqueta>
            <Etiqueta texto="Descuento o promoción">
              <input
                value={d.descuento_promocion ?? ""}
                onChange={(e) => set("descuento_promocion", oNull(e.target.value))}
                placeholder="opcional"
                style={CAMPO}
              />
            </Etiqueta>
          </div>

          {coincidencias.length > 0 && (
            <div
              role="alert"
              style={{
                margin: "16px 0 0",
                padding: "12px 14px",
                borderRadius: 8,
                background: "#FFF6D6",
                border: "1px solid #F0CE55",
                color: "#6B5200",
              }}
            >
              <p style={{ margin: "0 0 7px", fontSize: 12.5, fontWeight: 600 }}>
                {choque
                  ? "Este contacto se acaba de crear en otra sesión."
                  : coincidencias.length === 1
                    ? "Este contacto ya existe en la base de datos."
                    : `Hay ${coincidencias.length} contactos que ya existen con estos datos.`}
              </p>

              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {coincidencias.slice(0, 4).map((c) => (
                  <li
                    key={c.clienteId}
                    style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 4 }}
                  >
                    <strong>{c.nombre}</strong>
                    {c.codigo && (
                      <span className="mono" style={{ marginLeft: 6, fontSize: 11.5 }}>
                        {c.codigo}
                      </span>
                    )}
                    <span style={{ display: "block" }}>
                      Coincide {describirMotivos(c.motivos)}
                      {c.telefono || c.correo ? " — " : ""}
                      {[c.telefono, c.correo].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
                {coincidencias.length > 4 && (
                  <li style={{ fontSize: 12, marginTop: 4 }}>
                    y {coincidencias.length - 4} más.
                  </li>
                )}
              </ul>

              <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                Si es la misma persona, cerrá esto y buscala en la lista para
                agregarle la oportunidad ahí. Si de verdad es alguien distinto,
                podés crearla igual.
              </p>
            </div>
          )}

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
            onClick={() => guardar(coincidencias.length > 0)}
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
            {busy
              ? "Guardando…"
              : coincidencias.length > 0
                ? "Crear igual"
                : "Crear cliente"}
          </button>
        </div>
      </div>
    </>
  );
}
