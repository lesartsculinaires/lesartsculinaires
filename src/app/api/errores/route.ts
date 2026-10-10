import { NextResponse } from "next/server";

import { limpiarReporte } from "@/lib/recuperarse";
import { getServerClient, quienEs } from "@/lib/supabase/server";

/**
 * Donde el navegador cuenta que la pantalla le falló.
 *
 * Lo llama `PantallaDeRecuperacion` cada vez que ataja una falla. Sin esto, lo
 * único que quedaba de una pantalla blanca era una foto del monitor; el error
 * de verdad vivía en la consola de esa computadora y se perdía al recargar.
 *
 * Se guarda COMO QUIEN LO MANDA, no con la llave de servicio: la política de
 * `errores_cliente` sólo deja anotar a nombre propio, así que nadie puede
 * dejar errores firmados por otro. Leerlos es sólo para administradores.
 *
 * Además se escribe en el registro de la función, para que se vea en Netlify
 * aunque la tabla todavía no exista.
 */
export async function POST(req: Request) {
  const { user } = await quienEs();
  if (!user) return new NextResponse(null, { status: 401 });

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const reporte = limpiarReporte(crudo);
  if (!reporte) return new NextResponse(null, { status: 400 });

  console.error(
    `[navegador] ${reporte.donde} · ${reporte.modulo ?? "?"} · intento ${reporte.intento} · ${reporte.nombre ?? "Error"}: ${reporte.mensaje}`,
  );

  const supabase = await getServerClient();
  if (supabase) {
    const { error } = await supabase.from("errores_cliente").insert({
      usuario_id: user.id,
      mensaje: reporte.mensaje,
      nombre: reporte.nombre,
      pila: reporte.pila,
      digest: reporte.digest,
      url: reporte.url,
      modulo: reporte.modulo,
      donde: reporte.donde,
      intento: reporte.intento,
      navegador: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
      despliegue: process.env.DEPLOY_ID ?? process.env.COMMIT_REF ?? null,
    });
    // Que falle esto no es asunto de quien está trabajando: ya se anotó arriba.
    if (error) console.warn("[navegador] no se pudo guardar el reporte:", error.code ?? "", error.message ?? "");
  }

  return new NextResponse(null, { status: 204 });
}
