/**
 * A quién se le puede llamar y a quién hay que pedirle permiso.
 *
 *     npx esbuild src/lib/permisoDeLlamada.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/perm.mjs
 *     node supabase/pruebas/permisoDeLlamada.test.mjs /tmp/perm.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ PROBANDO
 * ============================================================================
 *
 * Que el botón que se ve en la bandeja sea SIEMPRE el que va a funcionar.
 *
 * Sin esto, el equipo descubre el permiso de la peor manera: aprieta «Llamar»,
 * el navegador pide el micrófono, espera unos segundos y aparece un error, con
 * el cliente del otro lado esperando que le expliquen el diplomado.
 */
const {
  queOfrecer,
  sePuedeLlamar,
  comoSeLlamaElBoton,
  comoSeExplica,
  ESPERA_PARA_VOLVER_A_PEDIR_HORAS,
} = await import(process.argv[2] ?? "/tmp/perm.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const AHORA = Date.parse("2026-09-02T15:00:00Z");
const horas = (n) => new Date(AHORA + n * 3_600_000).toISOString();
const dias = (n) => horas(n * 24);

const SIN_NADA = { hasta: null, pedidoEn: null, respuesta: null };
/** Escribió recién: la ventana de 24 h está abierta. */
const ESCRIBIO_RECIEN = horas(-1);

const ver = (p, ultimo = ESCRIBIO_RECIEN) => queOfrecer(p, ultimo, AHORA);

console.log("── CON PERMISO SE LLAMA ──");
{
  const acepto = { hasta: dias(6), pedidoEn: dias(-1), respuesta: "acepto" };
  es("se puede llamar", sePuedeLlamar(acepto, AHORA), true);
  es("y el botón llama", ver(acepto), "llamar");
  es("con el texto correcto", comoSeLlamaElBoton("llamar"), "Llamar");

  // Y se dice cuánto vale, que es lo que evita que alguien lo dé por eterno.
  es(
    "dice cuántos días quedan",
    /vale \d+ días? más/.test(comoSeExplica("llamar", acepto)),
    true,
  );
}

console.log("\n── SIN PERMISO, EL BOTÓN PIDE ──");
{
  /*
   * El caso del primer día: nadie del CRM tiene permiso todavía, porque las
   * llamadas se acaban de activar.
   */
  es("ofrece pedirlo", ver(SIN_NADA), "pedir");
  es("y lo dice claro", comoSeLlamaElBoton("pedir"), "Pedir permiso para llamar");
  es("NO OFRECE LLAMAR", sePuedeLlamar(SIN_NADA, AHORA), false);
}

console.log("\n── UN PERMISO VENCIDO NO SIRVE ──");
{
  /*
   * Aceptó, pero hace un mes. El permiso se vence y volver a llamar falla del
   * lado de Meta: si acá dijera «llamar», el botón mentiría.
   */
  const vencido = { hasta: dias(-3), pedidoEn: dias(-40), respuesta: "acepto" };
  es("ya no se puede llamar", sePuedeLlamar(vencido, AHORA), false);
  es("Y VUELVE A OFRECER PEDIRLO", ver(vencido), "pedir");
}

console.log("\n── YA SE LE PIDIÓ: SE ESPERA ──");
{
  /*
   * Lo que evita que tres asesoras mirando la misma bandeja le manden la misma
   * solicitud a la misma señora en la misma tarde. Para el cliente eso no se
   * lee como interés: se lee como que le escriben de más, y bloquea el número.
   */
  const reciente = { hasta: null, pedidoEn: horas(-2), respuesta: null };
  es("NO SE LE VUELVE A PEDIR", ver(reciente), "esperando");
  es("y no hay botón que apretar", comoSeLlamaElBoton("esperando"), null);
  es(
    "explicando que el botón cambia solo",
    /cuando acepte/i.test(comoSeExplica("esperando", reciente)),
    true,
  );

  // Pasado el día, sí se puede insistir una vez más.
  const viejo = {
    hasta: null,
    pedidoEn: horas(-(ESPERA_PARA_VOLVER_A_PEDIR_HORAS + 1)),
    respuesta: null,
  };
  es("pasado el día se puede insistir", ver(viejo), "pedir");
}

console.log("\n── DIJO QUE NO: NO SE INSISTE ──");
{
  const dijoQueNo = { hasta: null, pedidoEn: dias(-5), respuesta: "rechazo" };
  es("no se le vuelve a pedir", ver(dijoQueNo), "dijo-que-no");
  es("y no hay botón", comoSeLlamaElBoton("dijo-que-no"), null);
  es(
    "pero se puede seguir por chat",
    /chat/i.test(comoSeExplica("dijo-que-no", dijoQueNo)),
    true,
  );
}

console.log("\n── UN «NO» RECIENTE NO ES «ESPERANDO» ──");
{
  /*
   * Se le pidió hace dos horas y contestó que no hace una. No se está
   * esperando ninguna respuesta: ya contestó. Decir «esperá a que conteste»
   * sería mandar a alguien a mirar un hilo donde no va a pasar nada.
   */
  const contestoQueNo = { hasta: null, pedidoEn: horas(-2), respuesta: "rechazo" };
  es("SE LEE COMO UN NO, NO COMO UNA ESPERA", ver(contestoQueNo), "dijo-que-no");
}

console.log("\n── VOLVIÓ A ACEPTAR DESPUÉS DE HABER DICHO QUE NO ──");
{
  /*
   * La última palabra es la que vale. Pasa: dice que no sin pensarlo, la
   * asesora le explica por chat para qué es, y acepta.
   */
  const cambioDeIdea = { hasta: dias(5), pedidoEn: dias(-2), respuesta: "acepto" };
  es("se puede llamar", ver(cambioDeIdea), "llamar");
}

console.log("\n── SI HACE MÁS DE 24 h QUE NO ESCRIBE, NI SE PUEDE PEDIR ──");
{
  /*
   * La solicitud viaja como un mensaje, así que le aplica la ventana de
   * WhatsApp. Ofrecer el botón igual sería una promesa falsa: Meta lo rechaza.
   */
  es("no se ofrece nada", ver(SIN_NADA, horas(-30)), "ventana-cerrada");
  es("y no hay botón", comoSeLlamaElBoton("ventana-cerrada"), null);
  es(
    "explicando que hay que esperar a que escriba",
    /vuelva a escribir/i.test(comoSeExplica("ventana-cerrada", SIN_NADA)),
    true,
  );

  // Justo en el borde: 23 horas todavía entra.
  es("a las 23 h todavía se puede pedir", ver(SIN_NADA, horas(-23)), "pedir");
  es("a las 25 h ya no", ver(SIN_NADA, horas(-25)), "ventana-cerrada");
}

console.log("\n── NUNCA ESCRIBIÓ: TAMPOCO ──");
{
  /*
   * Un hilo abierto a mano, o alguien cargado de una base. No hay ventana
   * abierta porque nunca hubo un mensaje suyo.
   */
  es("no se le puede pedir", ver(SIN_NADA, null), "ventana-cerrada");
}

console.log("\n── PERO CON PERMISO SE LLAMA AUNQUE LA VENTANA ESTÉ CERRADA ──");
{
  /*
   * Y esto es lo importante de todo el asunto, y por lo que la escuela lo
   * pidió: la ventana de 24 horas es para MENSAJES. Un permiso de llamada
   * vigente deja llamar aunque haga una semana que la persona no escribe, que
   * es exactamente el caso del lead que se enfrió y hay que recuperar.
   */
  const conPermiso = { hasta: dias(4), pedidoEn: dias(-3), respuesta: "acepto" };
  es("SE PUEDE LLAMAR IGUAL", ver(conPermiso, horas(-200)), "llamar");
}

console.log("\n── una fecha rota no rompe nada ──");
{
  /*
   * Puede venir de un dato viejo o de una migración a medias. Ante la duda,
   * no hay permiso: es el lado seguro. Dar por bueno un permiso ilegible
   * mostraría un botón de llamar que falla.
   */
  es("sin permiso", sePuedeLlamar({ hasta: "cualquier cosa", pedidoEn: null, respuesta: null }, AHORA), false);
  es(
    "y ofrece pedirlo",
    ver({ hasta: "", pedidoEn: "tampoco", respuesta: null }),
    "pedir",
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
