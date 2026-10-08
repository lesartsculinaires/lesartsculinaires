import { compilar } from "./compilar.mjs";
/**
 * Por qué no se pudo atender una llamada.
 *
 *     node supabase/pruebas/porQueNoSeAtendio.test.mjs
 *
 * ============================================================================
 * EL CASO REAL
 * ============================================================================
 *
 * El 8 de octubre de 2026 a las 9:06 entró una llamada de una clienta. Colgó a
 * los 26 segundos. En la base quedó así:
 *
 *     estado: perdida      atendida_por: NADIE      duracion_seg: null
 *
 * O sea que NADIE la atendió. Y a la asesora que apretó contestar el CRM le
 * dijo «Otra persona atendió esta llamada».
 *
 * El candado para tomar una llamada es un `update ... where estado = 'sonando'
 * and atendida_por is null`. Cuando no toca ninguna fila hay cuatro motivos
 * distintos, y la pantalla mostraba uno solo para todos.
 *
 * ============================================================================
 * POR QUÉ IMPORTA Y NO ES REDACCIÓN
 * ============================================================================
 *
 * Porque cada motivo lleva a hacer una cosa distinta:
 *
 *   la tomó otra persona  →  no hacer nada; ya la están atendiendo.
 *   la persona colgó      →  DEVOLVER LA LLAMADA, que es lo único que queda.
 *
 * Decir el primero cuando pasó el segundo manda a buscar a la compañera que
 * atendió en vez de llamar de vuelta. Esa vez se perdió minuto y medio hasta
 * que alguien se dio cuenta y marcó.
 */
const { avisoDeNoAtendida, convieneDevolverla } = await compilar(
  "src/lib/llamadas/porQueNoSeAtendio.ts",
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── EL CASO QUE SE CONTABA MAL: la persona colgó ──");
{
  const dicho = avisoDeNoAtendida("ya_no_sonaba");

  es("dice que colgó", /colg[óo]/i.test(dicho), true);
  es("Y DICE QUE HAY QUE DEVOLVER LA LLAMADA", /devolv[eé]/i.test(dicho), true);
  /*
   * Lo que no puede decir de ninguna manera: que la atendió alguien. Es la
   * frase exacta que mandó a buscar al lugar equivocado.
   */
  es("Y NO CULPA A NADIE", /otra persona|atendi[óo]/i.test(dicho), false);

  es("y se ofrece devolverla", convieneDevolverla("ya_no_sonaba"), true);
}

console.log("\n── cuando sí la tomó otra persona ──");
{
  es(
    "sin saber quién",
    avisoDeNoAtendida("la_tomo_otro"),
    "Otra persona atendió esta llamada.",
  );
  /*
   * Con el nombre se ahorra la pregunta siguiente, que siempre es «¿quién?».
   */
  es("CON EL NOMBRE, SE DICE", avisoDeNoAtendida("la_tomo_otro", "Katya Villatoro"),
     "Katya Villatoro atendió esta llamada.");
  es("un nombre vacío no rompe nada", avisoDeNoAtendida("la_tomo_otro", ""),
     "Otra persona atendió esta llamada.");

  /*
   * Y acá NO se ofrece devolver la llamada: sería invitar a molestar a un
   * cliente que ya está hablando con alguien del equipo.
   */
  es("NO se ofrece devolverla", convieneDevolverla("la_tomo_otro"), false);
}

console.log("\n── la llamada que ya no está ──");
{
  const dicho = avisoDeNoAtendida("no_existe");
  es("se dice que no está", /ya no est[áa]/i.test(dicho), true);
  es("y tampoco se culpa a nadie", /otra persona/i.test(dicho), false);
  es("también conviene devolverla", convieneDevolverla("no_existe"), true);
}

console.log("\n── sin la migración corrida, un texto neutro ──");
{
  /*
   * Desplegar antes de correr el SQL es lo normal en esta escuela. Durante ese
   * rato la base vieja no manda `porque`, y lo que NO se puede hacer es
   * inventar un motivo: se dice lo que se sabe, que es nada.
   */
  const dicho = avisoDeNoAtendida(null);
  es("no se inventa un motivo", /otra persona|colg[óo]|ya no est[áa]/i.test(dicho), false);
  es("pero se dice que no se pudo", /no se pudo contestar/i.test(dicho), true);
  es("y no se ofrece devolverla a ciegas", convieneDevolverla(null), false);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
