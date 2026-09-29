/**
 * Encontrar en el catálogo lo que escribió una pauta.
 *
 *     node --test supabase/pruebas/buscarEnCatalogo.test.mjs
 *
 * ============================================================================
 * LOS DOS ERRORES POSIBLES NO CUESTAN LO MISMO
 * ============================================================================
 *
 *   NO ENCONTRARLO   El campo queda vacío y la asesora lo elige mirando el
 *                    hilo, que es exactamente lo que hacía antes. No se pierde
 *                    nada.
 *
 *   ENCONTRAR MAL    La ficha queda con un programa que la persona no pidió, y
 *                    a un campo que se llenó solo nadie lo revisa. De ahí pasa
 *                    a los reportes.
 *
 * Por eso esto está hecho para NO adivinar. Todas las pruebas de abajo miran lo
 * mismo desde ángulos distintos: cuándo tiene derecho a decidir y cuándo no.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { cualEsDelCatalogo } = await compilar("src/lib/crm/buscarEnCatalogo.ts");

/** Como el catálogo de la escuela: nombres largos con prefijo. */
const PROGRAMAS = [
  { id: 1, nombre: "Curso corto Pastelería Saludable" },
  { id: 2, nombre: "Curso corto Cuisine de Noël" },
  { id: 3, nombre: "Diplomado en Alta Cocina" },
  { id: 4, nombre: "Barismo" },
];

const TERRITORIOS = [
  { id: 10, nombre: "San Salvador" },
  { id: 11, nombre: "Chalatenango" },
  { id: 12, nombre: "La Libertad" },
];

test("── EL NOMBRE EXACTO ──", () => {
  assert.equal(cualEsDelCatalogo("Barismo", PROGRAMAS), 4);
  assert.equal(cualEsDelCatalogo("San Salvador", TERRITORIOS), 10);
});

test("── SIN TILDES Y EN OTRA CAJA, IGUAL ──", () => {
  // La pauta la escribe una persona; nadie copia el nombre del CRM.
  assert.equal(cualEsDelCatalogo("BARISMO", PROGRAMAS), 4);
  assert.equal(cualEsDelCatalogo("chalatenango", TERRITORIOS), 11);
  assert.equal(cualEsDelCatalogo("Cuisine de Noel", PROGRAMAS), 2);
});

test("── EL CASO DE LA ESCUELA: UN PEDAZO DEL NOMBRE ──", () => {
  /*
   * El formulario dice «Pastelería Saludable» y el catálogo «Curso corto
   * Pastelería Saludable». Son el mismo y hay que juntarlos.
   */
  assert.equal(cualEsDelCatalogo("Pastelería Saludable", PROGRAMAS), 1);
  assert.equal(cualEsDelCatalogo("Cuisine de Noël", PROGRAMAS), 2);
  assert.equal(cualEsDelCatalogo("Alta Cocina", PROGRAMAS), 3);
});

test("── CON DOS CANDIDATOS NO ELIGE NINGUNO ──", () => {
  /*
   * Lo más importante del archivo. «Curso corto» está en dos programas, así
   * que no alcanza para decidir; elegir el primero pondría a la mitad de los
   * leads en el curso equivocado, en silencio.
   */
  assert.equal(cualEsDelCatalogo("Curso corto", PROGRAMAS), null);
  assert.equal(cualEsDelCatalogo("curso", PROGRAMAS), null);
});

test("── Y CON NINGUNO, TAMPOCO INVENTA ──", () => {
  assert.equal(cualEsDelCatalogo("Panadería Artesanal", PROGRAMAS), null);
  assert.equal(cualEsDelCatalogo("Guatemala", TERRITORIOS), null);
});

test("── UN TEXTO CORTO NO BUSCA POR PARECIDO ──", () => {
  /*
   * «Noe» aparece dentro de demasiadas cosas. Menos de cuatro letras sólo
   * encuentra por nombre exacto.
   */
  assert.equal(cualEsDelCatalogo("Noe", PROGRAMAS), null);
  assert.equal(cualEsDelCatalogo("San", TERRITORIOS), null);

  // Pero si el catálogo tiene ese nombre exacto, sí.
  assert.equal(cualEsDelCatalogo("Noe", [{ id: 9, nombre: "Noe" }]), 9);
});

test("── DOS ENTRADAS CON EL MISMO NOMBRE: NINGUNA ──", () => {
  /*
   * Pasa cuando un programa se cargó dos veces. Elegir la primera pondría el
   * lead en la copia equivocada la mitad de las veces, y sin ninguna señal.
   */
  const repetido = [
    { id: 1, nombre: "Barismo" },
    { id: 2, nombre: "barismo" },
  ];
  assert.equal(cualEsDelCatalogo("Barismo", repetido), null);
});

test("── LO VACÍO NO BUSCA NADA ──", () => {
  for (const nada of ["", "   ", null, undefined]) {
    assert.equal(cualEsDelCatalogo(nada, PROGRAMAS), null);
  }
  assert.equal(cualEsDelCatalogo("Barismo", []), null);
});
