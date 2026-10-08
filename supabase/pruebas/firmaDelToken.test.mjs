import { compilar } from "./compilar.mjs";
/**
 * Leer quién es del propio token, en vez de preguntárselo a Supabase.
 *
 *     node supabase/pruebas/firmaDelToken.test.mjs
 *
 * ============================================================================
 * LA PANTALLA QUE ESTO SACA DEL MEDIO
 * ============================================================================
 *
 * El 8 de octubre de 2026, a la 1:07 de la tarde, el CRM mostró:
 *
 *     No pudimos confirmar tu sesión
 *     Tu sesión sigue abierta: lo que pasó es que la base tardó en responder.
 *
 * Esa pantalla es correcta —la sesión estaba viva— pero no tendría que
 * aparecer nunca. Aparecía porque confirmar quién es costaba un viaje a
 * `/auth/v1/user`, y ese viaje, medido ese mismo día entre las 14:00 y las
 * 19:30 UTC, tardaba 5.714 ms en el peor uno por ciento. El tope son 3.000.
 *
 * El token ya dice quién es y viene firmado con llave asimétrica: se puede
 * comprobar acá mismo, sin viaje y sin tope que se pueda vencer.
 *
 * ============================================================================
 * LO QUE ESTA PRUEBA CUIDA DE VERDAD
 * ============================================================================
 *
 * No que se lea el `sub` —eso es una línea— sino LA TERCERA RESPUESTA.
 *
 * Hay tres situaciones y no dos: «es fulano», «no hay nadie» y «no se pudo
 * averiguar». Confundir la tercera con la segunda es exactamente el error que
 * el 6 y el 7 de octubre hizo que dos asesoras tuvieran que volver a entrar
 * veinte y trece veces en un día: un tropiezo de Supabase se leía como una
 * sesión vencida y el CRM las mandaba al login con la sesión intacta.
 */
const { leerLaFirma, usuarioDeLosClaims } = await compilar("src/lib/supabase/firmaDelToken.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const CLAIMS = {
  sub: "0f61432c-7ebb-498d-9a2e-fe4a9a575874",
  aud: "authenticated",
  role: "authenticated",
  email: "alexandra@lesarts.com",
  app_metadata: { provider: "email" },
  user_metadata: { nombre: "Alexandra" },
  exp: 2000000000,
  iat: 1999996400,
};

console.log("── un token verificado alcanza: no hay que preguntar nada ──");
{
  const v = leerLaFirma({ claims: CLAIMS }, null);
  es("se usa", v.que, "usar");
  es("y sale el id, que es lo que usan los 21 lugares", v.usuario.id, CLAIMS.sub);
  es("y el correo, que es lo que usa la barra", v.usuario.email, "alexandra@lesarts.com");
  es("con los metadatos tal cual", v.usuario.user_metadata, { nombre: "Alexandra" });
}

console.log("\n── no hay sesión: se contesta que no, sin salir a la red ──");
{
  /*
   * Las dos mitades vacías es lo que devuelve `getClaims()` cuando no hay
   * galleta. Salir a preguntarle lo mismo a Supabase sería pagar el viaje para
   * que nos digan lo que ya sabemos.
   */
  es("es un no de verdad", leerLaFirma(null, null).que, "no-hay-nadie");
  es("y un 401 también", leerLaFirma(null, { status: 401 }).que, "no-hay-nadie");
  es("y un 403", leerLaFirma(null, { status: 403 }).que, "no-hay-nadie");
}

console.log("\n── LA TERCERA RESPUESTA: no se pudo averiguar ──");
{
  /*
   * ESTO ES LO QUE NO PUEDE ROMPERSE.
   *
   * Un 429 dice que hay demasiadas peticiones. Un 500, que el servidor de
   * sesiones está mal. NINGUNO de los dos dice nada sobre la sesión de nadie.
   * Darlos por «no hay sesión» convierte un mal rato de Supabase en una
   * expulsión, con el trabajo a medias perdido.
   */
  es("un 429 NO echa a nadie", leerLaFirma(null, { status: 429 }).que, "preguntar");
  es("un 500 tampoco", leerLaFirma(null, { status: 500 }).que, "preguntar");
  es("ni un error sin código", leerLaFirma(null, { status: undefined }).que, "preguntar");

  /*
   * Y el caso raro: respuesta buena pero sin `sub`. Un token verificado
   * siempre lo trae, así que esto es algo que no entendemos —y lo que no se
   * entiende se pregunta, no se adivina—.
   */
  es("claims sin sub: se pregunta", leerLaFirma({ claims: { email: "x@y.z" } }, null).que, "preguntar");
  es("sub vacío: se pregunta", leerLaFirma({ claims: { sub: "" } }, null).que, "preguntar");
  es("sub que no es texto: se pregunta", leerLaFirma({ claims: { sub: 7 } }, null).que, "preguntar");
}

console.log("\n── el usuario que se arma no miente sobre lo que no sabe ──");
{
  const u = usuarioDeLosClaims({ sub: "abc" });

  /*
   * El token no lleva cuándo se creó la cuenta. Poner la fecha de hoy sería
   * inventarla, y alguien la terminaría mostrando en pantalla como si fuera
   * el alta de la persona. Vacío se nota; una fecha falsa no.
   */
  es("sin fecha de alta, porque no viene firmada", u.created_at, "");
  es("sin correo si el token no lo trae", u.email, undefined);
  es("pero los metadatos nunca son nulos", [u.app_metadata, u.user_metadata], [{}, {}]);
  es("y el id siempre está", u.id, "abc");

  // `aud` puede venir como lista según quién emita el token.
  es("aud en lista toma el primero", usuarioDeLosClaims({ sub: "a", aud: ["uno", "dos"] }).aud, "uno");
  es("aud suelto se usa tal cual", usuarioDeLosClaims({ sub: "a", aud: "authenticated" }).aud, "authenticated");
  es("aud ausente no rompe", usuarioDeLosClaims({ sub: "a" }).aud, "");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
