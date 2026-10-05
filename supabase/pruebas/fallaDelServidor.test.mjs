/**
 * Lo que se le dice a alguien cuando una llamada al servidor no contesta.
 *
 *     node --experimental-strip-types supabase/pruebas/fallaDelServidor.test.mjs
 *
 * Esto nació de una pantalla real del equipo de ventas:
 *
 *     No se pudo guardar el último cambio: An unexpected response was received
 *     from the server.. Lo que ves sigue actualizado, pero todavía no está
 *     guardado.
 *
 * En inglés, con dos puntos seguidos, y sin decir qué hacer. Lo que había
 * pasado era de lo más inocente —la pestaña estaba abierta desde antes del
 * último despliegue— y lo que se leía era que algo se había perdido.
 *
 * Lo que se vigila acá es sobre todo lo que NO tiene que pasar: que a un error
 * que no se reconoce se le invente una explicación. Decirle a alguien
 * «recargá» cuando recargar no arregla nada lo manda a buscar el problema donde
 * no está, y encima le hace perder lo que tenía en pantalla.
 */
import { porQueFalloElServidor } from "../../src/lib/crm/fallaDelServidor.ts";

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── la frase que vio ventas ──");
{
  const r = porQueFalloElServidor(
    new Error("An unexpected response was received from the server."),
  );
  es("SE OFRECE RECARGAR, que es lo que lo arregla", r.recargar, true);
  es("y ya no queda nada en inglés", /unexpected response/i.test(r.dice), false);
  es(
    "dice que no se perdió nada, que es la pregunta de quien lo lee",
    /no se perdió nada/i.test(r.dice),
    true,
  );
}

console.log("\n── las otras dos caras de lo mismo ──");
{
  /*
   * Next tiene varias frases para la misma situación según por dónde falle.
   * Las tres quieren decir «esta pestaña y este servidor ya no se entienden».
   */
  es(
    "«Failed to find Server Action» también",
    porQueFalloElServidor(new Error("Failed to find Server Action \"abc\"")).recargar,
    true,
  );
  es(
    "y «Connection closed» también",
    porQueFalloElServidor(new Error("Connection closed.")).recargar,
    true,
  );
}

console.log("\n── un corte de conexión NO se arregla recargando ──");
{
  /*
   * Es la distinción que hace que el botón sirva. Con la conexión caída,
   * recargar deja a la persona en una pantalla en blanco y le borra lo que
   * tenía escrito; lo que corresponde es esperar y reintentar.
   */
  const r = porQueFalloElServidor(new TypeError("Failed to fetch"));
  es("NO se ofrece recargar", r.recargar, false);
  es("y se dice que reintente", /volvé a intentar/i.test(r.dice), true);
}

console.log("\n── lo que no se reconoce se muestra tal cual ──");
{
  /*
   * Inventarle una traducción a un error que no se entendió es peor que el
   * error: manda a buscar el problema donde no está.
   */
  const r = porQueFalloElServidor(new Error("violates check constraint «etapa»"));
  es("se devuelve igual", r.dice, "violates check constraint «etapa»");
  es("y no se ofrece recargar", r.recargar, false);
}

console.log("\n── y nunca revienta ──");
{
  es("con null", porQueFalloElServidor(null).recargar, false);
  es("con un texto suelto", porQueFalloElServidor("cualquier cosa").dice, "cualquier cosa");
  es("con undefined", porQueFalloElServidor(undefined).dice, "");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
