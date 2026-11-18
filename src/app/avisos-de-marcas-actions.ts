"use server";

import { CLAVES_DE_MARCA, MODO_UNIFICADO, type ClaveMarca } from "@/lib/marcas";
import { sinLeerDeLaPersona } from "@/lib/supabase/inbox";

/**
 * Cuántos mensajes sin leer tiene la persona en cada marca (crm-peñagroup).
 *
 * Lo pide la barra cada medio minuto para poner el número junto a cada logo.
 * Cada marca se cuenta con su propia sesión y su propia base: ver
 * `sinLeerDeLaPersona`. Una marca sin sesión vuelve como `null`.
 *
 * Fuera del CRM unificado no hay dos marcas que mostrar, y no se pregunta nada.
 */
export async function sinLeerDeLasMarcas(): Promise<Partial<Record<ClaveMarca, number | null>>> {
  if (!MODO_UNIFICADO) return {};
  const pares = await Promise.all(
    CLAVES_DE_MARCA.map(async (k) => {
      try {
        return [k, await sinLeerDeLaPersona(k)] as const;
      } catch {
        return [k, null] as const;
      }
    }),
  );
  return Object.fromEntries(pares);
}
