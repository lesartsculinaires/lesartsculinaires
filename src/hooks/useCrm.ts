"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  createCliente,
  createEvento,
  updateCliente,
  updateEvento,
  type ActionResult,
} from "@/app/actions";
import { NUEVO_CLIENTE_BASE } from "@/data/clientes";
import { TODAY, type CalView } from "@/data/calendario";
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

/**
 * @param initialClientes Leads loaded on the server — either live rows from
 *   Supabase or the bundled seed set.
 * @param initialEventos Calendar events, from the same source.
 */
export function useCrm(
  initialClientes: readonly Cliente[],
  initialEventos: readonly EventoCalendario[],
) {
  const [state, setState] = useState<CrmState>(INITIAL);
  /** Last write failure, surfaced as a banner without rolling the UI back. */
  const [syncError, setSyncError] = useState<string | null>(null);

  // Lets the stable action callbacks read current state without re-creating.
  const stateRef = useRef(state);
  stateRef.current = state;

  const patchState = useCallback(
    (next: Partial<CrmState> | ((s: CrmState) => Partial<CrmState>)) =>
      setState((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) })),
    [],
  );

  /** Fire a write in the background; only failures reach the user. */
  const sync = useCallback((run: Promise<ActionResult>) => {
    run
      .then((r) => setSyncError(r.ok ? null : r.error))
      .catch((e: unknown) => setSyncError(e instanceof Error ? e.message : String(e)));
  }, []);

  /** Seed/live rows plus session-added rows, with pending edits applied. */
  const clientes = useMemo<Cliente[]>(
    () =>
      [...state.extra, ...initialClientes].map((c) => ({
        ...c,
        ...(state.edits[c.id] ?? {}),
      })),
    [state.extra, state.edits, initialClientes],
  );

  const eventos = useMemo<EventoCalendario[]>(
    () =>
      [...initialEventos, ...state.calExtra].map((e) => ({
        ...e,
        ...(state.calEdits[e.id] ?? {}),
      })),
    [state.calExtra, state.calEdits, initialEventos],
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

      /** Optimistic: state updates now, the row is written in the background. */
      patchCliente: (id: string, obj: ClientePatch) => {
        patchState((s) => ({
          edits: { ...s.edits, [id]: { ...(s.edits[id] ?? {}), ...obj } },
          menu: null,
        }));
        sync(updateCliente(id, obj));
      },

      addCliente: () => {
        const id = "LA-" + (415 + stateRef.current.extra.length);
        patchState((s) => ({
          extra: [{ id, ...NUEVO_CLIENTE_BASE }, ...s.extra],
          sel: id,
          menu: null,
        }));
        sync(createCliente(id));
      },

      setDrag: (drag: string | null) => patchState({ drag }),
      setOver: (over: string | null) => patchState({ over }),

      setVend: (vend: number) => patchState({ vend }),
      setTipo: (tipo: string) => patchState({ tipo }),

      /** Jump to Clientes with a preset filter, from Programas or Equipos. */
      gotoClientes: (
        filters: Record<string, string | null>,
        sel: string | null = null,
      ) => patchState({ mod: "Clientes", filters, q: "", sel, menu: null }),

      setCalView: (calView: CalView) => patchState({ calView, menu: null }),
      setCalIdx: (calIdx: number) => patchState({ calIdx, menu: null }),
      setCalFilter: (k: string, v: string | null) =>
        patchState((s) => ({ calF: { ...s.calF, [k]: v }, menu: null })),

      openEvent: (id: string) =>
        patchState({ calSel: id, calClosing: false, menu: null }),
      closeEvent: () =>
        patchState({ calSel: null, calClosing: false, menu: null }),

      patchEvento: (id: string, obj: EventoPatch) => {
        patchState((s) => ({
          calEdits: { ...s.calEdits, [id]: { ...(s.calEdits[id] ?? {}), ...obj } },
          menu: null,
        }));
        sync(updateEvento(id, obj));
      },

      addEvento: (e: EventoCalendario) => {
        patchState((s) => ({
          calExtra: [...s.calExtra, e],
          calSel: e.id,
          calClosing: false,
          menu: null,
        }));
        sync(createEvento(e));
      },

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
      ) => {
        const seguimiento: EventoCalendario = {
          id: `EV-X${Object.keys(stateRef.current.calEdits).length}${offset}${tipo}`,
          idx: nextIdx,
          h: 10,
          t: tipo,
          lead: source.lead,
          vend: source.vend,
          canal: tipo === 1 ? "Presencial" : "Llamada",
          estado: "Pendiente",
        };
        const cierre: EventoPatch = { estado: "Realizado", nextText };

        patchState((s) => ({
          calExtra: [...s.calExtra, seguimiento],
          calEdits: {
            ...s.calEdits,
            [source.id]: { ...(s.calEdits[source.id] ?? {}), ...cierre },
          },
          calClosing: false,
          nextTipo: null,
          nextWhen: null,
          menu: null,
        }));

        // Book the follow-up first: if that fails, the original event stays
        // Pendiente rather than being closed with nothing scheduled after it.
        sync(
          createEvento(seguimiento).then((r) =>
            r.ok ? updateEvento(source.id, cierre) : r,
          ),
        );
      },

      dismissSyncError: () => setSyncError(null),
    }),
    [patchState, sync],
  );

  return { state, clientes, eventos, actions, syncError };
}

export type CrmActions = ReturnType<typeof useCrm>["actions"];
