/**
 * El token con que se le habla a Messenger tiene que ser de PÁGINA (19/11/2026).
 *
 * ----------------------------------------------------------------------------
 * EL «(#100) The requested user cannot be found» DE HC
 * ----------------------------------------------------------------------------
 *
 * Raquel le quiso contestar a una clienta por Messenger y Meta respondió que
 * la persona «no existe». Existía: el CRM estaba mandando con un token de
 * USUARIO (el de quien conectó la app), y la API de envío de Messenger sólo
 * acepta un token de la PÁGINA. Con un token de usuario Meta ni siquiera
 * reconoce a la persona —los identificadores de Messenger son de la Página—,
 * y el mensaje rebota. Por eso, desde el CRM de HC, no había salido nunca un
 * solo mensaje de Messenger: todo se contestaba desde Meta Business Suite.
 *
 * El token de Página sale del de usuario (o del de un usuario del sistema)
 * con una sola pregunta: `GET /{página}?fields=access_token`. Se hace acá,
 * antes de mandar, para que no dependa de que alguien pegue el token correcto
 * en Netlify: si mañana se vuelve a poner un token de usuario, el CRM igual
 * manda con el de la Página. Si el que está puesto ya es de Página, Meta
 * devuelve el mismo y no cambia nada.
 *
 * Se guarda en memoria unas horas para no preguntar en cada mensaje. Si Meta
 * no contesta o no da uno, se sigue con el token configurado: peor no queda.
 */

/** Cuánto se confía en un token de Página ya pedido. */
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

const guardados = new Map<string, { token: string; hasta: number }>();

export async function tokenDePagina(
  token: string,
  pagina: string,
  base: string,
  fetchImpl: typeof fetch = fetch,
  ahora: number = Date.now(),
): Promise<string> {
  const llave = `${pagina}:${token}`;
  const ya = guardados.get(llave);
  if (ya && ya.hasta > ahora) return ya.token;

  try {
    const r = await fetchImpl(`${base}/${encodeURIComponent(pagina)}?fields=access_token`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const cuerpo = (await r.json().catch(() => null)) as { access_token?: unknown } | null;
    const dePagina = typeof cuerpo?.access_token === "string" ? cuerpo.access_token.trim() : "";
    if (r.ok && dePagina) {
      guardados.set(llave, { token: dePagina, hasta: ahora + VIGENCIA_MS });
      return dePagina;
    }
  } catch {
    // Sin respuesta de Meta: se intenta con el que hay.
  }
  return token;
}

/** Para las pruebas: olvidar lo guardado. */
export function olvidarTokensDePagina(): void {
  guardados.clear();
}
