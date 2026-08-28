/**
 * Las columnas que no tienen dónde caer, ¿llegan a la bitácora del lead?
 *
 *     npx esbuild src/lib/importar.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/imp.mjs
 *     node supabase/pruebas/notasDeLaBase.test.mjs /tmp/imp.mjs
 *
 * ------------------------------------------------------------------------
 * QUÉ PEDÍA LA ESCUELA
 * ------------------------------------------------------------------------
 *
 * «Cuando se suba una base de datos hay ciertas columnas que tienen
 * información, esa información pasa a las notas.»
 *
 * Las planillas que manda la escuela traen columnas que el CRM no tiene dónde
 * guardar: «horario que le queda», «de qué feria vino», «qué preguntó». Hasta
 * ahora la única opción del importador era «no importar», o sea tirarlas — y
 * es justo el dato que el asesor necesita en la primera llamada.
 *
 * ------------------------------------------------------------------------
 * DÓNDE SE ROMPE ESTO
 * ------------------------------------------------------------------------
 *
 * En que la nota quede sin decir de dónde salió. «Sábados» solo, sin el
 * encabezado adelante, no significa nada seis meses después. Por eso cada
 * pedazo lleva su columna, y por eso una sola columna no alcanza como prueba:
 * lo que hay que comprobar es que varias se junten bien y que las vacías no
 * dejen renglones huecos.
 */
const { construirFilas, detectarMapeo, A_NOTA } = await import(
  process.argv[2] ?? "/tmp/imp.mjs"
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const CATALOGO = {
  productos: [],
  vendedores: [],
  etapas: [],
  estados: [],
  canales: [],
  territorios: [],
};

const armar = (matriz, mapeo) =>
  construirFilas({
    matriz,
    mapeo: mapeo ?? detectarMapeo(matriz[0]),
    catalogo: CATALOGO,
    existentes: [],
    fechaPorDefecto: "2026-08-27",
  });

console.log("── se reconocen solas ──");
{
  const m = detectarMapeo(["Nombre", "Teléfono", "Observaciones", "Comentario del asesor"]);
  es("«Observaciones» va a la bitácora", m[2], A_NOTA);
  es("«Comentario del asesor» también, por la palabra", m[3], A_NOTA);
  es("y el nombre sigue siendo el nombre", m[0], "nombre");
  es("y el teléfono, el teléfono", m[1], "telefono");
}

console.log("\n── un campo de verdad siempre le gana ──");
{
  /*
   * «Nota de crédito» y «Descuento o promoción» conviven en las planillas de
   * facturación. Si la palabra «nota» ganara, el descuento terminaría de texto
   * suelto en la bitácora y la columna de dinero quedaría vacía.
   */
  const m = detectarMapeo(["Nombre", "Descuento", "Notas"]);
  es("«Descuento» es el campo, no una nota", m[1], "descuento");
  es("«Notas» sí es nota", m[2], A_NOTA);
}

console.log("\n── pero tampoco se adivina de más ──");
{
  /*
   * «Horario de interés» decía «interés» y se iba al Programa, así que
   * «Sábados por la mañana» terminaba buscándose en el catálogo de
   * diplomados, no lo encontraba, y la columna se perdía con un aviso que
   * nadie leía. Es el mismo error que «Nombre del curso» yendo al nombre del
   * cliente, que ya estaba atajado.
   *
   * Sin asignar es la respuesta correcta: la pantalla la muestra y quien sube
   * el archivo decide —casi siempre, mandarla a las notas—.
   */
  es("«Horario de interés» no es el programa", detectarMapeo(["Horario de interés"])[0], "");
  es(
    "y «Programa de interés» sigue siéndolo",
    detectarMapeo(["Programa de interés"])[0],
    "producto",
  );
  es("igual que «Diplomado»", detectarMapeo(["Diplomado"])[0], "producto");
}

console.log("\n── varias columnas en una sola nota ──");
{
  const filas = armar([
    ["Nombre", "Horario de interés", "Cómo nos encontró", "Qué preguntó"],
    ["Ana Rivas", "Sábados por la mañana", "Feria de Antiguo Cuscatlán", "Si hay cupo en enero"],
  ], { 0: "nombre", 1: A_NOTA, 2: A_NOTA, 3: A_NOTA });

  es(
    "las tres, cada una con su encabezado",
    filas[0].nota,
    "Horario de interés: Sábados por la mañana\n" +
      "Cómo nos encontró: Feria de Antiguo Cuscatlán\n" +
      "Qué preguntó: Si hay cupo en enero",
  );
}

console.log("\n── las columnas vacías no dejan renglones huecos ──");
{
  const filas = armar([
    ["Nombre", "Horario", "Feria", "Consulta"],
    ["Beto Cruz", "", "Feria del libro", "   "],
  ], { 0: "nombre", 1: A_NOTA, 2: A_NOTA, 3: A_NOTA });

  es("sólo la que traía algo", filas[0].nota, "Feria: Feria del libro");
}

console.log("\n── una fila sin nada en esas columnas no deja nota ──");
{
  const filas = armar([
    ["Nombre", "Horario"],
    ["Carla Díaz", ""],
  ], { 0: "nombre", 1: A_NOTA });

  // Importa que sea nulo y no la cadena vacía: la ficha mostraría una nota en
  // blanco, con su fecha y su autor, que no dice nada y ensucia la bitácora.
  es("nula, no vacía", filas[0].nota, null);
}

console.log("\n── y sin columnas de nota, nada cambia ──");
{
  const filas = armar([
    ["Nombre", "Teléfono"],
    ["Dani Mejía", "7797-2598"],
  ]);
  es("no hay nota", filas[0].nota, null);
  es("y la fila entra igual", filas[0].nombre, "Dani Mejía");
}

console.log("\n── la base de cumpleaños ──");
{
  /*
   * El otro pedido: «un campo de fecha para los cumpleaños, para que cuando
   * suban una base de datos de cumpleaños se pueda leer en todas las fichas».
   * Sin columna que lo reciba, esa base no se podía subir.
   */
  const m = detectarMapeo(["Nombre completo", "Fecha de nacimiento"]);
  es("«Fecha de nacimiento» se reconoce", m[1], "fecha_nacimiento");

  const otro = detectarMapeo(["Cliente", "Cumpleaños"]);
  es("«Cumpleaños» también", otro[1], "fecha_nacimiento");

  const filas = armar([
    ["Cliente", "Cumpleaños"],
    ["Elena Portillo", "14/03/1998"],
  ]);
  es("y se lee día/mes, como el resto del CRM", filas[0].fecha_nacimiento, "1998-03-14");
}

console.log("\n── la fecha de registro no se confunde con la de nacimiento ──");
{
  const m = detectarMapeo(["Nombre", "Fecha", "Fecha de nacimiento"]);
  es("«Fecha» sigue siendo la de registro", m[1], "fecha_registro");
  es("y la otra, la de nacimiento", m[2], "fecha_nacimiento");
}

console.log("\n── una edad imposible no entra ──");
{
  /*
   * Un año de nacimiento en la casilla de la edad es el error más común de
   * estas planillas. La base lo rechaza —hay una restricción— y el rechazo
   * llegaría a mitad de un archivo de trescientas filas, dejando media base
   * cargada. Se ataja acá: la fila entra, el dato no.
   */
  const filas = armar([
    ["Nombre", "Edad"],
    ["Fabio León", "1998"],
    ["Gaby Ruiz", "16"],
  ]);
  es("«1998» no es una edad", filas[0].edad, null);
  es("y se avisa", filas[0].avisos.some((a) => a.includes("Edad")), true);
  es("«16» sí", filas[1].edad, 16);
}

console.log("\n── el país ──");
{
  const filas = armar([
    ["Nombre", "País"],
    ["Hugo Salas", "Guatemala"],
  ]);
  es("se lee", filas[0].pais, "Guatemala");
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
