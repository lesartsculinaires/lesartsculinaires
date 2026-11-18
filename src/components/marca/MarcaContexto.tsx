"use client";

import { createContext, useContext, type ReactNode } from "react";

import { MARCAS, MARCA_FIJA, type ClaveMarca, type Marca } from "@/lib/marcas";

/**
 * La marca en uso, para las pantallas del navegador (12/11/2026).
 *
 * La pone el layout con la que eligió el servidor, así que el primer dibujo y
 * el del navegador dicen lo mismo (sin el aviso #418 de React). Para los
 * colores no hace falta: están en las variables CSS del `<html>`.
 */
const Contexto = createContext<ClaveMarca>(MARCA_FIJA);

export function ProveedorDeMarca({ marca, children }: { marca: ClaveMarca; children: ReactNode }) {
  return <Contexto.Provider value={marca}>{children}</Contexto.Provider>;
}

/** La marca en uso: nombre, instituto, logos… */
export const useMarca = (): Marca => MARCAS[useContext(Contexto)];
