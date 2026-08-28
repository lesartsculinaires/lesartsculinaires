/**
 * Acomodar nombres y proponer tildes: ¿ayuda, o se mete donde no lo llaman?
 *
 *     npx esbuild src/lib/texto.ts --bundle --format=esm --platform=node \
 *       --alias:@=./src --outfile=/tmp/txt.mjs
 *     npx esbuild src/lib/tildes.ts --bundle --format=esm --platform=node \
 *       --alias:@=./src --outfile=/tmp/til.mjs
 *     node supabase/pruebas/nombres.test.mjs /tmp/txt.mjs /tmp/til.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ SE ESTÁ PROBANDO, Y POR QUÉ LA MITAD SON CASOS NEGATIVOS
 * ------------------------------------------------------------------------
 *
 * La escuela pidió «un corrector ortográfico latinoamericano, como sugerencia,
 * para reducir errores de ortografía en nombres y apellidos».
 *
 * Lo fácil de probar es que arregle «JUAN PEREZ». Lo que decide si esto sirve
 * o estorba es lo otro: que NO toque «AST SURF HOTEL», que NO le discuta el
 * apellido a quien lo escribió con tilde, que NO invente tildes en apellidos
 * que no están en la lista.
 *
 * Una sugerencia que se equivoca seguido deja de mirarse. Y cuando deja de
 * mirarse, tampoco se ven las que valían la pena. Por eso los casos negativos
 * son la mayoría de este archivo.
 */
const { acomodarNombre, seAcomoda, revisarNombre, tituloEspanol, sobranEspacios } =
  await import(process.argv[2] ?? "/tmp/txt.mjs");
const { conTildes } = await import(process.argv[3] ?? "/tmp/til.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── el Bloq Mayús y las planillas exportadas ──");
{
  es("todo en mayúsculas se acomoda", acomodarNombre("JUAN PEREZ"), "Juan Perez");
  es("todo en minúsculas también", acomodarNombre("juan perez"), "Juan Perez");
  es(
    "y las partículas quedan en minúscula",
    acomodarNombre("MARIA DE LOS ANGELES DEL VALLE"),
    "Maria de los Angeles del Valle",
  );
  es(
    "pero la primera palabra no, aunque sea partícula",
    acomodarNombre("DE LA CRUZ MENJIVAR"),
    "De la Cruz Menjivar",
  );
  es("después del guion también capitaliza", acomodarNombre("JEAN-PIERRE"), "Jean-Pierre");
  es("y después del apóstrofo", acomodarNombre("D'AUBUISSON"), "D'Aubuisson");
}

console.log("\n── LO QUE NO SE TOCA ──");
{
  /*
   * Un nombre en mixto es una decisión de alguien. Adivinar ahí es meterse
   * donde no llaman, y es como se rompen los nombres que estaban bien.
   */
  es("un nombre ya bien escrito no cambia", acomodarNombre("Juan Pérez"), "Juan Pérez");
  es("«McDonald» se queda como está", acomodarNombre("Ana McDonald"), "Ana McDonald");
  es("«de la O» también", acomodarNombre("Carlos de la O"), "Carlos de la O");
  es(
    "y no se inventan tildes al acomodar",
    acomodarNombre("JOSE PEREZ"),
    "Jose Perez", // acomodar es capitalización; las tildes van aparte y a pedido
  );
}

console.log("\n── los espacios ──");
{
  es("los del borde se van", acomodarNombre("  Juan Pérez  "), "Juan Pérez");
  es("los repetidos del medio también", acomodarNombre("Juan   Pérez"), "Juan Pérez");
  es("y se detectan", sobranEspacios("Juan  Pérez"), true);
  es("sin falsos positivos", sobranEspacios("Juan Pérez"), false);
  es(
    "un nombre en mixto con espacios de más se limpia igual",
    acomodarNombre("Ana  McDonald "),
    "Ana McDonald",
  );
}

console.log("\n── cuándo avisar y cuándo callarse ──");
{
  es("avisa de las mayúsculas", revisarNombre("JUAN PEREZ") != null, true);
  es("avisa de las minúsculas", revisarNombre("juan perez") != null, true);
  es("avisa de los espacios", revisarNombre("Juan  Pérez") != null, true);
  es("y se calla con uno bien escrito", revisarNombre("Juan Pérez"), null);
  es("«seAcomoda» dice lo mismo", seAcomoda("Juan Pérez"), false);
  es("y acá sí", seAcomoda("JUAN PEREZ"), true);
}

console.log("\n── LAS TILDES: sólo las de la lista ──");
{
  es("«Jose Perez» → «José Pérez»", conTildes("Jose Perez"), "José Pérez");
  es("«maria hernandez» por palabra", conTildes("maria hernandez"), "María Hernández");
  es("«MENJIVAR» respeta las mayúsculas", conTildes("MENJIVAR"), "MENJÍVAR");
  es(
    "y no toca lo que ya estaba bien",
    conTildes("José Perez"),
    "José Pérez",
  );
}

console.log("\n── Y LO QUE NO PROPONE, QUE ES LO QUE IMPORTA ──");
{
  /*
   * Éstos son los que hacen que la sugerencia se pueda mirar. Un apellido que
   * no está en la lista no se toca: inventarle una tilde a «Iraheta» o
   * «Alvarenga» sería adivinar sobre el nombre de una persona.
   */
  es("un apellido que no está en la lista", conTildes("Ana Iraheta"), null);
  es("otro", conTildes("Luis Alvarenga"), null);
  es("un nombre inventado", conTildes("Zyrtek Quobbol"), null);
  es("uno ya escrito con tilde no se vuelve a proponer", conTildes("José Pérez"), null);
  es("uno con eñe tampoco", conTildes("Iván Peña"), null);
  es("y un nombre entero sin nada de la lista", conTildes("Ana Bonilla Escobar"), null);
}

console.log("\n── el que se apellida «Perez» de verdad ──");
{
  /*
   * No hay forma de saberlo desde el código, y por eso esto es una pastilla
   * que hay que apretar y no algo que se aplique solo. Lo que sí se puede
   * probar es que la propuesta salga aparte y no pisada sobre el dato: la
   * función DEVUELVE un texto nuevo, no modifica nada.
   */
  const original = "Ana Perez";
  const propuesta = conTildes(original);
  es("la propuesta es otra cadena", propuesta, "Ana Pérez");
  es("y el original queda intacto", original, "Ana Perez");
}

console.log("\n── conviven: acomodar primero, proponer después ──");
{
  // Es el orden en que lo va a ver quien escribe: primero se endereza el
  // Bloq Mayús, y sobre eso se ofrecen las tildes.
  const acomodado = acomodarNombre("  JOSE   MENJIVAR  ");
  es("acomodado", acomodado, "Jose Menjivar");
  es("y con tildes", conTildes(acomodado), "José Menjívar");
}

console.log("\n── `tituloEspanol` sigue haciendo lo suyo ──");
{
  es("no cambió", tituloEspanol("JUAN DE LA CRUZ"), "Juan de la Cruz");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
