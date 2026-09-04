/**
 * ¿Qué módulos llevan número rojo, y con qué número?
 *
 *     npx esbuild src/lib/avisos.ts --bundle --format=esm --platform=node \
 *       --alias:@=./src --outfile=/tmp/avisos.mjs
 *     node supabase/pruebas/avisos.test.mjs /tmp/avisos.mjs
 *
 * ------------------------------------------------------------------------
 * LO QUE IMPORTA ACÁ ES LO QUE NO SE CUENTA
 * ------------------------------------------------------------------------
 *
 * Contar de más es la forma fácil de arruinar un aviso: si el número nunca
 * baja a cero, deja de mirarse en dos días y de paso enseña a ignorar los
 * otros. Así que la mitad de esta prueba comprueba ausencias —que lo que vence
 * la semana que viene no encienda nada, que un módulo sin pendientes no
 * aparezca en el mapa— y esas son las que se rompen sin que nadie lo note.
 */
const { avisosDeLaBarra } = await import(process.argv[2] ?? "/tmp/avisos.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Un seguimiento con la urgencia que haga falta. */
const seg = (urgencia) => ({ seguimiento: { id: 1 }, urgencia, diasRestantes: 0 });
const reserva = (extra = {}) => ({
  oportunidad: { id: 1 },
  urgencia: "vencido",
  pospuesto: false,
  ...extra,
});

const nada = {
  mensajesSinLeer: 0,
  reservas: [],
  seguimientos: [],
  autorizacionesPendientes: 0,
  actividadSinVer: 0,
  frios: 0,
};

console.log("── sin nada pendiente, la barra va limpia ──");
{
  es("ningún módulo lleva número", avisosDeLaBarra(nada), {});
}

console.log("\n── cada uno cuenta lo suyo ──");
{
  es(
    "los mensajes sin leer van a Inbox",
    avisosDeLaBarra({ ...nada, mensajesSinLeer: 4 }),
    { Inbox: 4 },
  );
  es(
    "los pedidos sin resolver van a Autorizaciones",
    avisosDeLaBarra({ ...nada, autorizacionesPendientes: 2 }),
    { Autorizaciones: 2 },
  );
  es(
    "y los movimientos del equipo van a Notificaciones",
    avisosDeLaBarra({ ...nada, actividadSinVer: 9 }),
    { Notificaciones: 9 },
  );
  es(
    "y los leads fríos van a Fríos",
    avisosDeLaBarra({ ...nada, frios: 410 }),
    { "Fríos": 410 },
  );
}

console.log("\n── Notificaciones también baja a cero ──");
{
  /*
   * Es la condición para que un globito valga la pena, y la que decide si
   * éste ayuda o se vuelve ruido permanente.
   *
   * Notificaciones cuenta novedades y no pendientes, así que había que
   * comprobar que igual se apaga: abrir el módulo marca lo visto, el próximo
   * refresco trae cero, y el número desaparece. Un contador que no llega a
   * cero deja de mirarse en dos días y de paso enseña a ignorar los otros.
   */
  es("sin nada nuevo, no dibuja nada", avisosDeLaBarra({ ...nada, actividadSinVer: 0 }), {});
  es(
    "y no se cuela un cero cuando hay otros",
    avisosDeLaBarra({ ...nada, mensajesSinLeer: 2, actividadSinVer: 0 }),
    { Inbox: 2 },
  );
}

console.log("\n── RECORDATORIOS DICE LO MISMO QUE SE VE AL ABRIRLO ──");
{
  /*
   * Esto cambió a pedido de la escuela, y es el cambio que hay que cuidar.
   *
   * Antes contaba sólo lo vencido y lo de hoy. Miró su CRM, vio el módulo sin
   * globito y pidió tenerlo igual; se le explicó que un número que casi nunca
   * baja a cero se deja de mirar, y eligió que se viera.
   *
   * Entonces la regla nueva es: el globito es exactamente lo que hay adentro.
   * Que dijera 3 y adentro hubiera 11 es peor que no tener número, porque
   * enseña a no creerle.
   */
  es(
    "una reserva y dos seguimientos suman tres",
    avisosDeLaBarra({
      ...nada,
      reservas: [reserva()],
      seguimientos: [seg("hoy"), seg("vencido")],
    }),
    { Recordatorios: 3 },
  );

  es(
    "LO QUE VENCE PRONTO AHORA TAMBIÉN CUENTA",
    avisosDeLaBarra({ ...nada, seguimientos: [seg("pronto"), seg("pronto")] }),
    { Recordatorios: 2 },
  );
  es(
    "y lo que está en curso también",
    avisosDeLaBarra({ ...nada, seguimientos: [seg("en curso")] }),
    { Recordatorios: 1 },
  );
  es(
    "de una lista mezclada, los cinco",
    avisosDeLaBarra({
      ...nada,
      seguimientos: [seg("en curso"), seg("vencido"), seg("pronto"), seg("hoy"), seg("pronto")],
    }),
    { Recordatorios: 5 },
  );
}

console.log("\n── LO POSPUESTO SIGUE SIN CONTAR ──");
{
  /*
   * Lo único que se conservó de la regla vieja, y lo que evita que el globito
   * quede encendido para siempre. Apretar «recordar más adelante» es decir
   * «esto no es para hoy»; volver a contarlo sería no haberle hecho caso.
   */
  es(
    "una reserva pospuesta no enciende nada",
    avisosDeLaBarra({ ...nada, reservas: [reserva({ pospuesto: true })] }),
    {},
  );
  es(
    "y de tres, sólo cuentan las dos que no se pospusieron",
    avisosDeLaBarra({
      ...nada,
      reservas: [reserva(), reserva({ pospuesto: true }), reserva()],
    }),
    { Recordatorios: 2 },
  );
}

console.log("\n── un cero nunca queda en el mapa ──");
{
  // La barra dibuja el globito cuando el número es mayor que cero. Dejar ceros
  // acá obligaría a cada lector a acordarse de esa regla.
  const r = avisosDeLaBarra({ ...nada, mensajesSinLeer: 3 });
  es("sólo está la clave que tiene algo", Object.keys(r), ["Inbox"]);
  es("y no aparecen las otras en cero", "Recordatorios" in r, false);
}

console.log("\n── todo junto ──");
{
  es(
    "los cinco módulos, cada uno con lo suyo",
    avisosDeLaBarra({
      mensajesSinLeer: 7,
      reservas: [reserva(), reserva()],
      seguimientos: [seg("hoy"), seg("pronto")],
      autorizacionesPendientes: 1,
      actividadSinVer: 12,
      frios: 38,
    }),
    { Inbox: 7, Recordatorios: 4, "Fríos": 38, Autorizaciones: 1, Notificaciones: 12 },
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
