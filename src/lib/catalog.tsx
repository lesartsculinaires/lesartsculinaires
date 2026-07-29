"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { TIPOS } from "@/data/calendario";
import { PROGRAMAS } from "@/data/programas";
import { VENDEDORES } from "@/data/vendedores";
import type { Programa, TipoEvento, Vendedor } from "@/lib/types";

export interface CatalogValue {
  vendedores: Vendedor[];
  programas: Programa[];
  tipos: TipoEvento[];
}

/**
 * Reference data shared by every module.
 *
 * It is read in a dozen places and never mutated, so it travels by context
 * rather than being threaded through each component's props. The defaults are
 * the seed sets, which keeps components renderable in isolation.
 */
const CatalogContext = createContext<CatalogValue>({
  vendedores: [...VENDEDORES],
  programas: [...PROGRAMAS],
  tipos: [...TIPOS],
});

export function CatalogProvider({
  value,
  children,
}: {
  value: CatalogValue;
  children: ReactNode;
}) {
  const memo = useMemo(() => value, [value]);
  return <CatalogContext.Provider value={memo}>{children}</CatalogContext.Provider>;
}

export const useCatalog = (): CatalogValue => useContext(CatalogContext);

/** Programme names, the join key against `Cliente.producto`. */
export const useProgramaNames = (): string[] =>
  useCatalog().programas.map((p) => p.nombre);

/** Sales rep names, the join key against `Cliente.vendedor`. */
export const useVendedorNames = (): string[] =>
  useCatalog().vendedores.map((v) => v.name);
