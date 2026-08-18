import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizarTexto } from "@/lib/duplicados";

/**
 * Resolver un catálogo por nombre.
 *
 * Del otro lado, un formulario de Meta manda «Diplomado en Cocina», no
 * `producto_id: 3`. Obligar a que quien arma el flujo en n8n lleve una tabla
 * de equivalencias a mano garantiza que se desincronice el día que se agregue
 * un programa. Acá se acepta lo que venga —el id o el nombre— y se traduce
 * contra la base.
 *
 * La comparación es sin acentos, sin mayúsculas y sin espacios de más, porque
 * lo que llega de un formulario viene escrito por una persona.
 */

export type Catalogo =
  | "vendedores"
  | "productos"
  | "territorios"
  | "canales"
  | "etapas"
  | "estados"
  | "tipos_evento";

/**
 * Cómo llamar a cada catálogo cuando hay que explicar un error.
 *
 * Va el género además del nombre porque el mensaje se arma solo: sin esto
 * saldría «no se reconoce el etapa», y un error mal escrito hace dudar de si
 * el problema es el dato o el sistema.
 */
const ETIQUETAS: Record<Catalogo, { nombre: string; femenino: boolean }> = {
  vendedores: { nombre: "asesor", femenino: false },
  productos: { nombre: "programa", femenino: false },
  territorios: { nombre: "territorio", femenino: false },
  canales: { nombre: "canal", femenino: false },
  etapas: { nombre: "etapa", femenino: true },
  estados: { nombre: "estado", femenino: false },
  tipos_evento: { nombre: "tipo de evento", femenino: false },
};

export interface Opcion {
  id: number;
  nombre: string;
}

/**
 * Revienta si la consulta falla, en vez de devolver una lista vacía.
 *
 * Tragarse el error acá sale carísimo: `resolver` diría «no se reconoce el
 * programa» cuando el problema es que no se pudo consultar la base, y
 * `/catalogos` contestaría `ok` con todas las listas vacías. Quien configura
 * el flujo en n8n vería un CRM sin programas y buscaría el error donde no
 * está. Mejor un 502 que diga qué pasó.
 */
export async function opciones(
  supabase: SupabaseClient,
  catalogo: Catalogo,
): Promise<Opcion[]> {
  const { data, error } = await supabase.from(catalogo).select("id, nombre").order("id");
  if (error) throw new Error(`No se pudo leer ${catalogo}: ${error.message}`);
  return (data ?? []).map((f) => ({ id: Number(f.id), nombre: String(f.nombre ?? "") }));
}

export interface Resuelto {
  id: number | null;
  /** Qué salió mal, para poder contestarlo con las opciones válidas. */
  error: string | null;
}

/**
 * `valor` puede ser un id (3, "3") o un nombre ("Diplomado en Cocina").
 *
 * Vacío o ausente devuelve `{ id: null }` sin error: casi todos los campos de
 * una oportunidad admiten quedar sin llenar, y es el endpoint quien decide
 * cuáles son obligatorios.
 */
export async function resolver(
  supabase: SupabaseClient,
  catalogo: Catalogo,
  valor: unknown,
): Promise<Resuelto> {
  if (valor == null || valor === "") return { id: null, error: null };

  const lista = await opciones(supabase, catalogo);
  const { nombre: etiqueta, femenino } = ETIQUETAS[catalogo];
  const el = femenino ? "la" : "el";
  const un = femenino ? "una" : "un";

  // Un número —o un texto que sólo tiene dígitos— se toma como id. Igual se
  // comprueba que exista: un id inventado dejaría la fila apuntando a la nada.
  const crudo = String(valor).trim();
  if (/^\d+$/.test(crudo)) {
    const n = Number(crudo);
    if (lista.some((o) => o.id === n)) return { id: n, error: null };
    return {
      id: null,
      error: `No existe ${el} ${etiqueta} con id ${n}. Opciones: ${resumen(lista)}`,
    };
  }

  const buscado = normalizarTexto(crudo);
  const exactos = lista.filter((o) => normalizarTexto(o.nombre) === buscado);
  if (exactos.length === 1) return { id: exactos[0].id, error: null };

  // Sin coincidencia exacta se prueba por contenido, que es lo que salva los
  // «Diplomado Cocina» contra «Diplomado en Cocina». Si empareja con más de
  // uno se rechaza en vez de elegir: adivinar mal el programa manda el lead al
  // asesor equivocado, y eso no se nota hasta que el cliente reclama.
  const parciales = lista.filter((o) => {
    const n = normalizarTexto(o.nombre);
    return n.includes(buscado) || buscado.includes(n);
  });
  if (parciales.length === 1) return { id: parciales[0].id, error: null };

  if (parciales.length > 1) {
    return {
      id: null,
      error: `«${crudo}» coincide con más de ${un} ${etiqueta}: ${resumen(parciales)}`,
    };
  }

  return {
    id: null,
    error: `No se reconoce ${el} ${etiqueta} «${crudo}». Opciones: ${resumen(lista)}`,
  };
}

/** Las opciones en una línea, cortadas para que el error siga siendo legible. */
function resumen(lista: Opcion[]): string {
  const primeras = lista.slice(0, 12).map((o) => `${o.id}=${o.nombre}`).join(", ");
  return lista.length > 12 ? `${primeras}, …` : primeras || "ninguna";
}
