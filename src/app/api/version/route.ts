import { NextResponse } from "next/server";

/**
 * La versión del CRM que está publicada ahora.
 *
 * La consulta cada pestaña abierta (`AvisoDeVersionNueva`) para enterarse de
 * que se desplegó otra y ofrecer recargar antes de que algo falle. El valor
 * queda escrito en el servidor al compilar, igual que en la pantalla: si los
 * dos no coinciden, la pantalla es de una versión anterior.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: process.env.VERSION_DEL_CRM ?? "desarrollo" },
    { headers: { "cache-control": "no-store" } },
  );
}
