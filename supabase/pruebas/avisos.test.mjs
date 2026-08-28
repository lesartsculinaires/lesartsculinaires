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
const reserva = () => ({ oportunidad: { id: 1 }, urgencia: "vencido" });

const nada = {
  mensajesSinLeer: 0,
  reservasUrgentes: [],
  seguimientos: [],
  autorizacionesPendientes: 0,
  actividadSinVer: 0,
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

console.log("\n── Recordatorios junta las dos cosas que muestra ──");
{
  /*
   * Una reserva por vencer y un seguimiento de una nota son de origen
   * distinto, pero para quien mira la barra son lo mismo: cosas de hoy sin
   * hacer. Dos números separados obligarían a sumarlos de cabeza.
   */
  es(
    "una reserva urgente y dos seguimientos de hoy suman tres",
    avisosDeLaBarra({
      ...nada,
      reservasUrgentes: [reserva()],
      seguimientos: [seg("hoy"), seg("vencido")],
    }),
    { Recordatorios: 3 },
  );
}

console.log("\n── lo que NO se cuenta ──");
{
  es(
    "lo que vence pronto no enciende nada",
    avisosDeLaBarra({ ...nada, seguimientos: [seg("pronto"), seg("pronto")] }),
    {},
  );
  es(
    "ni lo que está en curso",
    avisosDeLaBarra({ ...nada, seguimientos: [seg("en curso")] }),
    {},
  );

  // Y lo mezclado: de cinco seguimientos, sólo los dos que apremian.
  es(
    "de una lista mezclada, sólo lo vencido y lo de hoy",
    avisosDeLaBarra({
      ...nada,
      seguimientos: [seg("en curso"), seg("vencido"), seg("pronto"), seg("hoy"), seg("pronto")],
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
    "los cuatro módulos, cada uno con lo suyo",
    avisosDeLaBarra({
      mensajesSinLeer: 7,
      reservasUrgentes: [reserva(), reserva()],
      seguimientos: [seg("hoy"), seg("pronto")],
      autorizacionesPendientes: 1,
      actividadSinVer: 12,
    }),
    { Inbox: 7, Recordatorios: 3, Autorizaciones: 1, Notificaciones: 12 },
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
