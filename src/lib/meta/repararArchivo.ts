import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cuando el reintento de Meta sí trajo el archivo, pero el mensaje ya estaba.
 *
 * ============================================================================
 * EL CASO REAL, QUE COSTÓ UNA NOTA DE VOZ
 * ============================================================================
 *
 * El 6 de octubre de 2026 a las 10:30 llegó una nota de voz. El archivo se bajó
 * bien de Meta, pero al guardarlo en Storage la base contestó «The connection to
 * the database timed out» —Supabase Storage guarda los metadatos del objeto en
 * Postgres, así que una base fría también tumba una subida—. El mensaje quedó
 * guardado diciendo que el archivo no se pudo traer.
 *
 * Meta reintentó el webhook veintinueve segundos después. Esa segunda vez la
 * subida SÍ funcionó: el `.ogg` quedó en el bucket, entero, 11.632 bytes. Pero
 * al insertar el mensaje chocó con la unicidad de `wa_id` —ya estaba— y el
 * código se volvía con un `return`.
 *
 * O sea que el archivo estaba ahí, y la pantalla siguió diciendo «no se pudo
 * traer el archivo» para siempre. El reintento de Meta hizo todo el trabajo y
 * tiró el resultado a la basura.
 *
 * ============================================================================
 * POR QUÉ SÓLO REPARA, Y NUNCA PISA
 * ============================================================================
 *
 * El `is("media_ruta", null)` es la pieza importante. Un reintento normal —uno
 * donde la primera vez salió todo bien— vuelve a bajar y subir el mismo archivo,
 * y sin esa condición escribiría encima de una fila que ya estaba perfecta.
 * No rompería nada hoy, pero convierte un reintento inofensivo en una escritura,
 * y lo que se busca acá es exactamente lo contrario: tocar sólo lo que está roto.
 *
 * Por eso tampoco borra `media_error` por su cuenta: lo borra como parte de la
 * misma fila que por fin tiene ruta. Un mensaje cuyo archivo Meta ya borró sigue
 * diciendo por qué falta, que es lo que después permite entender un comprobante
 * que no está.
 */
export async function repararArchivo(
  supabase: SupabaseClient,
  waId: string,
  archivo: { ruta: string | null; mime: string | null } | null,
  etiqueta: string,
): Promise<void> {
  // Este reintento tampoco trajo nada: no hay con qué reparar.
  if (!archivo?.ruta) return;

  const { error } = await supabase
    .from("mensajes")
    .update({
      media_ruta: archivo.ruta,
      media_mime: archivo.mime,
      media_error: null,
    })
    .eq("wa_id", waId)
    // Sólo el que está sin archivo. Ver arriba.
    .is("media_ruta", null);

  if (error) {
    /*
     * No se lanza: quien llama es el webhook, que tiene que contestarle 200 a
     * Meta pase lo que pase. Si esto falla, el mensaje sigue como estaba —con
     * su aviso— y el próximo reintento vuelve a intentarlo.
     */
    console.error(`[${etiqueta}] no se pudo reparar el archivo de`, waId, error.message);
  }
}
