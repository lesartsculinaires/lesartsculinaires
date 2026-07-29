"use client";

import type { CSSProperties } from "react";

import {
  CAL_VIEWS,
  ESTADOS_EV,
  TIPOS,
  TODAY,
  type CalView,
} from "@/data/calendario";
import { PROGRAMAS } from "@/data/programas";
import { VENDEDORES } from "@/data/vendedores";
import { FilterMenu, withTodos } from "@/components/ui/FilterMenu";
import { AgendaView } from "@/components/modules/calendario/AgendaView";
import { MonthView } from "@/components/modules/calendario/MonthView";
import { TeamView } from "@/components/modules/calendario/TeamView";
import { TimeView } from "@/components/modules/calendario/TimeView";
import {
  FIRST_AUGUST,
  FIRST_JULY,
  LAST_INDEX,
  badgeStyle,
  dayLabel,
  dowLabel,
  navBtnStyle,
  todayBtnStyle,
  weekStartOf,
  wd,
  type EventoVista,
} from "@/lib/calendar";
import { T } from "@/lib/theme";

interface Props {
  eventos: EventoVista[];
  accent: string;
  view: CalView;
  idx: number;
  filters: Record<string, string | null>;
  menu: string | null;
  addBtnStyle: CSSProperties;
  onView: (v: CalView) => void;
  onIdx: (i: number) => void;
  onFilter: (key: string, value: string | null) => void;
  onToggleMenu: (key: string) => void;
  onOpenEvent: (id: string) => void;
  onNewEvent: () => void;
}

/** Weekday columns shown in the Semana grid. */
const WEEK_COLUMNS = 5;

const FILTER_DEFS: { key: string; label: string; values: readonly string[] }[] = [
  { key: "vend", label: "Vendedor", values: VENDEDORES.map((v) => v.name) },
  { key: "tipo", label: "Tipo", values: TIPOS.map((t) => t.label) },
  { key: "programa", label: "Programa", values: PROGRAMAS.map((p) => p.nombre) },
  { key: "estado", label: "Estado", values: ESTADOS_EV },
];

export function Calendario({
  eventos,
  accent,
  view,
  idx,
  filters,
  menu,
  addBtnStyle,
  onView,
  onIdx,
  onFilter,
  onToggleMenu,
  onOpenEvent,
  onNewEvent,
}: Props) {
  const shown = eventos.filter(
    (e) =>
      (!filters.vend || e.vend === filters.vend) &&
      (!filters.tipo || TIPOS[e.t].label === filters.tipo) &&
      (!filters.programa || e.programa === filters.programa) &&
      (!filters.estado || e.estado === filters.estado),
  );

  const ofDay = (i: number) =>
    shown.filter((e) => e.idx === i).sort((a, b) => a.h - b.h);

  const weekStart = weekStartOf(idx);
  const month = idx <= 31 ? 7 : 8;
  const firstOfMonth = month === 7 ? FIRST_JULY : FIRST_AUGUST;
  const gridStart = firstOfMonth - wd(firstOfMonth);
  const timeDays =
    view === "Día"
      ? [idx]
      : Array.from({ length: WEEK_COLUMNS }, (_, k) => weekStart + k);

  /** Mes jumps a whole month; week-based views jump 7 days; Agenda/Día jump 1. */
  const step = (dir: number) => {
    const jump =
      view === "Mes"
        ? dir > 0
          ? 31
          : -31
        : view === "Semana" || view === "Equipo"
          ? 7 * dir
          : dir;
    onIdx(Math.min(LAST_INDEX, Math.max(1, idx + jump)));
  };

  const title =
    view === "Mes"
      ? month === 7
        ? "Julio 2026"
        : "Agosto 2026"
      : view === "Semana" || view === "Equipo"
        ? `Semana del ${dayLabel(weekStart)} · ${dowLabel(idx)} ${dayLabel(idx)}`
        : view === "Agenda"
          ? `Desde el ${dayLabel(idx)}`
          : `${dowLabel(idx)} ${dayLabel(idx)}`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 3,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
          }}
        >
          {CAL_VIEWS.map((label) => (
            <button
              type="button"
              key={label}
              onClick={() => onView(label)}
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 12.5,
                borderRadius: 6,
                background: view === label ? accent : "transparent",
                color: view === label ? "#fff" : T.muted,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => step(-1)} style={navBtnStyle} aria-label="Anterior">
            ‹
          </button>
          <button type="button" onClick={() => step(1)} style={navBtnStyle} aria-label="Siguiente">
            ›
          </button>
          <button type="button" onClick={() => onIdx(TODAY)} style={todayBtnStyle}>
            Hoy
          </button>
        </div>

        <span className="dsp" style={{ fontSize: 15, fontWeight: 500 }}>
          {title}
        </span>
        <span style={{ flex: 1, minWidth: 8 }} />

        {FILTER_DEFS.map((f) => {
          const key = `c:${f.key}`;
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

        <button type="button" onClick={onNewEvent} style={addBtnStyle}>
          Nuevo evento
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 12,
          padding: "11px 14px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 9,
        }}
      >
        {TIPOS.map((t, i) => (
          <span
            key={t.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: T.muted,
            }}
          >
            <span className="mono" style={badgeStyle(i)}>
              {t.code}
            </span>
            {t.label}
            <span className="mono" style={{ fontSize: 10, color: T.faint }}>
              {t.dur}′
            </span>
          </span>
        ))}
      </div>

      {shown.length === 0 && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "12px 14px",
            fontSize: 12.5,
            color: T.muted,
            background: T.surface,
            border: `1px dashed ${T.borderStrong}`,
            borderRadius: 9,
          }}
        >
          Ningún evento coincide con los filtros.
        </p>
      )}

      {view === "Mes" && (
        <MonthView
          gridStart={gridStart}
          month={month}
          accent={accent}
          ofDay={ofDay}
          onOpen={onOpenEvent}
        />
      )}

      {(view === "Semana" || view === "Día") && (
        <TimeView days={timeDays} accent={accent} ofDay={ofDay} onOpen={onOpenEvent} />
      )}

      {view === "Agenda" && (
        <AgendaView from={idx} accent={accent} ofDay={ofDay} onOpen={onOpenEvent} />
      )}

      {view === "Equipo" && (
        <TeamView day={idx} ofDay={ofDay} onOpen={onOpenEvent} />
      )}
    </div>
  );
}
