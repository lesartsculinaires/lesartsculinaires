"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  updateCliente,
  updateOportunidad,
  type ActionResult,
} from "@/app/actions";
import type { ClientePatch, Oportunidad, OportunidadPatch } from "@/lib/types";

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

export function useCrm(initial: readonly Oportunidad[], modInicial?: string) {
  const [state, setState] = useState<CrmState>(
    modInicial ? { ...INITIAL, mod: modInicial } : INITIAL,
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Escrituras lanzadas que todavía no contestan. */
  const [pendientes, setPendientes] = useState(0);

  const patchState = useCallback(
    (next: Partial<CrmState> | ((s: CrmState) => Partial<CrmState>)) =>
      setState((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) })),
    [],
  );

  /** Fire a write in the background; only failures reach the user. */
  const sync = useCallback((run: Promise<ActionResult>) => {
    setPendientes((n) => n + 1);
    run
      .then((r) => setSyncError(r.ok ? null : r.error))
      .catch((e: unknown) =>
        setSyncError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setPendientes((n) => n - 1));
  }, []);

  /**
   * Soltar los cambios optimistas cuando llegan datos nuevos del servidor.
   *
   * `edits` existe para que la pantalla no espere el viaje de ida y vuelta.
   * Una vez que el servidor contesta con la fila ya guardada, sostener la capa
   * encima deja de ayudar y empieza a estorbar: si otra persona corrige ese
   * mismo campo, lo que uno editó hace rato le seguiría ganando en pantalla,
   * calladamente y hasta recargar. Con el refresco automático eso pasaría a
   * cada rato, que es justo lo contrario de lo que se busca.
   *
   * Sólo se sueltan si el paquete llegó sin escrituras en vuelo. Un paquete
   * que viajó al mismo tiempo que un guardado puede no traerlo todavía, y
   * soltar la capa ahí haría parpadear el valor viejo.
   *
   * De paso arregla otra cosa: si un guardado falla, su cambio optimista dejaba
   * en pantalla un valor que nunca se guardó. Ahora la pantalla vuelve a la
   * realidad y el aviso de error explica por qué.
   */
  const vistos = useRef(initial);
  useEffect(() => {
    if (vistos.current === initial) return;
    vistos.current = initial;
    if (pendientes > 0) return;
    setState((s) => (Object.keys(s.edits).length ? { ...s, edits: {} } : s));
  }, [initial, pendientes]);

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

      /**
       * Edit the shared client record. The optimistic update touches every
       * opportunity of that client, matching what the database will return.
       */
      editarCliente: (
        clienteId: number,
        patch: ClientePatch,
        display: Partial<Oportunidad>,
      ) => {
        patchState((s) => {
          const edits = { ...s.edits };
          for (const o of initial) {
            if (o.clienteId !== clienteId) continue;
            edits[o.id] = { ...(edits[o.id] ?? {}), ...display };
          }
          return { edits, menu: null };
        });
        sync(updateCliente(clienteId, patch));
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
    // `initial` is read by editarCliente to find the client's other rows.
    [patchState, sync, initial],
  );

  return { state, oportunidades, actions, syncError };
}

export type CrmActions = ReturnType<typeof useCrm>["actions"];
