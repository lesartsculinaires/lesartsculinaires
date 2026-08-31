/**
 * Los huecos de una plantilla: `{{1}}` y `{{order_id}}`.
 *
 *     npx esbuild src/lib/whatsapp/huecos.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/huecos.mjs
 *     node supabase/pruebas/huecos.test.mjs /tmp/huecos.mjs
 *
 * ------------------------------------------------------------------------
 * EL CASO REAL QUE ROMPIÓ ESTO
 * ------------------------------------------------------------------------
 *
 * La escuela no podía mandar NINGUNA plantilla. Su plantilla dice:
 *
 *     ¡Hola! Hola, buen día, {{order_id}}
 *
 * y todo el CRM buscaba huecos con `{{\d+}}` —sólo dígitos—. Así que contaba
 * cero huecos, no dibujaba ninguna casilla, mostraba «{{order_id}}» en crudo
 * en la vista previa, y mandaba el template sin parámetros. Meta lo rechazaba
 * porque la plantilla declara uno.
 *
 * No era el token ni la aprobación: era que el CRM no sabía leer esa forma de
 * escribir un hueco. La primera prueba de abajo es esa plantilla, textual.
 *
 * ------------------------------------------------------------------------
 * Y LO QUE NO PUEDE ROMPERSE AL ARREGLARLO
 * ------------------------------------------------------------------------
 *
 * Las plantillas posicionales que ya andaban. Meta no deja mezclar los dos
 * formatos en una misma plantilla, y manda el JSON distinto según cuál sea:
 * poner `parameter_name` en una posicional también hace fallar el envío. Por
 * eso la mitad de este archivo prueba que las viejas sigan saliendo igual.
 */
const { huecosDe, cuantosHuecos, conNombres, conValores, componentesDe } = await import(
  process.argv[2] ?? "/tmp/huecos.mjs"
);

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

// La plantilla de la escuela, tal cual está cargada.
const DE_LA_ESCUELA = `¡Hola! Hola, buen día, {{order_id}}

Te saluda Katya Villatoro de *Les Arts Culinaires.* 👋

Nos alegra que estés interesado en el [Diplomado de interés].

Con mucho gusto en estos momentos te brindamos mayor información.`;

console.log("── LA PLANTILLA QUE NO SE PODÍA MANDAR ──");
{
  es("ahora se le ve el hueco", cuantosHuecos(DE_LA_ESCUELA), 1);
  es("y es con nombre", conNombres(DE_LA_ESCUELA), true);
  es("la clave es la que espera Meta", huecosDe(DE_LA_ESCUELA)[0].clave, "order_id");

  /*
   * Y el JSON del envío, que es lo que estaba mal.
   *
   * Sin `parameter_name`, Meta rechaza el envío de una plantilla con nombres:
   * no sabe a qué hueco corresponde el valor.
   */
  es(
    "EL ENVÍO LLEVA parameter_name",
    componentesDe(DE_LA_ESCUELA, ["Evelyn"]),
    [
      {
        type: "body",
        parameters: [{ type: "text", parameter_name: "order_id", text: "Evelyn" }],
      },
    ],
  );

  es(
    "y la vista previa muestra el nombre puesto",
    conValores(DE_LA_ESCUELA, ["Evelyn"]).split("\n")[0],
    "¡Hola! Hola, buen día, Evelyn",
  );
}

console.log("\n── las posicionales, que ya andaban, siguen igual ──");
{
  const vieja = "Hola {{1}}, tu clase de {{2}} empieza el {{3}}.";
  es("tres huecos", cuantosHuecos(vieja), 3);
  es("y no son con nombre", conNombres(vieja), false);
  es(
    "SIN parameter_name",
    componentesDe(vieja, ["Ana", "Cocina", "lunes"]),
    [
      {
        type: "body",
        parameters: [
          { type: "text", text: "Ana" },
          { type: "text", text: "Cocina" },
          { type: "text", text: "lunes" },
        ],
      },
    ],
  );
  es(
    "y se rellenan",
    conValores(vieja, ["Ana", "Cocina", "lunes"]),
    "Hola Ana, tu clase de Cocina empieza el lunes.",
  );
}

console.log("\n── el orden, que es donde se cambia un dato por otro ──");
{
  // Una plantilla puede nombrar {{2}} antes que {{1}}. Mandar los valores en
  // orden de aparición pondría el programa donde va el nombre, y el cliente
  // recibiría un mensaje absurdo sin que nadie se entere.
  const alReves = "Tu clase de {{2}} es para vos, {{1}}.";
  es("se ordenan por número", huecosDe(alReves).map((h) => h.clave), ["1", "2"]);
  es(
    "y el valor cae donde va",
    conValores(alReves, ["Ana", "Cocina"]),
    "Tu clase de Cocina es para vos, Ana.",
  );
}

console.log("\n── un hueco repetido es un solo dato ──");
{
  // `{{1}}` dos veces sigue siendo un dato. Pedirlo dos veces mandaría un
  // parámetro de más y Meta rechaza por la cuenta.
  es("se cuenta una vez", cuantosHuecos("Hola {{1}}, ¿todo bien {{1}}?"), 1);
  es(
    "y se rellena en los dos lugares",
    conValores("Hola {{1}}, ¿todo bien {{1}}?", ["Ana"]),
    "Hola Ana, ¿todo bien Ana?",
  );
  es("con nombres también", cuantosHuecos("{{nombre}} y {{nombre}}"), 1);
}

console.log("\n── lo que no tiene huecos ──");
{
  es("una plantilla fija", cuantosHuecos("Gracias por escribirnos."), 0);
  es(
    "NO LLEVA components",
    componentesDe("Gracias por escribirnos.", []),
    undefined, // mandarlo vacío hace que Meta la rechace
  );
  es("un cuerpo nulo", cuantosHuecos(null), 0);
  es("y no revienta al rellenarlo", conValores(null, []), "");
}

console.log("\n── los huecos sin llenar se ven ──");
{
  // Se deja el `{{…}}` a la vista en vez de un agujero: así se nota cuál falta.
  es(
    "queda marcado",
    conValores("Hola {{1}}, sos de {{2}}.", ["Ana"]),
    "Hola Ana, sos de {{2}}.",
  );
  es(
    "y con espacios adentro de las llaves también",
    conValores("Hola {{ 1 }}.", ["Ana"]),
    "Hola Ana.",
  );
}

console.log("\n── nombres como los escribe la gente ──");
{
  es("con guion bajo", huecosDe("{{nombre_cliente}}")[0].clave, "nombre_cliente");
  es("con mayúsculas", huecosDe("{{NombreCliente}}")[0].clave, "NombreCliente");
  es("con guion", huecosDe("{{nombre-cliente}}")[0].clave, "nombre-cliente");
  es(
    "y la etiqueta se lee",
    huecosDe("{{nombre_cliente}}")[0].etiqueta,
    "nombre cliente (va donde dice {{nombre_cliente}})",
  );
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
