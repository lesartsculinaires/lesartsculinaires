import { NextResponse, type NextRequest } from "next/server";

import { abrir, manejar, ok } from "@/lib/api/http";
import { opciones, type Catalogo } from "@/lib/api/catalogos";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/catalogos — los valores válidos de cada campo.
 *
 * Existe para que el flujo de n8n y el asistente no lleven la lista de
 * programas o de etapas escrita adentro. Lo que devuelve acá es lo que se
 * puede mandar en `POST /api/v1/leads`, tanto el id como el nombre.
 *
 * También es lo primero que conviene llamar al configurar la integración: si
 * contesta, la llave está bien puesta.
 */
const CATALOGOS: Catalogo[] = [
  "productos",
  "territorios",
  "canales",
  "etapas",
  "estados",
  "tipos_evento",
];

export const GET = manejar(async (req: NextRequest) => {
  const paso = abrir(req.headers);
  if (paso instanceof NextResponse) return paso;
  const { supabase } = paso;

  const listas = await Promise.all(CATALOGOS.map((c) => opciones(supabase, c)));

  return ok({
    ok: true,
    // Los nombres del CRM van al lado del de la tabla: en pantalla se dice
    // «programa» y «territorio», y quien arma el flujo busca esas palabras.
    programas: listas[0],
    territorios: listas[1],
    // `sedes` se llamaba así antes y se queda: un flujo de n8n que ya lo esté
    // leyendo se rompería sin aviso y el error aparecería lejos de acá.
    sedes: listas[1],
    canales: listas[2],
    etapas: listas[3],
    estados: listas[4],
    tipos_evento: listas[5],
  });
});
