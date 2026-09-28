/**
 * El contacto que alguien comparte por WhatsApp: leerle el número.
 *
 *     node --test supabase/pruebas/contactos.test.mjs
 *
 * ============================================================================
 * QUÉ SE ESTABA PERDIENDO
 * ============================================================================
 *
 * Un cliente adjuntó un contacto —«acá le comparto el número»— y el hilo mostró
 * sólo «Contacto: Mami❤️». El número no aparecía por ningún lado, así que para
 * usarlo había que abrir WhatsApp en el teléfono y copiarlo a mano.
 *
 * Y el dato estaba: Meta lo manda entero y el CRM guarda ese cuerpo tal cual en
 * `mensajes.payload` desde el primer día. Lo único que se leía era el nombre.
 *
 * Por eso esto no necesita migración: los contactos que YA llegaron se pueden
 * leer igual.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { leerContactos, paraMarcar, comoSeDice } = await compilar("src/lib/whatsapp/contactos.ts");

/** El mensaje tal como lo manda Meta. */
const COMO_LO_MANDA_META = {
  type: "contacts",
  contacts: [
    {
      name: { formatted_name: "Mami❤️", first_name: "Mami" },
      phones: [{ phone: "+503 7529 0078", wa_id: "50375290078", type: "CELL" }],
    },
  ],
};

test("── EL NÚMERO SE LEE, Y EL NOMBRE TAMBIÉN ──", () => {
  const [c] = leerContactos(COMO_LO_MANDA_META);

  assert.equal(c.nombre, "Mami❤️");
  assert.equal(c.telefonos.length, 1);

  // Como lo escribió quien lo compartió: es lo que se muestra.
  assert.equal(c.telefonos[0].comoSeVe, "+503 7529 0078");
  // Y sin signos, que es lo que sirve para abrir un chat.
  assert.equal(c.telefonos[0].paraMarcar, "50375290078");
  assert.equal(c.telefonos[0].clase, "CELL");
});

test("── VARIOS NÚMEROS, Y VARIOS CONTACTOS ──", () => {
  /*
   * Quedarse con el primero perdería justo el que hacía falta, y sin avisar:
   * la pantalla mostraría un número y quien atiende no tendría forma de saber
   * que había otro.
   */
  const dos = {
    contacts: [
      {
        name: { formatted_name: "Ana" },
        phones: [
          { phone: "+503 7000 0001", wa_id: "50370000001", type: "CELL" },
          { phone: "+503 2222 0002", wa_id: "50322220002", type: "HOME" },
        ],
      },
      {
        name: { formatted_name: "Beto" },
        phones: [{ phone: "+503 7000 0003", wa_id: "50370000003" }],
      },
    ],
  };

  const leidos = leerContactos(dos);
  assert.equal(leidos.length, 2);
  assert.equal(leidos[0].telefonos.length, 2);
  assert.equal(leidos[0].telefonos[1].clase, "HOME");
  assert.equal(leidos[1].telefonos[0].paraMarcar, "50370000003");
  // Sin `type` no se inventa ninguno.
  assert.equal(leidos[1].telefonos[0].clase, null);
});

test("── SIN `wa_id`, EL NÚMERO SE ARMA DE LOS DÍGITOS ──", () => {
  /*
   * `wa_id` falta cuando esa persona no tiene WhatsApp. El contacto igual
   * sirve —se le puede dar de alta como lead y llamarlo— así que no se
   * descarta.
   */
  const sinWa = {
    contacts: [
      { name: { formatted_name: "Sin WhatsApp" }, phones: [{ phone: "+503 2264-1234" }] },
    ],
  };

  assert.equal(leerContactos(sinWa)[0].telefonos[0].paraMarcar, "50322641234");
});

test("── UN NÚMERO LOCAL SE COMPLETA CON EL PAÍS ──", () => {
  /*
   * Un contacto guardado en El Salvador suele venir sin código de país, y ocho
   * dígitos no sirven para abrir un chat: WhatsApp identifica a todo el mundo
   * con el país adelante.
   */
  assert.equal(paraMarcar("7529-0078"), "50375290078");
  assert.equal(paraMarcar("7529 0078", null), "50375290078");

  // Ya con país, no se toca.
  assert.equal(paraMarcar("+503 7529 0078"), "50375290078");

  /*
   * Y con cualquier otro largo se deja como vino. Completar ahí sería adivinar,
   * y adivinar un teléfono es escribirle a otra persona.
   */
  assert.equal(paraMarcar("+52 55 1234 5678"), "525512345678");
  assert.equal(paraMarcar("123"), "123");

  // El `wa_id` gana siempre: es el número tal como lo conoce WhatsApp.
  assert.equal(paraMarcar("7529-0078", "50375290078"), "50375290078");
});

test("── LO QUE NO SIRVE NO SE MUESTRA ──", () => {
  /*
   * Un «número» de menos de ocho dígitos no se puede marcar ni buscar.
   * Mostrarlo sería ofrecer un botón muerto: se aprieta «Crear ficha» y falla.
   */
  const corto = {
    contacts: [{ name: { formatted_name: "Emergencias" }, phones: [{ phone: "911" }] }],
  };

  const [c] = leerContactos(corto);
  assert.equal(c.nombre, "Emergencias");
  assert.equal(c.telefonos.length, 0);
});

test("── UN CUERPO RARO NO TUMBA EL HILO ──", () => {
  /*
   * Esto se dibuja dentro de la conversación. Un payload con una forma
   * inesperada —de una versión vieja de la API, o de un mensaje guardado a
   * medias— no puede hacer que la conversación entera deje de verse.
   */
  for (const raro of [null, undefined, "", 7, [], {}, { contacts: "no es una lista" }]) {
    assert.deepEqual(leerContactos(raro), []);
  }

  // Y un contacto sin nombre se muestra igual, con su número.
  const sinNombre = { contacts: [{ phones: [{ phone: "+503 7000 0009" }] }] };
  assert.equal(leerContactos(sinNombre)[0].nombre, "Contacto sin nombre");
});

test("── LA CLASE SE DICE EN CASTELLANO ──", () => {
  // «CELL» en medio de una pantalla en español hace dudar de si dice lo que
  // uno cree.
  assert.equal(comoSeDice("CELL"), "Celular");
  assert.equal(comoSeDice("home"), "Casa");
  assert.equal(comoSeDice("WORK"), "Trabajo");
  assert.equal(comoSeDice(null), null);

  // Lo que no se reconoce se muestra tal cual: inventar una traducción sería
  // peor que el inglés.
  assert.equal(comoSeDice("IPHONE"), "IPHONE");
});
