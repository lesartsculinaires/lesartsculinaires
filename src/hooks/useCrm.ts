"use client";

import { useCallback, useMemo, useState } from "react";

import { updateOportunidad, type ActionResult } from "@/app/actions";
import type { Oportunidad, OportunidadPatch } from "@/lib/types";

export interface CrmState {
  mod: string;
  /** Key of the currently open dropdown; only one may be open at a time. */
  menu: string | null;

  q: string;
  /** Catalogue filters, keyed by field, holding the selected id. */
  filtros: Record<string, number | null>;
  /** Optimistic edits applied on top of the server data, by opportunity id. */
  edits: Record<number, Partial<Oportunidad>>;
  sel: number | null;

  drag: number | null;
  over: number | null;

  vend: number;
  categoria: string;
}

const INITIAL: CrmState = {
  mod: "Dashboard",
  menu: null,
  q: "",
  filtros: {},
  edits: {},
  sel: null,
  drag: null,
  over: null,
  vend: 0,
  categoria: "Todos",
};

export function useCrm(initial: readonly Oportunidad[]) {
  const [state, setState] = useState<CrmState>(INITIAL);
  const [syncError, setSyncError] = useState<string | null>(null);

  const patchState = useCallback(
    (next: Partial<CrmState> | ((s: CrmState) => Partial<CrmState>)) =>
      setState((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) })),
    [],
  );

  /** Fire a write in the background; only failures reach the user. */
  const sync = useCallback((run: Promise<ActionResult>) => {
    run
      .then((r) => setSyncError(r.ok ? null : r.error))
      .catch((e: unknown) =>
        setSyncError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  /** Server rows with pending optimistic edits applied on top. */
  const oportunidades = useMemo<Oportunidad[]>(
    () => initial.map((o) => ({ ...o, ...(state.edits[o.id] ?? {}) })),
    [initial, state.edits],
  );

  const actions = useMemo(
    () => ({
      setMod: (mod: string) => patchState({ mod, sel: null, menu: null }),
      toggleMenu: (k: string) =>
        patchState((s) => ({ menu: s.menu === k ? null : k })),
      closeMenu: () => patchState({ menu: null }),

      setQuery: (q: string) => patchState({ q }),
      setFiltro: (k: string, v: number | null) =>
        patchState((s) => ({ filtros: { ...s.filtros, [k]: v }, menu: null })),
      limpiarFiltros: () => patchState({ filtros: {}, q: "" }),

      select: (id: number | null) => patchState({ sel: id, menu: null }),

      /**
       * Optimistic edit: the screen updates now, the row is written in the
       * background. `display` carries the label changes so the UI does not
       * have to wait for a round trip to show the new value.
       */
      editar: (
        id: number,
        patch: OportunidadPatch,
        display: Partial<Oportunidad>,
      ) => {
        patchState((s) => ({
          edits: { ...s.edits, [id]: { ...(s.edits[id] ?? {}), ...display } },
          menu: null,
        }));
        sync(updateOportunidad(id, patch));
      },

      setDrag: (drag: number | null) => patchState({ drag }),
      setOver: (over: number | null) => patchState({ over }),

      setVend: (vend: number) => patchState({ vend }),
      setCategoria: (categoria: string) => patchState({ categoria }),

      /** Jump to Clientes with a preset filter, from Programas or Equipos. */
      verEnClientes: (filtros: Record<string, number | null>, sel: number | null = null) =>
        patchState({ mod: "Clientes", filtros, q: "", sel, menu: null }),

      dismissSyncError: () => setSyncError(null),
    }),
    [patchState, sync],
  );

  return { state, oportunidades, actions, syncError };
}

export type CrmActions = ReturnType<typeof useCrm>["actions"];
