import type { Vendedor } from "@/lib/types";

/** `name` is the join key against `Cliente.vendedor` and `EventoCalendario.vend`. */
export const VENDEDORES: readonly Vendedor[] = [
  { name: "Karla Menjívar", role: "Ejecutiva senior", email: "karla@lesarts.com", tel: "7822-4410", meta: 1500, since: "2023" },
  { name: "Rodrigo Solís", role: "Ejecutivo de admisiones", email: "rodrigo@lesarts.com", tel: "7455-0192", meta: 1000, since: "2025" },
  { name: "Andrea Pineda", role: "Cuentas corporativas", email: "andrea@lesarts.com", tel: "7099-6633", meta: 1500, since: "2024" },
];

/** Sentinel used in `Cliente.vendedor` for leads nobody owns yet. */
export const SIN_ASIGNAR = "Sin asignar";
