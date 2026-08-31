/**
 * El buscador de emojis: ¿encuentra lo que una asesora escribiría?
 *
 *     npx esbuild src/lib/emojis.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/emojis.mjs
 *     node supabase/pruebas/emojis.test.mjs /tmp/emojis.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE PRUEBA ACÁ
 * ------------------------------------------------------------------------
 *
 * Que el buscador sirva escribiendo en castellano de El Salvador. Un selector
 * de emojis con 300 caritas y un buscador que no encuentra nada es peor que no
 * tenerlo: se recorre a mano igual, pero además con la sensación de que está
 * roto.
 *
 * Y que la lista esté sana: sin emojis repetidos —dos iguales en la rejilla se
 * ven como un error— y sin claves de React duplicadas, que es lo mismo visto
 * desde el otro lado.
 */
const { GRUPOS, TODOS, buscar } = await import(process.argv[2] ?? "/tmp/emojis.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** El primer resultado, que es el que la vista mira. */
const primero = (q) => buscar(q)[0]?.e ?? null;
/** ¿Aparece en algún lugar de los resultados? */
const hay = (q, e) => buscar(q).some((x) => x.e === e);

console.log("── lo que se escribe de verdad ──");
{
  // Una escuela de cocina manda pasteles todo el día.
  es("pastel", primero("pastel"), "🎂");
  es("gracias", primero("gracias"), "🙏");
  es("fuego", hay("fuego", "🔥"), true);
  es("chef", hay("chef", "🧑‍🍳"), true);
  es("felicidades", hay("felicidades", "🎉"), true);
  es("dinero", hay("dinero", "🤑"), true);
  es("pago", hay("pago", "💵"), true);
  es("diploma", hay("diploma", "🎓"), true);
}

console.log("\n── sin tildes y sin mayúsculas ──");
{
  // Nadie escribe «café» con tilde en un buscador.
  es("cafe encuentra ☕", hay("cafe", "☕"), true);
  es("CAFÉ también", hay("CAFÉ", "☕"), true);
  es("  Piña  con espacios", hay("  Piña  ", "🍍"), true);
  // La eñe se pela igual: «piña» y «pina» son la misma búsqueda.
  es("pina sin eñe", hay("pina", "🍍"), true);
}

console.log("\n── se busca por prefijo, no por trozo suelto ──");
{
  /*
   * Escribiendo «pan» se quiere pan. Si el buscador mirara cualquier trozo
   * adentro de la palabra, «pan» traería también «panqueques» —bien— pero
   * además todo lo que lleve esas letras en el medio, y la rejilla se llenaría
   * de cosas que no tienen nada que ver.
   */
  es("pan trae el pan", hay("pan", "🍞"), true);
  es("y los panqueques", hay("pan", "🥞"), true);
  const conPan = buscar("pan").length;
  es("pero no medio abecedario", conPan < 12, true);
}

console.log("\n── los que empiezan igual van primero ──");
{
  /*
   * «cora» tiene que traer el corazón rojo antes que cualquier otro, porque es
   * el que se manda. Los demás corazones existen pero van detrás.
   */
  es("cora → corazón rojo primero", primero("cora"), "❤️");
  es("y los otros siguen ahí", hay("cora", "💙"), true);
}

console.log("\n── lo que no se busca ──");
{
  es("vacío no devuelve nada", buscar("").length, 0);
  es("sólo espacios tampoco", buscar("   ").length, 0);
  es("una palabra que no existe", buscar("xilofono").length, 0);
}

console.log("\n── la lista está sana ──");
{
  const vistos = new Map();
  for (const em of TODOS) vistos.set(em.e, (vistos.get(em.e) ?? 0) + 1);
  const repetidos = [...vistos.entries()].filter(([, n]) => n > 1).map(([e]) => e);

  // Un emoji dos veces se ve como un error en la rejilla, y además React
  // usa el carácter como clave: dos iguales son dos claves iguales.
  es("ningún emoji repetido", repetidos, []);

  es("todos tienen nombre", TODOS.every((x) => x.nombre.trim().length > 0), true);
  es("hay grupos", GRUPOS.length >= 4, true);
  es("y cada grupo tiene su ícono", GRUPOS.every((g) => g.icono.length > 0), true);

  // Corto a propósito: la lista existe para no tener que recorrer 3.700.
  es("la lista sigue siendo corta", TODOS.length < 400, true);
  es("pero no vacía", TODOS.length > 200, true);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
