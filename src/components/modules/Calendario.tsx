"use client";

import { useMemo, useState } from "react";

import { createEvento, updateEvento } from "@/app/actions";
import { useCatalogo } from "@/lib/catalog";
import { diaMes, eventCount, horaDe } from "@/lib/format";
import { T, softer } from "@/lib/theme";
import type { Evento, Oportunidad, TipoEvento } from "@/lib/types";

interface Props {
  eventos: Evento[];
  oportunidades: Oportunidad[];
  accent: string;
  onRefresh: () => void;
}

/** Group events by calendar day, earliest first within each day. */
function porDia(eventos: readonly Evento[]) {
  const map = new Map<string, Evento[]>();
  for (const e of eventos) {
    const dia = e.iniciaEn.slice(0, 10);
    map.set(dia, [...(map.get(dia) ?? []), e]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, evs]) => ({
      dia,
      evs: evs.sort((a, b) => a.iniciaEn.localeCompare(b.iniciaEn)),
    }));
}

const badge = (tipo: TipoEvento | undefined, size = 20) => ({
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  width: size,
  height: size,
  flexShrink: 0,
  borderRadius: 5,
  background: tipo?.color ?? "#6B665F",
  color: "#fff",
  fontSize: size > 18 ? 10.5 : 9.5,
  letterSpacing: "0.02em",
});

const ESTADO_TONE: Record<string, [string, string]> = {
  Realizado: ["#2F6B4F", "#E6F0E9"],
  "No se presentó": ["#B85042", "#F7EBE9"],
  Reagendado: ["#9C7118", "#F6EEDC"],
};

export function Calendario({ eventos, oportunidades, accent, onRefresh }: Props) {
  const { tiposEvento, vendedores } = useCatalogo();
  const soft = softer(accent);

  const [creando, setCreando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opId, setOpId] = useState("");
  const [tipoId, setTipoId] = useState(0);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState("09:00");

  const tipoDe = (id: number) => tiposEvento.find((t) => t.id === id);
  const opDe = (id: number) => oportunidades.find((o) => o.id === id);

  const dias = useMemo(() => porDia(eventos), [eventos]);
  const pendientes = eventos.filter((e) => e.estado === "Pendiente").length;

  const crear = async () => {
    const oportunidadId = Number(opId);
    if (!oportunidadId) {
      setError("Elegí a qué oportunidad pertenece el evento.");
      return;
    }
    setBusy(true);
    setError(null);

    const op = opDe(oportunidadId);
    const tipo = tipoDe(tipoId);
    const r = await createEvento({
      oportunidad_id: oportunidadId,
      tipo_id: tipoId,
      vendedor_id: op?.vendedorId ?? null,
      inicia_en: new Date(`${fecha}T${hora}:00`).toISOString(),
      duracion_min: tipo?.duracionMin ?? 30,
      canal: tipoId === 1 ? "Presencial" : "Llamada",
    });

    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setCreando(false);
    setOpId("");
    onRefresh();
  };

  const marcarRealizado = async (e: Evento) => {
    setBusy(true);
    const r = await updateEvento(e.id, { estado: "Realizado" });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else onRefresh();
  };

  const field = {
    height: 34,
    padding: "0 10px",
    fontSize: 13,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    background: T.surface,
  } as const;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <span className="dsp" style={{ fontSize: 15, fontWeight: 500 }}>
          Agenda de seguimiento
        </span>
        <span style={{ fontSize: 12, color: T.muted }}>
          {eventos.length === 0
            ? "Sin eventos agendados"
            : `${eventCount(eventos.length)} · ${pendientes} pendientes`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          style={{
            height: 34,
            padding: "0 14px",
            fontSize: 13,
            borderRadius: 6,
            background: creando ? T.surface : accent,
            border: creando ? `1px solid ${T.border}` : "none",
            color: creando ? T.muted : "#fff",
          }}
        >
          {creando ? "Cancelar" : "Nuevo evento"}
        </button>
      </div>

      {creando && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
            padding: 16,
            marginBottom: 14,
            background: T.surface,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: 10,
          }}
        >
          <label style={{ display: "grid", gap: 4, flex: "2 1 280px" }}>
            <span style={{ fontSize: 11.5, color: T.muted }}>Oportunidad</span>
            <select value={opId} onChange={(e) => setOpId(e.target.value)} style={field}>
              <option value="">Elegí una…</option>
              {oportunidades.slice(0, 300).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo} · {o.cliente} · {o.producto}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, flex: "1 1 200px" }}>
            <span style={{ fontSize: 11.5, color: T.muted }}>Tipo</span>
            <select
              value={tipoId}
              onChange={(e) => setTipoId(Number(e.target.value))}
              style={field}
            >
              {tiposEvento.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} ({t.duracionMin}′)
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, color: T.muted }}>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={field}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, color: T.muted }}>Hora</span>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              style={field}
            />
          </label>

          <button
            type="button"
            onClick={crear}
            disabled={busy}
            style={{
              height: 34,
              padding: "0 16px",
              fontSize: 13,
              borderRadius: 6,
              background: busy ? T.border : accent,
              color: busy ? T.faint : "#fff",
            }}
          >
            {busy ? "Guardando…" : "Agendar"}
          </button>
        </div>
      )}

      {error && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            fontSize: 12.5,
            borderRadius: 9,
            background: "#F7EBE9",
            color: "#8C3B2F",
          }}
        >
          {error}
        </p>
      )}

      {tiposEvento.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 14,
            padding: "11px 14px",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 9,
          }}
        >
          {tiposEvento.map((t) => (
            <span
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                color: T.muted,
              }}
            >
              <span className="mono" style={badge(t)}>
                {t.codigo}
              </span>
              {t.nombre}
              <span className="mono" style={{ fontSize: 10, color: T.faint }}>
                {t.duracionMin}′
              </span>
            </span>
          ))}
        </div>
      )}

      {eventos.length === 0 ? (
        <div
          style={{
            background: T.surface,
            border: `1px dashed ${T.borderStrong}`,
            borderRadius: 10,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <h3 className="dsp" style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>
            La agenda está vacía
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
            Todavía no hay actividades agendadas. Creá la primera con{" "}
            <strong style={{ fontWeight: 500 }}>Nuevo evento</strong>.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {dias.map(({ dia, evs }, k) => (
            <div
              key={dia}
              style={{ padding: "15px 18px", borderTop: k ? `1px solid ${T.border}` : "none" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span className="dsp" style={{ fontSize: 14, fontWeight: 500 }}>
                  {diaMes(dia)}
                </span>
                <span style={{ fontSize: 11.5, color: T.faint }}>
                  {eventCount(evs.length)}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {evs.map((e) => {
                  const tipo = tipoDe(e.tipoId);
                  const op = opDe(e.oportunidadId);
                  const [fg, bg] = ESTADO_TONE[e.estado] ?? [accent, soft];
                  const vendedor = vendedores.find((v) => v.id === e.vendedorId);
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 11px",
                        borderRadius: 8,
                        background: T.paper,
                        borderLeft: `3px solid ${tipo?.color ?? T.border}`,
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 11.5, color: T.muted, width: 44 }}
                      >
                        {horaDe(e.iniciaEn)}
                      </span>
                      <span className="mono" style={badge(tipo, 18)}>
                        {tipo?.codigo}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontSize: 13 }}>
                          {op ? op.cliente : "Oportunidad no encontrada"}
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: T.faint }}>
                          {tipo?.nombre}
                          {op ? ` · ${op.producto}` : ""}
                          {vendedor ? ` · ${vendedor.nombre}` : ""}
                        </span>
                      </span>
                      {e.estado === "Pendiente" && (
                        <button
                          type="button"
                          onClick={() => marcarRealizado(e)}
                          disabled={busy}
                          style={{
                            flexShrink: 0,
                            height: 28,
                            padding: "0 11px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: `1px solid ${accent}`,
                            color: accent,
                          }}
                        >
                          Marcar realizado
                        </button>
                      )}
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 11,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: bg,
                          color: fg,
                        }}
                      >
                        {e.estado}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
