/**
 * Quién es, leído del propio token en vez de preguntándole a Supabase.
 *
 * ============================================================================
 * EL VIAJE QUE SE PAGABA ANTES DE DIBUJAR CUALQUIER COSA
 * ============================================================================
 *
 * `auth.getUser()` siempre sale a la red: un `GET /auth/v1/user` por cada
 * pantalla y por cada una de las cincuenta y seis acciones del servidor, en el
 * camino crítico de todo. Medido en producción el 8 de octubre de 2026, entre
 * las 14:00 y las 19:30 UTC:
 *
 *     4.065 llamadas   306 ms de promedio   1.648 ms el p95   5.714 ms el p99
 *
 * Con el tope de tres segundos que tiene puesto `server.ts`, ese p99 ES la
 * pantalla «No pudimos confirmar tu sesión»: una de cada cien, con la sesión
 * perfectamente viva. Y las 4.065 son además carga que se le suma a una base
 * que ya venía ahogada —o sea que el problema se alimenta solo—.
 *
 * `getClaims()` hace la misma comprobación sin salir a ningún lado, porque el
 * proyecto firma con llave asimétrica (ES256, comprobado contra
 * `/auth/v1/.well-known/jwks.json`). La librería se baja la llave PÚBLICA una
 * vez, la guarda en una caché que comparten todos los clientes del mismo
 * proceso, y verifica la firma con WebCrypto. En el registro se ven 36 bajadas
 * de la llave contra 4.065 preguntas: la caché funciona.
 *
 * ============================================================================
 * NO ES CONFIAR EN LA GALLETA
 * ============================================================================
 *
 * Eso sería `getSession()`, que lee lo que venga sin comprobar nada y
 * aceptaría un token inventado. Acá se verifica la FIRMA: un token que no
 * salió de Supabase no pasa, y uno vencido tampoco.
 *
 * Es lo mismo que hace el middleware desde hace un mes, con el mismo
 * razonamiento escrito al lado.
 *
 * ============================================================================
 * LO QUE SÍ SE PIERDE, DICHO CLARO
 * ============================================================================
 *
 * Preguntarle al servidor confirma que la cuenta TODAVÍA EXISTE y no está
 * bloqueada. Verificar la firma, no: a quien se le borre la cuenta le sigue
 * andando el CRM hasta que se le venza el token.
 *
 * Cuánto es eso, medido: el proyecto emite tokens de 3.600 segundos. Para una
 * escuela de doce cuentas internas, donde dar de baja a alguien es un trámite
 * planeado y no una urgencia, una hora es aceptable. Si deja de serlo hay dos
 * salidas que no obligan a volver atrás: bajar la vida del token en el panel
 * de Supabase, o cerrarle la sesión a esa persona, que invalida el refresco en
 * el acto.
 *
 * Y lo de siempre: esto no es lo que protege los datos. Eso son las políticas
 * de la base, que validan el token en cada consulta.
 */

/** Lo que viene dentro de un token de acceso de Supabase y acá se usa. */
export type Firmado = {
  sub?: unknown;
  aud?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  is_anonymous?: unknown;
};

/** La forma mínima de un usuario de Supabase que el CRM necesita. */
export type UsuarioDeFirma = {
  id: string;
  aud: string;
  role?: string;
  email?: string;
  phone?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  is_anonymous?: boolean;
  created_at: string;
};

/**
 * Qué hacer con lo que contestó `getClaims()`.
 *
 *   usar          La firma cuadra y el token dice quién es. Listo, sin red.
 *
 *   no-hay-nadie  No hay sesión. Es un «no» de verdad y se contesta como tal:
 *                 salir a preguntarle lo mismo a la red sería pagar el viaje
 *                 para que nos digan que no hay nadie.
 *
 *   preguntar     No se pudo decidir acá. Que NO es lo mismo que «no»: una
 *                 firma que no se pudo comprobar, un token ilegible o un
 *                 refresco que falló son motivos para preguntar, no para
 *                 inventar un rechazo. Ésa es exactamente la confusión que el
 *                 6 y el 7 de octubre de 2026 hizo que dos asesoras tuvieran
 *                 que volver a entrar veinte y trece veces en un día.
 */
export type Veredicto =
  | { que: "usar"; usuario: UsuarioDeFirma }
  | { que: "no-hay-nadie" }
  | { que: "preguntar" };

const texto = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : undefined;

/** El usuario que sale de unos claims ya verificados. */
export function usuarioDeLosClaims(c: Firmado): UsuarioDeFirma {
  return {
    id: String(c.sub),
    aud: Array.isArray(c.aud) ? (texto(c.aud[0]) ?? "") : (texto(c.aud) ?? ""),
    role: texto(c.role),
    email: texto(c.email),
    phone: texto(c.phone),
    app_metadata: c.app_metadata ?? {},
    user_metadata: c.user_metadata ?? {},
    is_anonymous: typeof c.is_anonymous === "boolean" ? c.is_anonymous : undefined,
    /*
     * El token no lleva cuándo se creó la cuenta, así que esto no se puede
     * completar sin el viaje que estamos evitando. Va vacío A PROPÓSITO.
     *
     * Hoy nadie lo mira: de todo el objeto, el CRM usa `id` en veintiún
     * lugares y `email` en uno —el nombre en la barra de arriba— y los dos SÍ
     * vienen firmados. Si algún día hace falta la fecha de alta, sale de la
     * tabla `usuarios`, que es donde vive la ficha de cada persona.
     */
    created_at: "",
  };
}

/**
 * Lee la respuesta de `getClaims()` y dice qué hacer.
 *
 * Se recibe suelto —datos por un lado, error por el otro— y no el objeto de la
 * librería, para que esto se pueda probar sin levantar medio Supabase.
 */
export function leerLaFirma(
  datos: { claims?: unknown } | null | undefined,
  error: { status?: number } | null | undefined,
): Veredicto {
  // Sin sesión, `getClaims` devuelve las dos mitades vacías.
  if (!error && !datos) return { que: "no-hay-nadie" };

  /*
   * Y éstos son los dos códigos que SÍ significan «esta persona no está
   * autenticada». Cualquier otro —un 429 porque hay demasiadas peticiones, un
   * 500 porque el servidor de sesiones está mal— no dice nada sobre la sesión
   * de nadie: dice que no se pudo preguntar. Tratarlo como un «no» convierte
   * un mal rato de Supabase en una expulsión.
   */
  const codigo = error?.status;
  if (codigo === 401 || codigo === 403) return { que: "no-hay-nadie" };

  if (error) return { que: "preguntar" };

  const claims = datos?.claims as Firmado | undefined;
  // Un token verificado SIEMPRE trae `sub`. Que falte es raro de verdad, así
  // que se pregunta en vez de dar por buena una identidad a medias.
  if (!claims || typeof claims.sub !== "string" || claims.sub === "") {
    return { que: "preguntar" };
  }

  return { que: "usar", usuario: usuarioDeLosClaims(claims) };
}
