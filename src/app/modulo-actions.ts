"use server";

import { CONJUNTOS, esConjunto, type Conjunto } from "@/lib/datosDelModulo";
import type { DatosPerezosos } from "@/lib/datosPerezosos";
import { traerConjuntos } from "@/lib/supabase/conjuntos";
import { getUser } from "@/lib/supabase/server";

/**
 * Traer los montones de datos que la pantalla recién abierta necesita.
 *
 * ============================================================================
 * POR QUÉ UNA SOLA ACCIÓN Y NO UNA POR CONJUNTO
 * ============================================================================
 *
 * Porque abrir la bandeja necesita tres —hilos, etiquetas y plantillas— y tres
 * acciones del servidor son tres idas y vueltas a Netlify, cada una con su
 * arranque de función y su comprobación de sesión. Pedirlas juntas las
 * resuelve en un viaje, y adentro salen en paralelo igual.
 *
 * ============================================================================
 * LA LISTA LLEGA DEL NAVEGADOR, ASÍ QUE NO SE LE CREE
 * ============================================================================
 *
 * Se filtra contra los nombres que conocemos antes de tocar nada. No es que un
 * nombre inventado pudiera leer algo prohibido —cada consulta corre como la
 * persona que la pide y la base aplica sus políticas igual— pero una lista de
 * mil nombres repetidos sí sería una forma barata de hacer trabajar al
 * servidor de gusto. Por eso también se recortan los repetidos y se topea
 * cuántos entran: más que los que existen es, por definición, basura.
 */
export async function cargarConjuntos(
  pedidos: readonly string[],
): Promise<{ datos: DatosPerezosos; error: string | null }> {
  /*
   * Quién es, primero. No porque la base no lo compruebe —lo hace— sino para
   * no salir a hacer seis consultas que van a volver vacías, y para poder
   * contestar algo que se pueda mostrar en vez de seis listas en blanco, que
   * se leen como «no hay nada».
   */
  const user = await getUser();
  if (!user) {
    return {
      datos: {},
      error:
        "No pudimos confirmar tu sesión. Probá de nuevo; si sigue, volvé a iniciar sesión.",
    };
  }

  const quiere = new Set<Conjunto>();
  for (const p of pedidos.slice(0, CONJUNTOS.length * 2)) {
    if (esConjunto(p)) quiere.add(p);
  }
  if (quiere.size === 0) return { datos: {}, error: null };

  return { datos: await traerConjuntos(quiere), error: null };
}
