"use client";

import { GALLETA_MARCA, MARCA_FIJA, MODO_UNIFICADO, marcaDeLaGalleta, type ClaveMarca } from "@/lib/marcas";

/**
 * La marca elegida, leída en el navegador (12/11/2026).
 *
 * Es la misma galleta que lee el servidor (`crm.marca`), así que los dos
 * siempre hablan con la misma base. Para cambiar de marca se usa
 * `cambiarDeMarca`, que recarga la página: así se cierran las conexiones en
 * vivo con la base anterior y nada de la otra marca queda en memoria.
 */
export function marcaEnElNavegador(): ClaveMarca {
  if (!MODO_UNIFICADO || typeof document === "undefined") return MARCA_FIJA;
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${GALLETA_MARCA}=`));
  return marcaDeLaGalleta(par ? decodeURIComponent(par.slice(GALLETA_MARCA.length + 1)) : null);
}

/** Cambia de marca y recarga en `destino` (por omisión, la portada). */
export function cambiarDeMarca(marca: ClaveMarca, destino = "/"): void {
  const unAnio = 60 * 60 * 24 * 365;
  document.cookie = `${GALLETA_MARCA}=${marca}; Path=/; Max-Age=${unAnio}; SameSite=Lax; Secure`;
  window.location.assign(destino);
}
