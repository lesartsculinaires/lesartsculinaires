import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/supabase/server";
import {
  APP_ID,
  CONFIG_ID,
  PERMISOS,
  dialogoDeMeta,
  direccionPublica,
  laVuelta,
  nombreDeLaGalleta,
} from "@/lib/meta/conectar";

export const dynamic = "force-dynamic";

/**
 * Empezar a conectar una cuenta de Meta: lleva al diálogo de Facebook.
 *
 * ============================================================================
 * POR QUÉ EL SERVIDOR Y NO EL SDK DE JAVASCRIPT
 * ============================================================================
 *
 * El camino típico es cargar el SDK de Facebook en la página y abrir una
 * ventanita. Acá se hace por redirección del servidor, por tres razones que en
 * este caso pesan más:
 *
 *   EL TOKEN NO TOCA EL NAVEGADOR   El código de autorización se canjea en el
 *                                   servidor, con el secreto de la app. Con el
 *                                   SDK, el token de usuario pasa por el
 *                                   navegador antes de llegar acá.
 *
 *   NO HAY BLOQUEADOR QUE VALGA     El SDK es un script de un tercero: los
 *                                   bloqueadores lo tapan y las ventanitas se
 *                                   cierran solas. Un revisor de Meta con el
 *                                   navegador endurecido vería un botón que no
 *                                   hace nada, y eso es un rechazo.
 *
 *   SE PUEDE PROBAR                 Una redirección se mira con `curl`; una
 *                                   ventanita del SDK no.
 *
 * ============================================================================
 * QUIÉN PUEDE
 * ============================================================================
 *
 * Cualquiera con sesión. Conectar exige además completar el diálogo de Meta con
 * una cuenta que administre esa Página, así que la puerta de verdad la pone
 * Meta: sin ser administrador de la Página no se puede conectar nada, tenga el
 * CRM la sesión que tenga. Y el revisor de Meta necesita poder llegar acá con
 * el usuario de prueba que se le entregue.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUser();
  if (!usuario) {
    return NextResponse.redirect(new URL("/login?redirect=/", direccionPublica(req)));
  }

  if (!APP_ID || !CONFIG_ID) {
    return NextResponse.redirect(
      new URL("/?mod=Canales&conectar=faltan_variables", direccionPublica(req)),
    );
  }

  /*
   * La vuelta tiene que ser EXACTAMENTE la que está registrada en Meta.
   *
   * Se arma desde la dirección con la que entró la petición y no desde una
   * variable, para que funcione igual en producción y en una rama de pruebas
   * sin que nadie tenga que acordarse de cambiar nada. Lo que sí hay que hacer
   * una vez, en el panel de Meta, es dar de alta esta dirección.
   */
  const vuelta = laVuelta(req);

  /*
   * El `state` ata esta vuelta a esta salida.
   *
   * Sin él, cualquiera podría mandarle a alguien con sesión un enlace a
   * `/volver?code=…` con un código suyo y dejar conectada una cuenta ajena. Va
   * en una galleta del servidor —que el navegador no lee— y se compara al
   * volver.
   */
  const state = crypto.randomUUID();

  const destino = dialogoDeMeta({ vuelta, state, permisos: PERMISOS });

  const r = NextResponse.redirect(destino);
  r.cookies.set(nombreDeLaGalleta(), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return r;
}
