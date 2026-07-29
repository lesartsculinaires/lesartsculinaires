"use client";

import type { CSSProperties } from "react";

import { T, softer } from "@/lib/theme";

export type MenuValue = string | number | null;

export interface MenuOption {
  label: string;
  value: MenuValue;
}

type Variant =
  /** Toolbar chip — Clientes and Calendario filter bars. */
  | "chip"
  /** Full-width control with the label inline — event drawer. */
  | "block"
  /** Full-width control with the label above the value — client drawer. */
  | "stacked";

interface Props {
  /** Unique key; the parent keeps at most one menu open at a time. */
  menuKey: string;
  label: string;
  options: readonly MenuOption[];
  /** Currently selected value in single-select mode. */
  current?: MenuValue;
  /** Overrides the displayed text when `current` is not itself presentable. */
  valueText?: string;
  open: boolean;
  accent: string;
  variant?: Variant;
  onToggle: () => void;
  onPick: (value: MenuValue) => void;
  /** Multi-select mode: check every value in `selected` and show `summary`. */
  multi?: { selected: readonly MenuValue[]; summary: string };
}

const MENU_STYLE: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 5px)",
  left: 0,
  zIndex: 70,
  minWidth: 196,
  maxHeight: 268,
  overflowY: "auto",
  background: T.surface,
  border: `1px solid ${T.borderStrong}`,
  borderRadius: 8,
  boxShadow: "0 14px 30px rgba(31,29,26,0.15)",
  padding: 5,
};

export function FilterMenu({
  menuKey,
  label,
  options,
  current,
  valueText: valueTextProp,
  open,
  accent,
  variant = "chip",
  onToggle,
  onPick,
  multi,
}: Props) {
  // A multi-select chip never reads as "filtered" — its summary already says so.
  const active = multi ? false : current != null && current !== "";
  const valueText = multi
    ? multi.summary
    : (valueTextProp ?? current ?? "Todos");

  const btnStyle: CSSProperties =
    variant === "chip"
      ? {
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          padding: "0 11px",
          fontSize: 12.5,
          border: `1px solid ${active || open ? accent : T.border}`,
          borderRadius: 6,
          background: active ? softer(accent) : T.surface,
          whiteSpace: "nowrap",
        }
      : {
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "8px 11px",
          border: `1px solid ${open ? accent : T.border}`,
          borderRadius: 7,
          background: T.surface,
        };

  return (
    <div style={{ position: "relative", zIndex: open ? 70 : 1 }}>
      <button type="button" onClick={onToggle} style={btnStyle}>
        {variant === "stacked" ? (
          <>
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: T.faint,
                marginBottom: 3,
              }}
            >
              {label}
            </span>
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              {valueText}
              <span style={{ color: T.faint }}>▾</span>
            </span>
          </>
        ) : (
          <>
            {/* The chip variant spaces these with flex gap; block has none. */}
            <span
              style={{ color: T.faint, marginRight: variant === "block" ? 6 : undefined }}
            >
              {label}
            </span>
            <span>{valueText}</span>
            <span style={{ color: T.faint, marginLeft: 2 }}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div style={MENU_STYLE}>
          {options.map((o) => {
            const on = multi
              ? multi.selected.includes(o.value)
              : current === o.value;
            return (
              <button
                type="button"
                key={`${menuKey}:${String(o.value)}`}
                className="nav"
                onClick={() => onPick(o.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 9px",
                  borderRadius: 5,
                  fontSize: 13,
                  color: on ? T.ink : T.muted,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    flexShrink: 0,
                    borderRadius: 3,
                    border: `1px solid ${on ? accent : T.borderStrong}`,
                    background: on ? accent : "transparent",
                  }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Wraps a list of plain values as menu options, with a leading "Todos". */
export const withTodos = (values: readonly string[]): MenuOption[] => [
  { label: "Todos", value: null },
  ...values.map((v) => ({ label: v, value: v })),
];
