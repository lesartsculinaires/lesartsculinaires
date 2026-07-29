"use client";

import { CANALES_EV, ESTADOS_EV, NEXT_WHEN, TIPOS } from "@/data/calendario";
import { VENDEDORES } from "@/data/vendedores";
import { Drawer, DrawerClose, SectionLabel } from "@/components/ui/Drawer";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { hora } from "@/lib/format";
import {
  LAST_INDEX,
  badgeStyle,
  dayLabel,
  dowLabel,
  type EventoVista,
} from "@/lib/calendar";
import { T, softer } from "@/lib/theme";
import type { EventoPatch } from "@/lib/types";

interface Props {
  evento: EventoVista;
  accent: string;
  menu: string | null;
  closing: boolean;
  nextTipo: number | null;
  nextWhen: number | null;
  onToggleMenu: (key: string) => void;
  onPatch: (id: string, patch: EventoPatch) => void;
  onOpenLead: (leadId: string) => void;
  onStartClose: () => void;
  onCancelClose: () => void;
  onSetNextTipo: (t: number) => void;
  onSetNextWhen: (offset: number) => void;
  onConfirmClose: (
    source: EventoVista,
    tipo: number,
    offset: number,
    nextIdx: number,
    nextText: string,
  ) => void;
  onClose: () => void;
}

/** Index of the "Clase muestra o demo" type, the one needing an instructor. */
const DEMO_TIPO = 2;

export function EventoDrawer({
  evento: e,
  accent,
  menu,
  closing,
  nextTipo,
  nextWhen,
  onToggleMenu,
  onPatch,
  onOpenLead,
  onStartClose,
  onCancelClose,
  onSetNextTipo,
  onSetNextWhen,
  onConfirmClose,
  onClose,
}: Props) {
  const soft = softer(accent);
  const canClose = e.estado === "Pendiente" && !closing;
  const ready = nextTipo != null && nextWhen != null;

  const detalle = [
    {
      key: "estado",
      label: "Estado",
      options: ESTADOS_EV.map((v) => ({ label: v, value: v })),
      current: e.estado as string | number,
      valueText: undefined as string | undefined,
    },
    {
      key: "t",
      label: "Tipo",
      options: TIPOS.map((t, i) => ({ label: t.label, value: i })),
      current: e.t,
      valueText: TIPOS[e.t].label,
    },
    {
      key: "vend",
      label: "Vendedor",
      options: VENDEDORES.map((v) => ({ label: v.name, value: v.name })),
      current: e.vend,
      valueText: undefined,
    },
    {
      key: "canal",
      label: "Canal",
      options: CANALES_EV.map((v) => ({ label: v, value: v })),
      current: e.canal,
      valueText: undefined,
    },
  ];

  const fields: [string, string, string][] = [
    ["Duración", `${e.dur} minutos`, ""],
    ["Invitados internos", e.t === DEMO_TIPO ? "Chef instructor asignado" : "—", ""],
    ["Creado por", e.vend, ""],
  ];

  const confirm = () => {
    if (nextTipo == null || nextWhen == null) return;
    const nextIdx = Math.min(LAST_INDEX, e.idx + nextWhen);
    onConfirmClose(
      e,
      nextTipo,
      nextWhen,
      nextIdx,
      `${TIPOS[nextTipo].label} agendada para el ${dayLabel(nextIdx)}`,
    );
  };

  return (
    <Drawer width={470} onClose={onClose}>
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
          <span
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}
          >
            <span className="mono" style={badgeStyle(e.t, 26)}>
              {TIPOS[e.t].code}
            </span>
            <span style={{ fontSize: 12, color: T.muted }}>{TIPOS[e.t].label}</span>
          </span>
          <h2
            className="dsp"
            style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 700, lineHeight: 1.2 }}
          >
            {TIPOS[e.t].label} · {e.leadName}
          </h2>
          <p className="mono" style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
            {dowLabel(e.idx)} {dayLabel(e.idx)} · {hora(e.h)} – {hora(e.h + e.dur / 60)}{" "}
            ({e.dur}′)
          </p>
        </div>
        <DrawerClose onClose={onClose} />
      </div>

      <button
        type="button"
        onClick={() => onOpenLead(e.lead)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "13px 15px",
          borderRadius: 9,
          background: T.paper,
        }}
      >
        <span style={{ display: "block", fontSize: 11, color: T.faint, marginBottom: 3 }}>
          Lead vinculado
        </span>
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 14 }}>{e.leadName}</span>
          <span style={{ fontSize: 12, color: accent, whiteSpace: "nowrap" }}>
            Ver ficha ›
          </span>
        </span>
        <span style={{ display: "block", marginTop: 4, fontSize: 12, color: T.muted }}>
          {e.programa}
        </span>
      </button>

      <SectionLabel style={{ margin: "20px 0 9px" }}>Detalle</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {detalle.map((d) => {
          const key = `e:${d.key}`;
          return (
            <FilterMenu
              key={key}
              menuKey={key}
              label={d.label}
              variant="block"
              options={d.options}
              current={d.current}
              valueText={d.valueText}
              open={menu === key}
              accent={accent}
              onToggle={() => onToggleMenu(key)}
              onPick={(v) => onPatch(e.id, { [d.key]: v } as EventoPatch)}
            />
          );
        })}
      </div>

      <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, marginBottom: 18 }}>
        {fields.map(([label, value, cls], i) => (
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

      <SectionLabel style={{ margin: "0 0 8px" }}>Resultado y notas</SectionLabel>
      <textarea
        placeholder="Qué pasó en el evento, objeciones, acuerdos…"
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

      {canClose && (
        <button
          type="button"
          onClick={onStartClose}
          style={{
            width: "100%",
            height: 40,
            marginTop: 16,
            fontSize: 13,
            borderRadius: 8,
            background: accent,
            color: "#fff",
          }}
        >
          Marcar realizado
        </button>
      )}

      {closing && (
        <div
          style={{
            marginTop: 16,
            padding: "16px 17px",
            borderRadius: 10,
            background: T.paper,
            border: `1px solid ${T.borderStrong}`,
          }}
        >
          <p className="dsp" style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 500 }}>
            Próxima acción obligatoria
          </p>
          <p
            style={{ margin: "0 0 14px", fontSize: 12, color: T.muted, lineHeight: 1.45 }}
          >
            Para cerrar este evento agendá el siguiente paso. Sin próxima acción el lead
            queda sin seguimiento.
          </p>

          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <FilterMenu
              menuKey="n:tipo"
              label="Tipo de la próxima acción"
              variant="block"
              options={TIPOS.map((t, i) => ({ label: t.label, value: i }))}
              current={nextTipo}
              valueText={nextTipo == null ? "Todos" : TIPOS[nextTipo].label}
              open={menu === "n:tipo"}
              accent={accent}
              onToggle={() => onToggleMenu("n:tipo")}
              onPick={(v) => onSetNextTipo(v as number)}
            />
          </div>

          <p style={{ margin: "0 0 7px", fontSize: 11.5, color: T.muted }}>¿Cuándo?</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {NEXT_WHEN.map(([label, off]) => (
              <button
                type="button"
                key={label}
                onClick={() => onSetNextWhen(off)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  fontSize: 12,
                  borderRadius: 7,
                  border: `1px solid ${nextWhen === off ? accent : T.border}`,
                  background: nextWhen === off ? soft : T.surface,
                  color: nextWhen === off ? accent : T.muted,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={confirm}
              disabled={!ready}
              style={{
                flex: 1,
                height: 38,
                fontSize: 13,
                borderRadius: 7,
                background: ready ? accent : T.border,
                color: ready ? "#fff" : T.faint,
                cursor: ready ? "pointer" : "not-allowed",
              }}
            >
              {ready ? "Cerrar y agendar" : "Elegí tipo y fecha"}
            </button>
            <button
              type="button"
              onClick={onCancelClose}
              style={{
                height: 38,
                padding: "0 14px",
                fontSize: 13,
                borderRadius: 7,
                border: `1px solid ${T.border}`,
                color: T.muted,
                background: T.surface,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {e.nextText && (
        <div
          style={{
            display: "block",
            marginTop: 16,
            padding: "13px 15px",
            borderRadius: 9,
            background: "#E6F0E9",
            color: "#2F6B4F",
          }}
        >
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            Evento cerrado. {e.nextText}.
          </span>
        </div>
      )}
    </Drawer>
  );
}
