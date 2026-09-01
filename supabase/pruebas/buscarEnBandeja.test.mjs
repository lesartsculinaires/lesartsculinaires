/**
 * Buscar un hilo en la bandeja.
 *
 *     npx esbuild src/lib/buscarEnBandeja.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/busq.mjs
 *     node supabase/pruebas/buscarEnBandeja.test.mjs /tmp/busq.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En el módulo de Inbox quiero que haya una barra de búsqueda para buscar un
 * cliente en el inbox, en todos los canales.»
 *
 * ============================================================================
 * LO QUE TIENE QUE SER CIERTO
 * ============================================================================
 *
 *   QUE ENCUENTRE POR EL NOMBRE   En el CRM está «María José Retana
 *   DEL CRM                       Hernández» y su WhatsApp dice «Majo». Quien
 *                                 busca escribe el del CRM, porque es el que
 *                                 tiene a la vista. Si sólo se buscara por el
 *                                 nombre del perfil, el buscador fallaría
 *                                 justo en el caso para el que se pidió.
 *
 *   QUE EL TELÉFONO DÉ IGUAL      «7100-0001», «+503 7100 0001» y «71000001»
 *   CÓMO SE ESCRIBA               son el mismo número.
 *
 *   QUE NO SE TRAIGA MEDIA        Un término de dos dígitos emparejaría con
 *   BANDEJA                       casi cualquier teléfono.
 */
const { coincideHilo, filtrarHilos, hayBusqueda } =
  await import(process.argv[2] ?? "/tmp/busq.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

const hilo = (x = {}) => ({
  telefono: "50371000001",
  nombrePerfil: "Majo",
  clienteId: 7,
  ultimoTexto: "¿Cuánto cuesta el diplomado?",
  ...x,
});

const CRM = { 7: "María José Retana Hernández", 8: "Rodrigo Granados" };
const nombreDe = (id) => (id == null ? null : CRM[id] ?? null);

console.log("── sin nada escrito, pasa todo ──");
{
  es("cadena vacía", coincideHilo(hilo(), ""), true);
  es("sólo espacios", coincideHilo(hilo(), "   "), true);
  es("y no cuenta como búsqueda", hayBusqueda("   "), false);
  es("con texto sí", hayBusqueda("majo"), true);
}

console.log("── por el nombre del perfil ──");
{
  es("entero", coincideHilo(hilo(), "Majo"), true);
  es("un pedazo", coincideHilo(hilo(), "aj"), true);
  es("sin importar mayúsculas", coincideHilo(hilo(), "MAJO"), true);
  es("y algo que no está, no", coincideHilo(hilo(), "Fernanda"), false);
}

console.log("\n── POR EL NOMBRE DEL CRM ──");
{
  /*
   * El caso para el que se pidió. El hilo dice «Majo»; en la ficha está el
   * nombre completo, y es el que se tiene a la vista al buscar.
   */
  es("por el nombre completo", coincideHilo(hilo(), "María José", nombreDe(7)), true);
  es("POR EL APELLIDO, que no está en el perfil", coincideHilo(hilo(), "Retana", nombreDe(7)), true);

  // Sin el nombre del CRM no lo encontraría: por eso se le pasa.
  es("sin ese dato no aparece", coincideHilo(hilo(), "Retana"), false);
}

console.log("\n── SIN IMPORTAR LOS ACENTOS ──");
{
  // Nadie escribe los acentos en un buscador, y media base los tiene.
  es("buscar sin tilde encuentra con tilde", coincideHilo(hilo(), "maria jose", nombreDe(7)), true);
  es("y al revés también", coincideHilo(hilo({ nombrePerfil: "Ramon" }), "Ramón"), true);
}

console.log("\n── EL TELÉFONO, ESCRITO COMO SEA ──");
{
  es("tal cual", coincideHilo(hilo(), "50371000001"), true);
  es("sólo la parte local", coincideHilo(hilo(), "71000001"), true);
  es("con guion", coincideHilo(hilo(), "7100-0001"), true);
  es("con espacios y prefijo", coincideHilo(hilo(), "+503 7100 0001"), true);
  es("y un número que no es, no", coincideHilo(hilo(), "76543210"), false);
}

console.log("\n── un término corto no arrastra media bandeja ──");
{
  /*
   * «71» aparece en casi cualquier teléfono salvadoreño. Con menos de tres
   * dígitos no se busca por número; el texto se sigue mirando igual.
   */
  es("dos dígitos no emparejan por teléfono", coincideHilo(hilo(), "71"), false);
  es("tres sí", coincideHilo(hilo(), "710"), true);
}

console.log("\n── un nombre con números sigue funcionando ──");
{
  // Se prueba como teléfono ADEMÁS de como texto, no en vez de.
  const chef = hilo({ nombrePerfil: "Chef 2000", telefono: "50378889999" });
  es("por el nombre, aunque tenga dígitos", coincideHilo(chef, "Chef 2000"), true);
  es("y por su teléfono también", coincideHilo(chef, "78889999"), true);
}

console.log("\n── por lo último que se dijo ──");
{
  // «¿Dónde estaba el que preguntó por el horario?»
  es("encuentra por el mensaje", coincideHilo(hilo(), "diplomado"), true);
  es("y si no lo dijo, no", coincideHilo(hilo(), "matrícula"), false);
}

console.log("\n── un hilo sin datos no revienta ──");
{
  const pelado = { telefono: "50370000000", nombrePerfil: null, clienteId: null, ultimoTexto: null };
  es("no aparece por texto", coincideHilo(pelado, "algo", nombreDe(null)), false);
  es("pero sí por su número", coincideHilo(pelado, "70000000"), true);
}

console.log("\n── filtrar la lista entera ──");
{
  const lista = [
    hilo({ telefono: "50371000001", nombrePerfil: "Majo", clienteId: 7 }),
    hilo({ telefono: "50372000002", nombrePerfil: "Rodri", clienteId: 8, ultimoTexto: "gracias" }),
    hilo({ telefono: "50373000003", nombrePerfil: "Otra", clienteId: null, ultimoTexto: "hola" }),
  ];

  es("sin búsqueda vuelven todos", filtrarHilos(lista, "", nombreDe).length, 3);
  es(
    "por el apellido del CRM queda uno",
    filtrarHilos(lista, "Granados", nombreDe).map((h) => h.nombrePerfil),
    ["Rodri"],
  );
  es("por algo que no está, ninguno", filtrarHilos(lista, "zzzz", nombreDe).length, 0);

  // No se toca la lista que llegó.
  const copia = [...lista];
  filtrarHilos(lista, "Majo", nombreDe);
  es("la lista original no se modifica", lista, copia);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
