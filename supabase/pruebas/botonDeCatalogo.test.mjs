import { compilar } from "./compilar.mjs";
/**
 * El botón de catálogo: la pieza que tumbó `catalogo_2026`.
 *
 *     node --test supabase/pruebas/botonDeCatalogo.test.mjs
 *
 * ============================================================================
 * ESTO YA PASÓ UNA VEZ
 * ============================================================================
 *
 * El 7 de septiembre de 2026 se mandó `catalogo_2026` a cinco personas y
 * fallaron las cinco con «(#131008) Required parameter is missing». El código se
 * arregló al día siguiente, y hasta hoy no tenía ni una prueba.
 *
 * Es el caso perfecto para equivocarse: un botón que NO lleva dirección, que en
 * la plantilla se ve como si no necesitara nada, y que sin embargo obliga a
 * mandar el SKU de un producto. Quien lea el código sin saber esto va a
 * concluir, razonablemente, que no hay nada que mandar — y lo va a volver a
 * romper.
 *
 * ============================================================================
 * LAS TRES COSAS QUE SE VIGILAN
 * ============================================================================
 *
 *   QUE SE PIDA          La pantalla tiene que pedir el SKU, y decir de dónde
 *                        sale. «Falta un dato» manda a buscarlo al CRM, donde
 *                        no está: sale del catálogo de Meta.
 *
 *   QUE SE FRENE         Con el SKU vacío, el envío NO puede arrancar. Dejarlo
 *                        salir es lo que convirtió un error en cinco.
 *
 *   QUE VAYA BIEN ARMADO Meta no quiere un texto: quiere una «acción» con
 *                        `thumbnail_product_retailer_id`, y en el índice del
 *                        botón dentro de la plantilla, no en el orden en que
 *                        aparezca acá.
 */
const { quePide, loQueFalta, componentesPara, comoSeLee, pedidosDe, repartirValores } =
  await compilar("src/lib/whatsapp/piezas.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** La plantilla real, tal como la devuelve Meta. */
const CATALOGO_2026 = {
  components: [
    { type: "BODY", text: "Hola, buen día, {{order_id}}😊 Te saludamos de Les Arts Culinaires. 🎓" },
    { type: "BUTTONS", buttons: [{ type: "CATALOG", text: "Ver catálogo" }] },
  ],
};

const vacio = { encabezado: [], cuerpo: [], botones: [], archivoEncabezado: null, idEncabezado: null };

console.log("── se reconoce que la plantilla pide un producto ──");
{
  const pide = quePide(CATALOGO_2026, null);
  es("hay un botón", pide.botones.length, 1);
  es("Y ES DE CATÁLOGO", pide.botones[0].clase, "catalogo");
  es("en el índice 0, que es donde está en la plantilla", pide.botones[0].indice, 0);
  es("y el cuerpo pide su variable con nombre", pide.cuerpo.map((h) => h.clave), ["order_id"]);

  const dicho = comoSeLee(pide).join(" · ");
  es("se le dice a la persona que hace falta el código", /c[óo]digo de un producto/i.test(dicho), true);
  es("Y QUE SALE DEL CATÁLOGO DE META", /cat[áa]logo de Meta/i.test(dicho), true);
}

console.log("\n── con el SKU vacío, el envío NO arranca ──");
{
  const pide = quePide(CATALOGO_2026, null);

  for (const [como, botones] of [
    ["sin nada", []],
    ["con la casilla vacía", [""]],
    ["con espacios", ["   "]],
  ]) {
    const falta = loQueFalta(pide, { ...vacio, cuerpo: ["Evelyn"], botones });
    es(`se frena ${como}`, typeof falta === "string" && falta.length > 0, true);
  }

  /*
   * Y el aviso tiene que decir DÓNDE buscarlo. «Falta un dato de los botones»
   * manda a mirar el CRM, y ahí no está: el SKU vive en el catálogo de Meta.
   */
  const falta = loQueFalta(pide, { ...vacio, cuerpo: ["Evelyn"], botones: [""] });
  es("el aviso nombra el SKU", /SKU/.test(falta), true);
  es("dice que sale de Meta Commerce", /Meta Commerce/i.test(falta), true);
  es(
    "Y AVISA QUE SIN CATÁLOGO NO SE PUEDE MANDAR DE NINGÚN MODO",
    /sin cat[áa]logo conectado/i.test(falta),
    true,
  );
}

console.log("\n── con el SKU puesto, pasa ──");
{
  const pide = quePide(CATALOGO_2026, null);
  es(
    "no falta nada",
    loQueFalta(pide, { ...vacio, cuerpo: ["Evelyn"], botones: ["SKU-123"] }),
    null,
  );
}

console.log("\n── y se arma como lo quiere Meta ──");
{
  const pide = quePide(CATALOGO_2026, null);
  const partes = componentesPara(pide, { ...vacio, cuerpo: ["Evelyn"], botones: ["SKU-123"] });

  const boton = partes.find((p) => p.type === "button");
  es("hay un componente de botón", Boolean(boton), true);
  es("DE SUBTIPO catalog, no url", boton.sub_type, "catalog");
  es("en el índice del botón", boton.index, "0");
  /*
   * Lo que de verdad rechazaba Meta: mandarlo como texto. Quiere una acción.
   */
  es("el parámetro es una ACCIÓN", boton.parameters[0].type, "action");
  es(
    "con el SKU adentro",
    boton.parameters[0].action.thumbnail_product_retailer_id,
    "SKU-123",
  );

  // Y el cuerpo sigue yendo con su nombre, que es la otra mitad de esta plantilla.
  const cuerpo = partes.find((p) => p.type === "body");
  es("el cuerpo va con parameter_name", cuerpo.parameters[0].parameter_name, "order_id");
  es("y con el valor", cuerpo.parameters[0].text, "Evelyn");
}

console.log("\n── el índice es el de la plantilla, no el del orden acá ──");
{
  /*
   * Una plantilla con tres botones donde el de catálogo es el ÚLTIMO, y el
   * primero es de respuesta rápida —que no lleva nada y no se pide—.
   *
   * Si el índice saliera de la posición en la lista de pedidos, el SKU se iría
   * al botón 0 y Meta lo rechazaría. Es el error que no se ve con un solo
   * botón, que es como está `catalogo_2026`.
   */
  const conTres = {
    components: [
      { type: "BODY", text: "Hola" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "No gracias" },
          { type: "URL", text: "Ver sitio", url: "https://lesarts.com/{{1}}" },
          { type: "CATALOG", text: "Ver catálogo" },
        ],
      },
    ],
  };

  const pide = quePide(conTres, null);
  es("se piden dos botones, no tres", pide.botones.length, 2);
  es("el de respuesta rápida no se pide", pide.botones.some((b) => b.clase === "quick_reply"), false);

  const partes = componentesPara(pide, { ...vacio, botones: ["promos", "SKU-9"] });
  const url = partes.find((p) => p.sub_type === "url");
  const cat = partes.find((p) => p.sub_type === "catalog");

  es("el de dirección va en el índice 1", url.index, "1");
  es("Y EL DE CATÁLOGO EN EL 2, no en el 0", cat.index, "2");
  es("cada uno con lo suyo", cat.parameters[0].action.thumbnail_product_retailer_id, "SKU-9");
}

console.log("\n── las casillas que ve quien manda ──");
{
  const pide = quePide(CATALOGO_2026, null);
  const casillas = pedidosDe(pide);
  es("hay dos: el nombre y el producto", casillas.length, 2);
  /*
   * El orden importa: `repartirValores` deshace la lista plana por posición, y
   * si la pantalla la arma en otro orden el SKU termina en el cuerpo.
   */
  const planos = ["Evelyn", "SKU-123"];
  const repartido = repartirValores(pide, planos);
  es("el primero es el del cuerpo", repartido.cuerpo, ["Evelyn"]);
  es("Y EL SEGUNDO EL DEL BOTÓN", repartido.botones, ["SKU-123"]);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
