/**
 * Las reglas de un envío masivo: a quién NO se le manda.
 *
 *     npx esbuild src/lib/envios.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/envios.mjs
 *     node supabase/pruebas/envios.test.mjs /tmp/envios.mjs
 *
 * ============================================================================
 * POR QUÉ ESTO SE PRUEBA APARTE, Y CON CUIDADO
 * ============================================================================
 *
 * Porque equivocarse acá no da un error: da un mensaje enviado a alguien que
 * pidió que no le escriban, o el mismo mensaje tres veces a la misma persona.
 * Y eso no se deshace. Meta le pone a cada número una calificación de calidad
 * que baja cuando la gente bloquea o reporta, y lo que más hace que alguien
 * bloquee es recibir dos veces lo mismo.
 *
 * La escuela lo pidió con esas palabras: «que no vaya a generar algún
 * conflicto con Meta como bloquear la cuenta o que no se puedan enviar los
 * mensajes».
 */
const { repartir, paraMeta, nombreDePila, valoresPara, telefonoUtil, cuantosQuedan } =
  await import(process.argv[2] ?? "/tmp/envios.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** Alguien seleccionado en la pantalla de Clientes. */
const quien = (clienteId, extra = {}) => ({
  clienteId,
  oportunidadId: clienteId * 10,
  nombre: `Persona ${clienteId}`,
  telefono: `7100000${clienteId}`,
  noMolestar: false,
  ...extra,
});

/** Los ids a los que se les va a mandar, para poder compararlos de un vistazo. */
const van = (r) => r.van.map((c) => c.clienteId);
/** Por qué quedó afuera cada uno. */
const fuera = (r) => r.fuera.map((x) => [x.candidato.clienteId, x.porque]);

console.log("── lo normal ──");
{
  const r = repartir([quien(1), quien(2), quien(3)]);
  es("les llega a los tres", van(r), [1, 2, 3]);
  es("y no queda nadie afuera", fuera(r), []);
}

console.log("\n── QUIEN PIDIÓ QUE NO LE ESCRIBAN ──");
{
  /*
   * La regla que protege la cuenta. Alguien que pidió la baja y vuelve a
   * recibir un envío reporta el número, y eso pesa más que cualquier otra
   * cosa en la calificación que Meta le pone.
   */
  const r = repartir([quien(1), quien(2, { noMolestar: true }), quien(3)]);
  es("NO ENTRA, aunque esté seleccionado", van(r), [1, 3]);
  es("y se dice por qué", fuera(r), [[2, "no_molestar"]]);
}

console.log("\n── se mira antes que todo lo demás ──");
{
  /*
   * Alguien que pidió la baja Y no tiene teléfono tiene que salir como «pidió
   * que no le escriban». Si saliera como «sin teléfono», cargarle el número
   * mañana lo volvería a meter en la lista sin que nadie se entere.
   */
  const r = repartir([quien(1, { noMolestar: true, telefono: null })]);
  es("gana el «no molestar»", fuera(r), [[1, "no_molestar"]]);
}

console.log("\n── la misma persona con varios leads ──");
{
  /*
   * Es lo normal al seleccionar en Clientes: la pantalla lista oportunidades,
   * y una persona que preguntó por tres programas aparece tres veces.
   * Mandarle tres veces el mismo mensaje es la mejor forma de que bloquee.
   */
  const r = repartir([quien(7), quien(7), quien(7), quien(8)]);
  es("LE LLEGA UNA SOLA VEZ", van(r), [7, 8]);
  es("las otras dos se descartan", fuera(r), [[7, "repetido"], [7, "repetido"]]);
}

console.log("\n── sin teléfono no hay a dónde mandar ──");
{
  const r = repartir([
    quien(1, { telefono: null }),
    quien(2, { telefono: "" }),
    quien(3, { telefono: "123" }), // una celda a medio llenar
    quien(4),
  ]);
  es("sólo entra el que tiene uno de verdad", van(r), [4]);
  es(
    "y los tres salen por lo mismo",
    fuera(r).map(([, p]) => p),
    ["sin_telefono", "sin_telefono", "sin_telefono"],
  );
}

console.log("\n── a quien ya le mandamos hace poco ──");
{
  const r = repartir([quien(1), quien(2), quien(3)], new Set([2]));
  es("se lo saltea", van(r), [1, 3]);
  es("diciendo que fue reciente", fuera(r), [[2, "reciente"]]);
}

console.log("\n── el teléfono, como lo quiere Meta ──");
{
  /*
   * En la base están escritos de todas las formas y Meta acepta una sola. Un
   * número mal formado no da un error claro: Meta contesta que ese contacto no
   * existe, y con trescientos así la calificación del número se desploma.
   */
  es("ocho dígitos son de El Salvador", paraMeta("7797-2598"), "50377972598");
  es("con espacios igual", paraMeta("7797 2598"), "50377972598");
  es("el que ya trae código se deja", paraMeta("+503 7797 2598"), "50377972598");
  es("y el que vino del webhook también", paraMeta("50377972598"), "50377972598");
  es("los ceros de marcar internacional se van", paraMeta("00 503 7797 2598"), "50377972598");
  es("un número de otro país no se toca", paraMeta("+1 305 555 0134"), "13055550134");

  es("ocho dígitos sirven", telefonoUtil("7797-2598"), true);
  es("siete no", telefonoUtil("797-2598"), false);
  es("y nada tampoco", telefonoUtil(null), false);
}

console.log("\n── el nombre de pila ──");
{
  /*
   * «Marco Tulio Castellanos Orellana» saludado entero suena a carta del
   * banco. Y las bases vienen en mayúsculas: «MARCO» gritando al principio de
   * un mensaje es lo primero que ve quien lo recibe.
   */
  es("sólo el primero", nombreDePila("Marco Tulio Castellanos Orellana"), "Marco");
  es("y se le acomoda el caso", nombreDePila("MARCO TULIO CASTELLANOS"), "Marco");
  es("con espacios de más", nombreDePila("   ana   lucia  "), "Ana");
  es("sin nombre no revienta", nombreDePila(null), "");
}

console.log("\n── los huecos de la plantilla ──");
{
  const valores = [{ de: "nombre" }, { de: "texto", texto: "Cocina Internacional" }];
  es(
    "el primero es de cada quien, el segundo es igual para todos",
    valoresPara(valores, "EVELYN DE LEON"),
    ["Evelyn", "Cocina Internacional"],
  );
  es(
    "y a otra persona le cambia sólo el suyo",
    valoresPara(valores, "jose rodriguez"),
    ["Jose", "Cocina Internacional"],
  );
}

console.log("\n── el tope diario ──");
{
  /*
   * Meta le pone a cada número un tope de destinatarios únicos cada 24 horas.
   * Pasarse no da un error claro: los mensajes empiezan a fallar. Se deja un
   * margen para lo que salga por el chat normal, que también cuenta.
   */
  es("de mil, con nada mandado", cuantosQuedan(1000, 0), 900);
  es("descontando lo de hoy", cuantosQuedan(1000, 300), 600);
  es("NUNCA NEGATIVO", cuantosQuedan(1000, 5000), 0);
  es("en el nivel de diez mil", cuantosQuedan(10000, 1000), 8000);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
