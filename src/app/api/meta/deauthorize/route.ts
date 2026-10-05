import { NextResponse, type NextRequest } from "next/server";

import { leerFirmado } from "@/lib/meta/firmado";
import { revocarCuentaDeInstagram } from "@/lib/meta/revocar";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * El aviso de Meta cuando alguien quita la aplicación.
 *
 * ============================================================================
 * NO ES EL DE BORRAR DATOS
 * ============================================================================
 *
 * Meta tiene dos avisos parecidos y conviene no mezclarlos nunca:
 *
 *   DESAUTORIZAR      «Dejá de usar mi token.» Es éste. No se borra nada.
 *   ELIMINAR DATOS    «Borrá lo que tengas mío.» Es el otro, con su tabla de
 *                     solicitudes y su código de confirmación.
 *
 * ============================================================================
 * LA FIRMA ES OTRA, Y POR ESO NO SE REUSA LA DEL WEBHOOK
 * ============================================================================
 *
 * Los webhooks de mensajes llegan con `x-hub-signature-256` en la cabecera.
 * Esto llega con un `signed_request` en el cuerpo, que es el formato viejo de
 * Facebook: dos trozos en base64url separados por un punto —la firma y el
 * contenido— y la firma es un HMAC del SEGUNDO TROZO TAL COMO VIENE, antes de
 * decodificarlo. Decodificar primero y firmar el JSON da otra cosa y no valida
 * nunca.
 *
 * Sin firma válida no se toca nada: esta dirección es pública, y sin
 * comprobarla cualquiera podría desconectarle la cuenta a la escuela mandando
 * un identificador.
 */

/** El App Secret, con la misma caída que el resto de los caminos de Meta. */
const elSecreto = (): string | undefined =>
  process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;

export async function POST(req: NextRequest) {
  let crudo: string | null = null;
  try {
    /*
     * Facebook lo manda como formulario, no como JSON. Se lee tolerante: si
     * algún día cambiara a JSON, se mira también ahí antes de rendirse.
     */
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

  const firmado = leerFirmado(crudo, elSecreto());
  if (!firmado.ok || !firmado.userId) {
    console.warn(`[meta] desautorizar rechazado: ${firmado.error}`);
    return NextResponse.json({ error: firmado.error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("[meta] desautorizar: falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
    return NextResponse.json({ error: "servidor sin configurar" }, { status: 500 });
  }

  const hecho = await revocarCuentaDeInstagram(admin, firmado.userId);

  /*
   * El registro lleva los números, que es lo que se va a querer mirar.
   *
   * Un desautorizar que no encontró nada —cero y cero— no es un error y no
   * puede parecerlo, pero sí es lo primero que uno quiere ver en los registros
   * de Netlify cuando alguien dice «quité la app y sigue conectada». Sin los
   * números habría que adivinar si el aviso llegó, si llegó con otro
   * identificador, o si no llegó nunca.
   */
  console.log(
    `[meta] desautorizó ${firmado.userId}: ` +
      `${hecho.credenciales} credencial(es) apagada(s), ` +
      `${hecho.conversaciones} conversación(es) cerrada(s)` +
      (hecho.problemas.length > 0 ? ` — problemas: ${hecho.problemas.join("; ")}` : ""),
  );

  // 200 siempre que la firma sea válida: Meta reintenta ante un error y, si
  // insiste, desactiva el aviso. Lo que salió mal queda en el registro.
  return NextResponse.json({
    ok: true,
    credenciales: hecho.credenciales,
    conversaciones: hecho.conversaciones,
  });
}
