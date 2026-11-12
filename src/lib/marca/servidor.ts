import "server-only";

import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

import {
  GALLETA_MARCA,
  MARCAS,
  MODO_UNIFICADO,
  MARCA_FIJA,
  marcaDeLaGalleta,
  type ClaveMarca,
} from "@/lib/marcas";

/**
 * La marca del pedido que se está atendiendo (12/11/2026).
 *
 * En los sitios de una sola marca es siempre la misma. En el CRM unificado es
 * la que dice la galleta `crm.marca`.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ SE LEE LA GALLETA SIN ESPERAR
 * ----------------------------------------------------------------------------
 *
 * Next 15 devuelve `cookies()` como promesa, pero todavía deja leerla de una
 * vez (`UnsafeUnwrappedCookies`). Se usa a propósito: las ~40 lecturas de
 * variables del servidor (`WHATSAPP_TOKEN`, la llave de servicio…) están en
 * funciones que contestan al momento —«¿hay WhatsApp configurado?»— y
 * volverlas todas promesas obligaría a tocar cientos de llamadas. Fuera de un
 * pedido (un script, una prueba) la lectura falla y se usa la marca fija.
 */
export function marcaDelPedido(): ClaveMarca {
  if (!MODO_UNIFICADO) return MARCA_FIJA;
  try {
    const galletas = cookies() as unknown as UnsafeUnwrappedCookies;
    return marcaDeLaGalleta(galletas.get(GALLETA_MARCA)?.value);
  } catch {
    return MARCA_FIJA;
  }
}

/**
 * Una variable del servidor, de la marca del pedido.
 *
 *   sitio de una marca    env("WHATSAPP_TOKEN") = WHATSAPP_TOKEN
 *   CRM unificado (LAC)   env("WHATSAPP_TOKEN") = LAC_WHATSAPP_TOKEN
 *   CRM unificado (HC)    env("WHATSAPP_TOKEN") = HC_WHATSAPP_TOKEN
 *
 * En el unificado NO cae a la variable sin prefijo: si a una marca le falta
 * algo, mejor que diga «no configurado» que usar a escondidas la cuenta de la
 * otra marca.
 */
export function env(nombre: string, marca: ClaveMarca = marcaDelPedido()): string | undefined {
  if (!MODO_UNIFICADO) return process.env[nombre];
  return process.env[`${MARCAS[marca].prefijo}_${nombre}`];
}
