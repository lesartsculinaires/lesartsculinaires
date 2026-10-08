import "server-only";

import { listarEtiquetas } from "@/app/etiquetas-actions";
import { estadoPlantillas } from "@/app/plantillas-actions";
import { fetchImportaciones } from "@/lib/supabase/bases";
import { fetchEnvios } from "@/lib/supabase/envios";
import { fetchFormularios } from "@/lib/supabase/formularios";
import { fetchInbox } from "@/lib/supabase/inbox";
import type { Conjunto } from "@/lib/datosDelModulo";
import type { DatosPerezosos } from "@/lib/datosPerezosos";

/**
 * Traer los montones de datos que se piden aparte.
 *
 * Vive suelto, y no dentro de la acción del servidor, porque lo usan los dos
 * caminos y tienen que traer exactamente lo mismo: la portada lo llama para
 * mandar de una lo que la pantalla inicial necesita, y `cargarConjuntos` lo
 * llama cuando el navegador cambia de pantalla y le falta algo.
 *
 * Si cada camino tuviera su propia lista, el día que se agregue un conjunto
 * habría que acordarse en dos lugares, y el que se olvide se manifiesta como
 * una pantalla que parpadea «Cargando…» con los datos ya en la mano.
 *
 * En paralelo, y cada uno con su propia red: que fallen los formularios no
 * puede dejar a la bandeja sin cargar. Es la regla que ya sigue la portada,
 * donde cada `fetch…` devuelve su error en vez de lanzarlo.
 */
export async function traerConjuntos(
  cuales: Iterable<Conjunto>,
): Promise<DatosPerezosos> {
  const lista = [...new Set(cuales)];
  if (lista.length === 0) return {};

  const partes = await Promise.all(
    lista.map(async (c): Promise<DatosPerezosos> => {
      switch (c) {
        case "bandeja":
          return { bandeja: await fetchInbox() };
        case "etiquetas":
          return { etiquetas: await listarEtiquetas() };
        case "plantillas":
          return { plantillas: await estadoPlantillas() };
        case "bases":
          return { bases: await fetchImportaciones() };
        case "formularios":
          return { formularios: await fetchFormularios() };
        case "envios":
          return { envios: await fetchEnvios() };
      }
    }),
  );

  return Object.assign({}, ...partes) as DatosPerezosos;
}
