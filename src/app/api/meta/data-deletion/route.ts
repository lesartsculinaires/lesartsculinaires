import crypto from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { direccionPublica } from "@/lib/meta/conectar";
import { eliminarDatosDeInstagram } from "@/lib/meta/eliminar";
import { BYTES_DEL_CODIGO } from "@/lib/meta/estadoDeEliminacion";
import { leerFirmado } from "@/lib/meta/firmado";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * El aviso de Meta cuando alguien pide que le borren sus datos.
 *
 * ============================================================================
 * QUÉ ESPERA META DE VUELTA, QUE NO ES UN «OK»
 * ============================================================================
 *
 * Dos cosas, y las dos en el cuerpo de la respuesta:
 *
 *     { "url": "…", "confirmation_code": "…" }
 *
 * La URL es una página donde ESA PERSONA pueda ver cómo va su pedido, y el
 * código es con lo que lo busca. Por eso el pedido se guarda antes de borrar
 * nada: si se contestara un código que no quedó en ninguna parte, la página de
 * estado tendría que inventar una respuesta, y la de Meta es una revisión que
 * se hace entrando a mirar.
 *
 * ============================================================================
 * SE GUARDA PRIMERO Y SE BORRA DESPUÉS
 * ============================================================================
 *
 * En ese orden, a propósito. Si la función se muriera a la mitad —el tope de
 * diez segundos, una caída— el pedido queda anotado como `pendiente` y la
 * página de estado dice la verdad: «lo recibimos, todavía no está». Al revés,
 * se habría borrado sin dejar constancia de que alguien lo pidió.
 */

/**
 * El código que se le devuelve a Meta y que la persona usa para consultar.
 *
 * Dieciséis hexadecimales en mayúscula. La longitud la fija `BYTES_DEL_CODIGO`
 * y no un número suelto acá, porque la página comprueba el formato ANTES de
 * consultar la base: si las dos mitades no dijeran lo mismo, el callback
 * entregaría códigos que su propia página de estado rechaza por mal formados.
 *
 * Dieciséis dan 2^64 posibilidades, que es lo que hace que no se adivinen
 * probando contra una página sin sesión.
 */
const nuevoCodigo = (): string =>
  crypto.randomBytes(BYTES_DEL_CODIGO).toString("hex").toUpperCase();

export async function POST(req: NextRequest) {
  let crudo: string | null = null;
  try {
    const cuerpo = await req.text();
    const comoFormulario = new URLSearchParams(cuerpo).get("signed_request");
    if (comoFormulario) crudo = comoFormulario;
    else {
      try {
        crudo = (JSON.parse(cuerpo) as { signed_request?: string }).signed_request ?? null;
      } catch {
        crudo = null;
      }
    }
  } catch {
    crudo = null;
  }

  const secreto = process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  const firmado = leerFirmado(crudo, secreto);
  if (!firmado.ok || !firmado.userId) {
    console.warn(`[meta] eliminación rechazada: ${firmado.error}`);
    return NextResponse.json({ error: firmado.error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("[meta] eliminación: falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
    return NextResponse.json({ error: "servidor sin configurar" }, { status: 500 });
  }

  const codigo = nuevoCodigo();
  const donde = `${direccionPublica(req)}/eliminacion?codigo=${codigo}`;

  /*
   * El pedido, anotado antes de tocar nada.
   *
   * Que esto falle NO cancela el borrado: alguien pidió que lo borren y eso se
   * hace igual. Lo que se pierde es el rastro, y eso se grita en el registro —
   * es el síntoma de que falta correr la migración de
   * `solicitudes_eliminacion`—.
   */
  let quedoAnotado = false;
  try {
    const { error } = await admin.from("solicitudes_eliminacion").insert({
      codigo_confirmacion: codigo,
      canal_id: 1,
      identificador: firmado.userId,
      estado: "pendiente",
    });
    if (error) {
      console.error(
        `[meta] eliminación ${codigo}: no se pudo anotar el pedido (${error.message}). ` +
          "¿Falta correr 20261109120000_solicitudes_eliminacion.sql?",
      );
    } else quedoAnotado = true;
  } catch (e) {
    console.error(
      `[meta] eliminación ${codigo}: no se pudo anotar el pedido (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  const hecho = await eliminarDatosDeInstagram(admin, firmado.userId);

  if (quedoAnotado) {
    try {
      await admin
        .from("solicitudes_eliminacion")
        .update({
          estado: hecho.estado,
          completada_en: new Date().toISOString(),
          notas: hecho.notas,
          detalle: hecho.detalle,
        })
        .eq("codigo_confirmacion", codigo);
    } catch (e) {
      console.error(
        `[meta] eliminación ${codigo}: no se pudo cerrar el pedido (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  /*
   * El registro lleva los números, igual que el de desautorizar: es lo que se
   * va a querer mirar desde Netlify cuando alguien pregunte por un código.
   */
  console.log(
    `[meta] eliminación ${codigo} para ${firmado.userId}: ${hecho.estado} — ` +
      JSON.stringify(hecho.detalle),
  );

  // Siempre con la forma que Meta espera. Un pedido que no encontró nada es un
  // pedido atendido, no un error.
  return NextResponse.json({ url: donde, confirmation_code: codigo });
}
