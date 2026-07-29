"use client";

import { useCallback, useMemo, useState } from "react";

import { CLIENTES, NUEVO_CLIENTE_BASE } from "@/data/clientes";
import { CAL_EVENTS, TODAY, type CalView } from "@/data/calendario";
import { COLS } from "@/data/taxonomia";
import type {
  Cliente,
  ClientePatch,
  EventoCalendario,
  EventoPatch,
} from "@/lib/types";

export interface CrmState {
  /** Area key, or null while the login gate is showing. */
  user: string | null;
  mod: string;
  /** Key of the currently open dropdown; only one may be open at a time. */
  menu: string | null;

  // Clientes
  q: string;
  filters: Record<string, string | null>;
  edits: Record<string, ClientePatch>;
  extra: Cliente[];
  sel: string | null;
  cols: string[];

  // Pipeline drag state
  drag: string | null;
  over: string | null;

  // Equipos
  vend: number;

  // Programas
  tipo: string;

  // Calendario
  calView: CalView;
  calIdx: number;
  calF: Record<string, string | null>;
  calSel: string | null;
  calClosing: boolean;
  calExtra: EventoCalendario[];
  calEdits: Record<string, EventoPatch>;
  nextTipo: number | null;
  nextWhen: number | null;
}

const INITIAL: CrmState = {
  user: null,
  mod: "Dashboard",
  menu: null,
  q: "",
  filters: {},
  edits: {},
  extra: [],
  sel: null,
  cols: COLS.filter((c) => !c.hiddenByDefault).map((c) => c.key),
  drag: null,
  over: null,
  vend: 0,
  tipo: "Todos",
  calView: "Semana",
  calIdx: TODAY,
  calF: {},
  calSel: null,
  calClosing: false,
  calExtra: [],
  calEdits: {},
  nextTipo: null,
  nextWhen: null,
};

export function useCrm() {
  const [state, setState] = useState<CrmState>(INITIAL);

  const patchState = useCallback(
    (next: Partial<CrmState> | ((s: CrmState) => Partial<CrmState>)) =>
      setState((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) })),
    [],
  );

  /** Seed rows plus session-added rows, with in-session edits applied on top. */
  const clientes = useMemo<Cliente[]>(
    () =>
      [...state.extra, ...CLIENTES].map((c) => ({
        ...c,
        ...(state.edits[c.id] ?? {}),
      })),
    [state.extra, state.edits],
  );

  const eventos = useMemo<EventoCalendario[]>(
    () =>
      [...CAL_EVENTS, ...state.calExtra].map((e) => ({
        ...e,
        ...(state.calEdits[e.id] ?? {}),
      })),
    [state.calExtra, state.calEdits],
  );

  const actions = useMemo(
    () => ({
      enter: (key: string) => patchState({ user: key, mod: "Dashboard" }),
      logout: () => patchState({ user: null, mod: "Dashboard" }),
      setMod: (mod: string) => patchState({ mod }),

      toggleMenu: (k: string) =>
        patchState((s) => ({ menu: s.menu === k ? null : k })),
      closeMenu: () => patchState({ menu: null }),

      setQuery: (q: string) => patchState({ q }),
      setFilter: (k: string, v: string | null) =>
        patchState((s) => ({ filters: { ...s.filters, [k]: v }, menu: null })),

      /**
       * Toggling a column rebuilds the list from COLS order, so re-enabling a
       * column puts it back in its canonical position rather than at the end.
       */
      toggleCol: (k: string) =>
        patchState((s) => ({
          cols: s.cols.includes(k)
            ? s.cols.filter((c) => c !== k)
            : COLS.map((c) => c.key).filter(
                (c) => s.cols.includes(c) || c === k,
              ),
        })),

      select: (id: string | null) => patchState({ sel: id, menu: null }),
      closeDetail: () => patchState({ sel: null, menu: null }),

      patchCliente: (id: string, obj: ClientePatch) =>
        patchState((s) => ({
          edits: { ...s.edits, [id]: { ...(s.edits[id] ?? {}), ...obj } },
          menu: null,
        })),

      addCliente: () =>
        setState((s) => {
          const id = "LA-" + (415 + s.extra.length);
          return {
            ...s,
            extra: [{ id, ...NUEVO_CLIENTE_BASE }, ...s.extra],
            sel: id,
            menu: null,
          };
        }),

      setDrag: (drag: string | null) => patchState({ drag }),
      setOver: (over: string | null) => patchState({ over }),

      setVend: (vend: number) => patchState({ vend }),
      setTipo: (tipo: string) => patchState({ tipo }),

      /** Jump to Clientes with a preset filter, from Programas or Equipos. */
      gotoClientes: (filters: Record<string, string | null>, sel: string | null = null) =>
        patchState({ mod: "Clientes", filters, q: "", sel, menu: null }),

      setCalView: (calView: CalView) => patchState({ calView, menu: null }),
      setCalIdx: (calIdx: number) => patchState({ calIdx, menu: null }),
      setCalFilter: (k: string, v: string | null) =>
        patchState((s) => ({ calF: { ...s.calF, [k]: v }, menu: null })),

      openEvent: (id: string) =>
        patchState({ calSel: id, calClosing: false, menu: null }),
      closeEvent: () =>
        patchState({ calSel: null, calClosing: false, menu: null }),

      patchEvento: (id: string, obj: EventoPatch) =>
        patchState((s) => ({
          calEdits: { ...s.calEdits, [id]: { ...(s.calEdits[id] ?? {}), ...obj } },
          menu: null,
        })),

      addEvento: (e: EventoCalendario) =>
        patchState((s) => ({
          calExtra: [...s.calExtra, e],
          calSel: e.id,
          calClosing: false,
          menu: null,
        })),

      startClose: () =>
        patchState({ calClosing: true, nextTipo: null, nextWhen: null }),
      cancelClose: () =>
        patchState({ calClosing: false, nextTipo: null, nextWhen: null }),
      setNextTipo: (nextTipo: number) => patchState({ nextTipo, menu: null }),
      setNextWhen: (nextWhen: number) => patchState({ nextWhen }),

      /**
       * Close an event and book its follow-up in one step: the current event is
       * marked Realizado and a new Pendiente event is created `offset` days out.
       */
      confirmClose: (
        source: EventoCalendario,
        tipo: number,
        offset: number,
        nextIdx: number,
        nextText: string,
      ) =>
        setState((s) => {
          const id = `EV-X${Object.keys(s.calEdits).length}${offset}${tipo}`;
          return {
            ...s,
            calExtra: [
              ...s.calExtra,
              {
                id,
                idx: nextIdx,
                h: 10,
                t: tipo,
                lead: source.lead,
                vend: source.vend,
                canal: tipo === 1 ? "Presencial" : "Llamada",
                estado: "Pendiente",
              },
            ],
            calEdits: {
              ...s.calEdits,
              [source.id]: {
                ...(s.calEdits[source.id] ?? {}),
                estado: "Realizado",
                nextText,
              },
            },
            calClosing: false,
            nextTipo: null,
            nextWhen: null,
            menu: null,
          };
        }),
    }),
    [patchState],
  );

  return { state, clientes, eventos, actions };
}

export type CrmActions = ReturnType<typeof useCrm>["actions"];
