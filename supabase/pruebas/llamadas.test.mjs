/**
 * Cuándo una llamada interrumpe y cuándo no.
 *
 *     npx esbuild src/lib/llamadas.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/ll.mjs
 *     node supabase/pruebas/llamadas.test.mjs /tmp/ll.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ PROBANDO
 * ============================================================================
 *
 * La condición que puso la escuela, que es la única parte de las llamadas que
 * no se puede comprobar mirando la pantalla —haría falta que entrara una
 * llamada de verdad, en cinco computadoras a la vez, con alguien escribiendo
 * en una de ellas—:
 *
 *   «No quiero que vayan a afectar las llamadas entrantes al momento que estén
 *    escribiendo o interactuando en el CRM. Me gustaría que apareciera como pop
 *    up la llamada y contestarla, pero en los demás dispositivos se minimice y
 *    se visualice en una esquina.»
 */
const { comoSeMuestra, comoReloj, comoSeLee, estaOcupado, quedoColgada, SEGUNDOS_QUE_SUENA } =
  await import(process.argv[2] ?? "/tmp/ll.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const AHORA = Date.parse("2026-09-02T15:00:00Z");

/** Una llamada entrante sonando, recién entrada. */
const sonando = (extra = {}) => ({
  callId: "wacid.1",
  telefono: "50377972598",
  conversacionId: 7,
  direccion: "entrante",
  estado: "sonando",
  atendidaPor: null,
  creadoEn: new Date(AHORA - 3000).toISOString(),
  ...extra,
});

const KATYA = { usuarioId: "u-katya", vendedorId: 4 };
const ANA = { usuarioId: "u-ana", vendedorId: 9 };
const DIRECCION = { usuarioId: "u-jefa", vendedorId: null };

const LIBRE = { tecleoHaceMs: null, arrastrando: false };
const ESCRIBIENDO = { tecleoHaceMs: 300, arrastrando: false };

const ver = (ll, yo, dueno, haciendo = LIBRE) =>
  comoSeMuestra(ll, yo, dueno, haciendo, AHORA);

console.log("── EL POP-UP SALE EN UNA SOLA PANTALLA ──");
{
  /*
   * Lo primero que pidió la escuela. El hilo es de Katya, y el equipo entero
   * tiene el CRM abierto.
   */
  es("a la dueña del hilo le interrumpe", ver(sonando(), KATYA, 4).presencia, "pop-up");
  es("A LAS DEMÁS NO", ver(sonando(), ANA, 4).presencia, "esquina");
  es("y a dirección tampoco", ver(sonando(), DIRECCION, 4).presencia, "esquina");

  // Y la de la esquina dice por qué la está viendo, que es lo que permite
  // decidir en un segundo si uno la agarra o la deja.
  es("la esquina sabe de quién es", ver(sonando(), ANA, 4).porque, "es-de-otro");
}

console.log("\n── ESCRIBIENDO NO INTERRUMPE, NI SIENDO SUYA ──");
{
  /*
   * La otra mitad del pedido. Katya está escribiendo una cotización; la
   * llamada es suya. Un pop-up ahora se lleva puesto el foco y la frase.
   */
  const v = ver(sonando(), KATYA, 4, ESCRIBIENDO);
  es("NO INTERRUMPE", v.presencia, "esquina");
  es("y dice por qué", v.porque, "estoy-escribiendo");

  // Pero no se pierde: sigue sonando en la esquina, y sube sola en cuanto
  // levanta las manos.
  es(
    "en cuanto para, sube a pop-up",
    ver(sonando(), KATYA, 4, { tecleoHaceMs: 4000, arrastrando: false }).presencia,
    "pop-up",
  );
}

console.log("\n── arrastrar un lead cuenta como estar ocupado ──");
{
  /*
   * «Escribiendo o interactuando», dijo la escuela. Un pop-up en el medio de
   * un arrastre suelta la tarjeta donde caiga, y mover un lead de etapa por
   * accidente es peor que atender tarde.
   */
  es("arrastrando está ocupado", estaOcupado({ tecleoHaceMs: null, arrastrando: true }), true);
  es(
    "y no le sale el pop-up",
    ver(sonando(), KATYA, 4, { tecleoHaceMs: null, arrastrando: true }).presencia,
    "esquina",
  );
}

console.log("\n── un hilo sin asignar es de todos ──");
{
  /*
   * Si el pop-up saliera sólo para la dueña y no hay dueña, no le saldría a
   * nadie: la llamada sonaría bajito en cinco esquinas y se perdería.
   */
  es("le interrumpe a Katya", ver(sonando(), KATYA, null).presencia, "pop-up");
  es("y también a Ana", ver(sonando(), ANA, null).presencia, "pop-up");
  es("con la razón puesta", ver(sonando(), ANA, null).porque, "sin-asignar");

  // Menos a quien no atiende clientes: el pop-up es para quien puede contestar.
  es("a dirección, en la esquina", ver(sonando(), DIRECCION, null).presencia, "esquina");
}

console.log("\n── EN CUANTO UNA ATIENDE, SE APAGA EN LAS DEMÁS ──");
{
  /*
   * Lo que evita que cinco personas se queden mirando una llamada que ya
   * está atendida. No hace falta cerrar nada a mano: la fila cambia y las
   * otras pantallas la sueltan solas.
   */
  const atendida = sonando({ estado: "contestando", atendidaPor: "u-katya" });

  es("a quien la atendió le queda la esquina", ver(atendida, KATYA, 4).presencia, "esquina");
  es("y con el estado bien", ver(atendida, KATYA, 4).porque, "la-estoy-atendiendo");
  es("A LAS DEMÁS SE LES VA", ver(atendida, ANA, 4).presencia, "nada");
  es("y a dirección también", ver(atendida, DIRECCION, 4).presencia, "nada");
}

console.log("\n── hablando tampoco tapa la pantalla ──");
{
  /*
   * A propósito: mientras se habla hay que poder mirar la ficha del cliente
   * con el que uno está hablando. Un pop-up encima sería justo lo contrario.
   */
  const enCurso = sonando({ estado: "en_curso", atendidaPor: "u-katya" });
  es("la llamada propia va a la esquina", ver(enCurso, KATYA, 4).presencia, "esquina");
}

console.log("\n── la que terminó no se muestra ──");
{
  for (const estado of ["terminada", "rechazada", "perdida", "fallida"]) {
    es(`«${estado}» no se muestra`, ver(sonando({ estado }), KATYA, 4).presencia, "nada");
  }
}

console.log("\n── UNA QUE QUEDÓ COLGADA NO SUENA PARA SIEMPRE ──");
{
  /*
   * Meta la corta sola al minuto, y avisa por el webhook. Pero el aviso puede
   * no llegar —se cae la red, se pierde el reintento— y la fila se queda en
   * «sonando». Sin tope, el teléfono sonaría en todas las pantallas por una
   * llamada que se cortó hace media hora, y al abrir el CRM a la mañana
   * siguiente estarían sonando todas las de ayer.
   */
  const vieja = sonando({
    creadoEn: new Date(AHORA - (SEGUNDOS_QUE_SUENA + 10) * 1000).toISOString(),
  });
  es("se da por muerta", quedoColgada(vieja, AHORA), true);
  es("Y NO SUENA", ver(vieja, KATYA, 4).presencia, "nada");

  // Una de hace medio minuto sí es de verdad y tiene que sonar.
  const fresca = sonando({ creadoEn: new Date(AHORA - 30_000).toISOString() });
  es("una de hace 30 s sigue viva", quedoColgada(fresca, AHORA), false);
  es("y suena", ver(fresca, KATYA, 4).presencia, "pop-up");
}

console.log("\n── la que marqué yo la veo yo, y nadie más ──");
{
  const saliente = sonando({ direccion: "saliente" });
  es("en la esquina de quien llamó", ver(saliente, KATYA, 4).presencia, "esquina");
  es("diciendo que está llamando", ver(saliente, KATYA, 4).porque, "yo-la-hice");
}

console.log("\n── UNA SALIENTE QUE SUENA NO DICE «EN LLAMADA» ──");
{
  /*
   * El caso de verdad, y el que estaba mal.
   *
   * `llamarA` escribe la fila con `atendidaPor` puesto desde el primer
   * momento: quien apretó «Llamar» ya la está atendiendo y nadie más tiene
   * que verla sonar. Pero eso la hacía caer en la rama de «ya la agarró
   * alguien», y la tarjeta decía «En llamada.» mientras al cliente recién le
   * estaba sonando el teléfono. Quien marcaba leía que ya estaba hablando y
   * no escuchaba a nadie.
   */
  const marcandoYo = sonando({
    direccion: "saliente",
    atendidaPor: KATYA.usuarioId,
  });
  es("está en la esquina", ver(marcandoYo, KATYA, 4).presencia, "esquina");
  es("Y DICE QUE ESTÁ LLAMANDO, NO QUE YA HABLA", ver(marcandoYo, KATYA, 4).porque, "yo-la-hice");
  es(
    "y en la pantalla de otra persona no aparece",
    ver(marcandoYo, ANA, 4).presencia,
    "nada",
  );

  // Cuando Meta contesta, la fila pasa a `en_curso` y RECIÉN AHÍ es «En
  // llamada»: es lo que hace que el rótulo signifique algo.
  const yaHablando = sonando({
    direccion: "saliente",
    estado: "en_curso",
    atendidaPor: KATYA.usuarioId,
  });
  es("ya en curso, sigue en la esquina", ver(yaHablando, KATYA, 4).presencia, "esquina");
  es("y ahí sí dice que está en llamada", ver(yaHablando, KATYA, 4).porque, "la-estoy-atendiendo");
}

console.log("\n── sin sesión no se muestra nada ──");
{
  /*
   * Puede pasar entre que caduca la sesión y que la pantalla se entera. Sin
   * esto, un pop-up para «nadie» quedaría trabado encima de la pantalla de
   * login.
   */
  const nadie = { usuarioId: null, vendedorId: null };
  es("sin asignar, a la esquina", ver(sonando(), nadie, null).presencia, "esquina");
}

console.log("\n── el reloj ──");
{
  es("los segundos van con cero", comoReloj(7), "0:07");
  es("el minuto justo", comoReloj(60), "1:00");
  es("y uno largo", comoReloj(725), "12:05");
  es("negativo no rompe", comoReloj(-3), "0:00");
}

console.log("\n── CÓMO SE LEE DESPUÉS ──");
{
  /*
   * La diferencia que le importa a quien mira la bandeja al otro día: una
   * perdida es trabajo pendiente —hay que devolverla— y una rechazada ya la
   * decidió alguien.
   */
  es(
    "una recibida dice cuánto duró",
    comoSeLee({ estado: "terminada", direccion: "entrante" }, 95),
    "Llamada recibida · 1:35",
  );
  es(
    "una que hicimos, igual",
    comoSeLee({ estado: "terminada", direccion: "saliente" }, 20),
    "Llamada realizada · 0:20",
  );
  es(
    "PERDIDA ES TRABAJO PENDIENTE",
    comoSeLee({ estado: "perdida", direccion: "entrante" }, null),
    "Llamada perdida",
  );
  es(
    "y una nuestra que no atendieron se lee distinto",
    comoSeLee({ estado: "perdida", direccion: "saliente" }, null),
    "No contestó",
  );
  es(
    "rechazada no es perdida",
    comoSeLee({ estado: "rechazada", direccion: "entrante" }, null),
    "Llamada rechazada",
  );
  es(
    "sin duración no inventa un reloj",
    comoSeLee({ estado: "terminada", direccion: "entrante" }, 0),
    "Llamada recibida",
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
