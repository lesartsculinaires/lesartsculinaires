/**
 * Un formulario donde se pueden marcar VARIOS programas.
 *
 *     npx esbuild src/lib/formularios.ts --bundle --format=esm \
 *       --platform=node --alias:@=./src --outfile=/tmp/form.mjs
 *     node supabase/pruebas/formularioVariosProgramas.test.mjs /tmp/form.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En la opción de formulario, específicamente donde aparecen los tipos de
 * diplomados, quiero poder seleccionar varios como opción múltiple si está
 * interesado en varios.»
 *
 * ============================================================================
 * QUÉ ESTABA PASANDO
 * ============================================================================
 *
 * El constructor de formularios ya tenía el tipo «Elegir varias», así que la
 * pregunta se podía armar. Lo que no funcionaba era lo de después: al
 * convertir lo contestado en un lead, se hacía `cruda[0]` y se guardaba la
 * PRIMERA marca. Las demás se perdían sin ningún aviso.
 *
 * O sea que en la feria alguien decía «me interesan Pastelería y Barismo», lo
 * marcaba, y entraba al CRM como si sólo hubiera preguntado por Pastelería.
 */
const { armarLead } = await import(process.argv[2] ?? "/tmp/form.mjs");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

/** La pregunta de la captura: el área de interés, enlazada al catálogo. */
const PROGRAMAS = {
  id: "p1",
  etiqueta: "¿Cuál es tu área de interés principal?",
  tipo: "opciones",
  requerido: false,
  mapeaA: "producto_id",
  opciones: [
    { texto: "Cocina Internacional", valor: 1 },
    { texto: "Pastelería Internacional", valor: 2 },
    { texto: "Barismo y Extracción de Café", valor: 3 },
    { texto: "Mixología", valor: 4 },
    { texto: "Management Gastronómico", valor: 5 },
    { texto: "Suprême Diplôme", valor: 6 },
  ],
};

const NOMBRE = {
  id: "p0", etiqueta: "Nombre", tipo: "texto", requerido: false,
  mapeaA: "nombre", opciones: [],
};

const CAMPOS = [NOMBRE, PROGRAMAS];

console.log("── MARCAR VARIOS LOS GUARDA A TODOS ──");
{
  const lead = armarLead(CAMPOS, {
    p0: "Ana Prueba",
    p1: ["Pastelería Internacional", "Barismo y Extracción de Café"],
  });

  es("el nombre entra", lead.nombre, "Ana Prueba");
  // El primero es el que lleva la plata del trato.
  es("el primero es el principal", lead.producto_id, 2);
  es("Y LOS DOS QUEDAN ANOTADOS", lead.programas_interes, [2, 3]);
}

console.log("\n── marcar tres, tres ──");
{
  const lead = armarLead(CAMPOS, {
    p1: ["Cocina Internacional", "Mixología", "Suprême Diplôme"],
  });
  es("el principal es el primero", lead.producto_id, 1);
  es("y están los tres", lead.programas_interes, [1, 4, 6]);
}

console.log("\n── marcar uno solo sigue funcionando igual ──");
{
  /*
   * El caso de siempre, y el que no se puede romper: la mayoría de los
   * formularios preguntan por uno.
   */
  const lead = armarLead(CAMPOS, { p1: ["Mixología"] });
  es("el programa entra", lead.producto_id, 4);
  es("y la lista lo tiene", lead.programas_interes, [4]);
}

console.log("\n── una pregunta de una sola opción, igual que antes ──");
{
  const unaSola = { ...PROGRAMAS, tipo: "opcion" };
  const lead = armarLead([NOMBRE, unaSola], { p1: "Barismo y Extracción de Café" });
  es("entra el programa", lead.producto_id, 3);
  es("y queda anotado", lead.programas_interes, [3]);
}

console.log("\n── sin contestar, no inventa nada ──");
{
  const lead = armarLead(CAMPOS, { p0: "Sin Programa" });
  es("sin programa", lead.producto_id, null);
  es("y sin lista", lead.programas_interes, []);

  const vacias = armarLead(CAMPOS, { p0: "Otra", p1: [] });
  es("una lista vacía tampoco", vacias.producto_id, null);
  es("ni deja restos", vacias.programas_interes, []);
}

console.log("\n── una marca que no está en el catálogo no ensucia ──");
{
  /*
   * Puede pasar si alguien editó las opciones del formulario después de que
   * se contestó. Lo que no engancha con un programa se descarta en vez de
   * entrar como un id inventado.
   */
  const lead = armarLead(CAMPOS, {
    p1: ["Pastelería Internacional", "Un programa que ya no existe"],
  });
  es("el que sí está entra", lead.producto_id, 2);
  es("Y EL QUE NO, NO", lead.programas_interes, [2]);
}

console.log("\n── el mismo programa marcado dos veces cuenta una ──");
{
  const lead = armarLead(CAMPOS, { p1: ["Mixología", "Mixología"] });
  es("no se repite", lead.programas_interes, [4]);
}

console.log("\n── EL TERRITORIO SIGUE SIENDO UNO SOLO ──");
{
  /*
   * A propósito: nadie vive en dos lugares. Si una pregunta de elegir-varias
   * se mapeara al territorio sería un error de quien armó el formulario, y lo
   * que corresponde es quedarse con el primero y no arrastrar una lista que
   * ninguna columna sabría guardar.
   */
  const territorio = {
    id: "p2", etiqueta: "¿De dónde nos escribís?", tipo: "opciones",
    requerido: false, mapeaA: "territorio_id",
    opciones: [{ texto: "San Salvador", valor: 10 }, { texto: "Santa Ana", valor: 11 }],
  };
  const lead = armarLead([NOMBRE, territorio], { p2: ["Santa Ana", "San Salvador"] });
  es("se queda con el primero", lead.territorio_id, 11);
  es("y no toca la lista de programas", lead.programas_interes, []);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
