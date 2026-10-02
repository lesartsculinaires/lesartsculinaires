import { NextResponse, type NextRequest } from "next/server";

import {
  CAMPOS_WEBHOOK,
  canjeDelCodigo,
  laspaginasDe,
  direccionPublica,
  laVuelta,
  leerPaginas,
  nombreDeLaGalleta,
  secretoDeLaApp,
  suscribirPagina,
} from "@/lib/meta/conectar";
import { guardarCredencial } from "@/lib/meta/credenciales";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Vuelve a la pantalla de Canales diciendo cómo fue.
 *
 * La dirección se arma con el nombre PÚBLICO y no con `req.url`, por lo mismo
 * que la `redirect_uri`: detrás de un proxy `req.url` puede decir `localhost`.
 * Y acá eso no es un detalle estético — mandar el navegador a otro nombre lo
 * deja sin la galleta de sesión, así que el CRM lo manda al login y quien
 * acababa de conectar su cuenta ve una pantalla de contraseña. Es exactamente
 * lo que haría pensar a un revisor de Meta que la conexión no funcionó.
 */
const volverDiciendo = (req: NextRequest, que: string, detalle?: string) => {
  const u = new URL("/?mod=Canales", direccionPublica(req));
  u.searchParams.set("conectar", que);
  if (detalle) u.searchParams.set("detalle", detalle.slice(0, 300));
  return NextResponse.redirect(u);
};

/**
 * La vuelta del diálogo de Meta: canjear, guardar y suscribir.
 *
 * ============================================================================
 * LOS TRES PASOS, Y POR QUÉ NINGUNO SE PUEDE SALTAR
 * ============================================================================
 *
 *   1. CANJEAR    El código que trae la vuelta se cambia por un token de
 *                 usuario, usando el secreto de la app. Dura poco y no sirve
 *                 para mensajería: es sólo para el paso 2.
 *
 *   2. LAS        `/me/accounts` devuelve las Páginas que esa persona
 *      PÁGINAS    administra, cada una con SU PROPIO token y con la cuenta de
 *                 Instagram ligada. Ese token de Página es el que se guarda:
 *                 es el que Meta acepta para leer y contestar mensajes.
 *
 *   3. SUSCRIBIR  `POST /{pagina}/subscribed_apps`. ES EL PASO QUE TODO EL
 *                 MUNDO OLVIDA. Sin él la conexión queda perfecta, el token
 *                 sirve para contestar… y no entra ni un mensaje, porque Meta
 *                 no sabe que tiene que avisarle a esta app. Es exactamente el
 *                 síntoma que haría fallar la revisión: el revisor conecta su
 *                 cuenta, se escribe un mensaje y no aparece nada.
 *
 * Que falle el 3 no deshace el 1 y el 2: la cuenta queda guardada y se avisa,
 * porque reconectar es un botón y volver a empezar de cero es una molestia.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUser();
  if (!usuario) return NextResponse.redirect(new URL("/login?redirect=/", direccionPublica(req)));

  const url = new URL(req.url);

  /*
   * Si la persona canceló en el diálogo, Meta vuelve con `error`, no con
   * `code`. No es un fallo del CRM y no se muestra como tal.
   */
  const negado = url.searchParams.get("error");
  if (negado) {
    return volverDiciendo(req, "cancelado", url.searchParams.get("error_description") ?? negado);
  }

  const codigo = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const esperado = req.cookies.get(nombreDeLaGalleta())?.value;

  if (!codigo) return volverDiciendo(req, "sin_codigo");
  if (!state || !esperado || state !== esperado) return volverDiciendo(req, "state_invalido");
  if (!secretoDeLaApp()) return volverDiciendo(req, "falta_secreto");

  const vuelta = laVuelta(req);

  try {
    // ── 1. el código, por un token de usuario ──────────────────────────────
    const rCanje = await fetch(canjeDelCodigo({ vuelta, codigo }), {
      signal: AbortSignal.timeout(15000),
    });
    const canje = (await rCanje.json().catch(() => null)) as Record<string, unknown> | null;
    const tokenUsuario = canje?.access_token == null ? "" : String(canje.access_token);

    if (!rCanje.ok || !tokenUsuario) {
      const e = (canje?.error ?? {}) as Record<string, unknown>;
      return volverDiciendo(req, "canje_fallo", String(e.message ?? `HTTP ${rCanje.status}`));
    }

    // ── 2. las Páginas que administra ──────────────────────────────────────
    const rPaginas = await fetch(laspaginasDe(tokenUsuario), {
      signal: AbortSignal.timeout(15000),
    });
    const paginas = leerPaginas(await rPaginas.json().catch(() => null));

    if (paginas.length === 0) {
      /*
       * Es el caso más común de «conecté y no pasó nada»: la cuenta de
       * Instagram no está ligada a ninguna Página, o la persona no eligió
       * ninguna en el diálogo. El mensaje tiene que decir eso y no «error».
       */
      return volverDiciendo(req, "sin_paginas");
    }

    // ── 3. guardar y suscribir, Página por Página ──────────────────────────
    let guardadas = 0;
    let conInstagram = 0;
    const problemas: string[] = [];

    for (const p of paginas) {
      /*
       * Cada Página se guarda DOS VECES, una por canal.
       *
       * Messenger e Instagram comparten Página y token pero son canales
       * distintos en el CRM, y el hilo de cada uno busca su credencial por su
       * canal. Una sola fila obligaría a que el que resuelve supiera que
       * Instagram a veces se guarda como Messenger, que es justo el tipo de
       * regla escondida que después nadie encuentra.
       */
      const comun = {
        pageId: p.id,
        pageNombre: p.nombre,
        igId: p.igId,
        igUsuario: p.igUsuario,
        token: p.token,
        quien: usuario.id,
      };

      const m = await guardarCredencial({ ...comun, canal: "messenger" });
      if (!m.ok) problemas.push(m.error ?? "no se pudo guardar Messenger");

      if (p.igId) {
        const i = await guardarCredencial({ ...comun, canal: "instagram" });
        if (i.ok) conInstagram += 1;
        else problemas.push(i.error ?? "no se pudo guardar Instagram");
      }

      if (m.ok) guardadas += 1;

      // La suscripción al webhook: sin esto no entra ningún mensaje.
      try {
        const rSub = await fetch(suscribirPagina(p.id), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subscribed_fields: CAMPOS_WEBHOOK.join(","),
            access_token: p.token,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const sub = (await rSub.json().catch(() => null)) as Record<string, unknown> | null;
        if (!rSub.ok || sub?.success === false) {
          const e = (sub?.error ?? {}) as Record<string, unknown>;
          problemas.push(
            `no se pudo suscribir «${p.nombre ?? p.id}» al webhook: ${String(
              e.message ?? `HTTP ${rSub.status}`,
            )}`,
          );
        }
      } catch {
        problemas.push(`no se pudo suscribir «${p.nombre ?? p.id}» al webhook`);
      }
    }

    if (guardadas === 0) {
      return volverDiciendo(req, "no_se_guardo", problemas[0] ?? "");
    }

    const r = volverDiciendo(
      req,
      problemas.length > 0 ? "conectado_con_avisos" : "conectado",
      problemas.length > 0
        ? problemas[0]
        : `${guardadas} página${guardadas === 1 ? "" : "s"}` +
            (conInstagram > 0 ? `, ${conInstagram} con Instagram` : ", ninguna con Instagram"),
    );
    // La galleta del `state` ya cumplió; dejarla sería dejar una llave usada.
    r.cookies.delete(nombreDeLaGalleta());
    return r;
  } catch (e) {
    return volverDiciendo(req, "error", e instanceof Error ? e.message : String(e));
  }
}
