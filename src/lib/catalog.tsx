"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Catalogo } from "@/lib/types";

const EMPTY: Catalogo = {
  vendedores: [],
  productos: [],
  territorios: [],
  canales: [],
  etapas: [],
  estados: [],
  tiposEvento: [],
};

/**
 * Catalogue tables, shared by every module.
 *
 * Read in a dozen places and never mutated, so it travels by context rather
 * than through each component's props.
 */
const CatalogoContext = createContext<Catalogo>(EMPTY);

export function CatalogoProvider({
  value,
  children,
}: {
  value: Catalogo;
  children: ReactNode;
}) {
  return (
    <CatalogoContext.Provider value={value}>{children}</CatalogoContext.Provider>
  );
}

export const useCatalogo = (): Catalogo => useContext(CatalogoContext);

/** Look up a catalogue label by id, for rendering a stored foreign key. */
export const labelOf = (
  items: readonly { id: number; nombre: string }[],
  id: number | null,
  fallback = "—",
): string => (id == null ? fallback : (items.find((i) => i.id === id)?.nombre ?? fallback));
