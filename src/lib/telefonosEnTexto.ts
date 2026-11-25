/**
 * Los números de teléfono que alguien ESCRIBIÓ en un mensaje.
 *
 * Pedido el 25/11/2026: cuando un lead da su número en el chat —«mi número es
 * 7880 3928»— que aparezca la misma tarjeta que cuando comparte un contacto de
 * WhatsApp, para copiarlo o guardarlo en su ficha sin transcribirlo a mano.
 *
 * ============================================================================
 * QUÉ SE RECONOCE
 * ============================================================================
 *
 *   El Salvador, 8 dígitos que empiezan con 2, 6 o 7, escritos como sea:
 *     78803928 · 7880 3928 · 7880-3928 · 7880.3928
 *     con código: +503 7880 3928 · 503 78803928 · (503) 7880-3928 · +50378803928
 *   Otros países, SÓLO con «+» adelante y entre 10 y 15 dígitos:
 *     +1 305 555 1234 · +52 55 1234 5678 · +34 612 345 678
 *
 * ============================================================================
 * QUÉ NO, A PROPÓSITO
 * ============================================================================
 *
 * Un número suelto se parece a muchas cosas que no son teléfonos: montos
 * («$1,350»), fechas («25/11/2026»), horas, códigos («CRM-2780»), DUI
 * («01234567-8»), tarjetas. Por eso:
 *   · sin «+» sólo cuentan los 8 dígitos de El Salvador que empiezan con 2, 6
 *     o 7 (así son los teléfonos de allá), y no pegados a otros dígitos;
 *   · un DUI —8 dígitos, guion y uno más— no cuenta;
 *   · las comas y las barras cortan: no son separadores de teléfono.
 * Un número de otro país sin «+» no se reconoce: es mejor no mostrar una
 * tarjeta que mostrarla con algo que no es un teléfono.
 */

import type { TelefonoCompartido } from "@/lib/whatsapp/contactos";

/** El Salvador, con o sin código de país, en cualquiera de las formas de arriba. */
const SV = /(?<![\d+])(?:(?:\+\s?)?\(?503\)?[\s.-]?)?([267]\d{3})[\s.-]?(\d{4})(?![\d-]|-\d)/g;

/** Otro país: «+», y de 10 a 15 dígitos en grupos separados por espacio, guion, punto o paréntesis. */
const INTERNACIONAL = /\+\s?\d[\d\s().-]{7,20}\d/g;

const soloDigitos = (s: string) => s.replace(/\D/g, "");

export function telefonosEnTexto(texto: string | null | undefined): TelefonoCompartido[] {
  if (!texto) return [];
  const vistos = new Set<string>();
  const salida: TelefonoCompartido[] = [];
  const agregar = (paraMarcar: string, comoSeVe: string) => {
    if (vistos.has(paraMarcar)) return;
    vistos.add(paraMarcar);
    salida.push({ paraMarcar, comoSeVe, clase: null });
  };

  // Los «+» de otros países primero, y se recuerdan para no leerlos dos veces.
  const tomados: [number, number][] = [];
  for (const m of texto.matchAll(INTERNACIONAL)) {
    const d = soloDigitos(m[0]);
    if (d.startsWith("503")) continue; // lo lee la regla de El Salvador, con su formato
    if (d.length < 10 || d.length > 15) continue;
    tomados.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    agregar(d, `+${m[0].replace(/^\+\s?/, "").replace(/\s+/g, " ").trim()}`);
  }

  for (const m of texto.matchAll(SV)) {
    const ini = m.index ?? 0;
    if (tomados.some(([a, b]) => ini >= a && ini < b)) continue;
    const local = `${m[1]}${m[2]}`;
    agregar(`503${local}`, `+503 ${m[1]} ${m[2]}`);
  }

  return salida;
}
