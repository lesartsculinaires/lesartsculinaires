import type { EstadoPlantillas } from "@/app/plantillas-actions";
import type { ResultadoBases } from "@/lib/supabase/bases";
import type { ResultadoEnvios } from "@/lib/supabase/envios";
import type { ResultadoFormularios } from "@/lib/supabase/formularios";
import type { ResultadoInbox } from "@/lib/supabase/inbox";
import type { Etiqueta } from "@/lib/types";

/**
 * La forma de los datos que se piden aparte, para que los dos lados la
 * compartan.
 *
 * Vive en un archivo sin `server-only` y sin `"use client"` a propósito: lo
 * importan la acción del servidor que los trae y el enganche del navegador que
 * los guarda. Son sólo tipos, así que al compilar no queda nada —no se lleva
 * al navegador ni una línea de lo que vive del lado del servidor—.
 *
 * Qué pantalla necesita cuál está en `datosDelModulo.ts`.
 */

/** Lo que devuelve `listarEtiquetas()`, que no tiene tipo con nombre propio. */
export interface ResultadoEtiquetas {
  etiquetas: Etiqueta[];
  faltaMigracion: boolean;
}

/**
 * Todo lo que se puede pedir aparte. Cada campo falta mientras no se haya
 * pedido, y por eso van todos opcionales: la diferencia entre «no se cargó» y
 * «se cargó y está vacío» es justamente la que no se puede perder, o una
 * pantalla a medio cargar diría que no hay nada.
 */
export interface DatosPerezosos {
  bandeja?: ResultadoInbox;
  etiquetas?: ResultadoEtiquetas;
  plantillas?: EstadoPlantillas;
  bases?: ResultadoBases;
  formularios?: ResultadoFormularios;
  envios?: ResultadoEnvios;
}
