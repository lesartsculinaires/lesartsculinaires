/**
 * El formulario de una pauta, leído del mensaje que lo trae.
 *
 *     node --test supabase/pruebas/formularioDeAnuncio.test.mjs
 *
 * ============================================================================
 * QUÉ SE ESTÁ CUIDANDO
 * ============================================================================
 *
 * Que se reconozcan las etiquetas que de verdad manda Meta, en inglés y en
 * castellano, y que un mensaje común NO se confunda con un formulario.
 *
 * Las dos mitades importan por igual. Reconocer de menos deja a la asesora
 * copiando a mano lo que ya estaba escrito; reconocer de más mete datos
 * inventados en una ficha, que es peor: nadie revisa un campo que se llenó
 * solo.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { leerFormulario, telefonoUtil, comoSeUbica } = await compilar(
  "src/lib/crm/formularioDeAnuncio.ts",
);

/** El de la escuela, copiado tal cual del chat. */
const EL_DE_LA_ESCUELA = [
  "¡Hola! Completé el formulario y me gustaría obtener más información sobre el negocio.",
  "Email: magdalenamartinez24@hotmail.com",
  "Full name: Magdalena Martinez",
  "Phone number: 7966 4432",
  "Province: Colon",
  "Curso Corto de tu interés: Pastelería Saludable",
  "City: Chalatenango",
].join("\n");

test("── EL FORMULARIO DE LA ESCUELA, ENTERO ──", () => {
  const f = leerFormulario(EL_DE_LA_ESCUELA);

  assert.ok(f, "tendría que reconocerse como formulario");
  assert.equal(f.nombre, "Magdalena Martinez");
  assert.equal(f.correo, "magdalenamartinez24@hotmail.com");
  assert.equal(f.telefono, "7966 4432");
  assert.equal(f.programa, "Pastelería Saludable");
  assert.equal(f.departamento, "Colon");
  assert.equal(f.ciudad, "Chalatenango");

  // El saludo de arriba no tiene dos puntos, así que no estorba.
  assert.equal(f.empresa, null);
});

test("── «CURSO CORTO DE TU INTERÉS» ES EL PROGRAMA, NO OTRA COSA ──", () => {
  /*
   * Esa etiqueta contiene «curso» y también «interes», y podría caer en más de
   * un campo. Es el caso que obliga a que las reglas estén ordenadas de más
   * específica a más general.
   */
  const f = leerFormulario(EL_DE_LA_ESCUELA);
  assert.equal(f.programa, "Pastelería Saludable");
});

test("── LAS ETIQUETAS EN CASTELLANO TAMBIÉN ──", () => {
  // Cada pauta se arma aparte y nadie garantiza que la siguiente use inglés.
  const f = leerFormulario(
    [
      "Nombre completo: Flor de Iraheta",
      "Correo electrónico: flordeiraheta@outlook.es",
      "Teléfono: 7851 1229",
      "¿Qué diplomado te interesa?: Cuisine de Noël",
      "Departamento: San Salvador",
    ].join("\n"),
  );

  assert.ok(f);
  assert.equal(f.nombre, "Flor de Iraheta");
  assert.equal(f.correo, "flordeiraheta@outlook.es");
  assert.equal(f.telefono, "7851 1229");
  assert.equal(f.programa, "Cuisine de Noël");
  assert.equal(f.departamento, "San Salvador");
});

test("── SIN TILDES Y EN NEGRITA, IGUAL ──", () => {
  /*
   * WhatsApp muestra en negrita lo que va entre asteriscos, y algunas pautas
   * las mandan así. Sin limpiarlos, la etiqueta sería «*Email*» y no
   * coincidiría con nada.
   */
  const f = leerFormulario(
    ["*Email*: ana@test.com", "*TELEFONO*: 7000 0000", "*programa*: Barismo"].join("\n"),
  );

  assert.ok(f);
  assert.equal(f.correo, "ana@test.com");
  assert.equal(f.telefono, "7000 0000");
  assert.equal(f.programa, "Barismo");
});

test("── UN MENSAJE COMÚN NO ES UN FORMULARIO ──", () => {
  /*
   * La mitad que más importa. Un falso positivo mete datos inventados en una
   * ficha, y a un campo que se llenó solo nadie lo revisa.
   */
  for (const comun of [
    "Hola, buenos días",
    "Hola: quisiera información del curso",
    "Me interesa el diplomado de pastelería, ¿cuánto cuesta?",
    "",
    null,
    undefined,
  ]) {
    assert.equal(leerFormulario(comun), null, `«${String(comun)}» no es un formulario`);
  }
});

test("── CON UN SOLO DATO TAMPOCO ALCANZA ──", () => {
  // «Programa: el del sábado» es una frase que alguien escribe de verdad.
  assert.equal(leerFormulario("Programa: el del sábado"), null);

  // Con dos, la forma ya es la de un formulario.
  assert.ok(leerFormulario("Programa: Barismo\nEmail: x@y.com"));
});

test("── UN VALOR CON DOS PUNTOS ADENTRO NO SE PARTE MAL ──", () => {
  const f = leerFormulario(
    ["Email: a@b.com", "Programa: Repostería: nivel 2", "Horario: 9:00 a 13:00"].join("\n"),
  );

  assert.ok(f);
  assert.equal(f.programa, "Repostería: nivel 2");
});

test("── LO QUE NO SE RECONOCE NO SE INVENTA ──", () => {
  const f = leerFormulario(
    ["Email: a@b.com", "Nombre: Ana", "Color favorito: azul", "Mascota: perro"].join("\n"),
  );

  assert.ok(f);
  assert.equal(f.nombre, "Ana");
  // Lo raro se ignora y no se cuela en ningún campo.
  assert.equal(f.empresa, null);
  assert.equal(f.cargo, null);
  assert.equal(f.programa, null);
});

test("── EL PRIMERO GANA SI LA ETIQUETA SE REPITE ──", () => {
  const f = leerFormulario(["Nombre: Ana", "Email: a@b.com", "Nombre: Otro"].join("\n"));
  assert.equal(f.nombre, "Ana");
});

test("── UNA ETIQUETA SIN VALOR NO CUENTA ──", () => {
  // Un formulario a medio llenar manda la etiqueta con el valor vacío. Tomarlo
  // como dato pondría una cadena vacía en la ficha, que se ve igual que un
  // hueco pero impide que se complete después.
  assert.equal(leerFormulario("Nombre:\nEmail:"), null);

  const f = leerFormulario("Nombre:\nEmail: a@b.com\nPrograma: Barismo");
  assert.equal(f.nombre, null);
  assert.equal(f.correo, "a@b.com");
});

test("── EL TELÉFONO DEL FORMULARIO, SÓLO SI SIRVE ──", () => {
  // Ocho dígitos son un número salvadoreño sin código de país.
  assert.equal(telefonoUtil("7966 4432"), "50379664432");
  assert.equal(telefonoUtil("7966-4432"), "50379664432");

  // Ya con país, se deja.
  assert.equal(telefonoUtil("+503 7966 4432"), "50379664432");

  // Y lo que no puede ser un teléfono, no lo es.
  for (const no of ["123", "", null, "no tengo"]) {
    assert.equal(telefonoUtil(no), null);
  }
});

test("── LA UBICACIÓN JUNTA CIUDAD Y DEPARTAMENTO ──", () => {
  assert.equal(
    comoSeUbica({ ciudad: "Chalatenango", departamento: "Colon" }),
    "Chalatenango, Colon",
  );

  // Con uno solo, ése.
  assert.equal(comoSeUbica({ ciudad: null, departamento: "San Salvador" }), "San Salvador");

  // Y sin repetir cuando la pauta manda el mismo dato dos veces, que pasa
  // cuando quien la armó puso ciudad y departamento iguales.
  assert.equal(comoSeUbica({ ciudad: "San Miguel", departamento: "San Miguel" }), "San Miguel");

  assert.equal(comoSeUbica({ ciudad: null, departamento: null }), null);
});
