/**
 * El buscador del módulo de Bases.
 *
 *     node --test supabase/pruebas/buscarBases.test.mjs
 *
 * ============================================================================
 * QUÉ PIDIÓ LA ESCUELA
 * ============================================================================
 *
 * «En el módulo de bases, una barra de búsqueda para buscar más rápido las
 *  bases.»
 *
 * ============================================================================
 * LO QUE SE VIGILA
 * ============================================================================
 *
 * Que encuentre escribiendo mal —sin tildes, en minúsculas, con las palabras
 * al revés—, porque así es como se busca cuando hay alguien esperando del otro
 * lado del teléfono. Un buscador que exige escribir el nombre exacto no ahorra
 * nada: para eso ya estaba la lista.
 *
 * Y que busque también por el cliente que la base trajo, que es la pregunta
 * que de verdad se hace: «¿de qué base salió este contacto?».
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { buscarBases } = await compilar("src/lib/bases.ts");

/** Una base, con lo justo para el buscador. */
const base = (titulo, fecha, clientes = []) => ({
  clave: `imp:${titulo}`,
  titulo,
  fecha,
  momento: fecha ? `${fecha}T15:00:00Z` : null,
  registrada: true,
  filasDeclaradas: clientes.length,
  importacionId: 1,
  duplicadaDe: null,
  oportunidades: clientes.map((c, i) => ({
    id: i + 1,
    cliente: c,
    correo: `${c.toLowerCase().replace(/\s+/g, ".")}@mail.com`,
    codigo: `CRM-${1000 + i}`,
  })),
});

const BASES = [
  base("Base feria - 12 julio.xlsx", "2026-07-12", ["María Peña", "José Rodríguez"]),
  base("julio, stand de la feria.csv", "2026-07-30", ["Ana López"]),
  base("Inscripciones agosto.xlsx", "2026-08-02", ["Carlos Méndez"]),
];

const titulos = (r) => r.map((b) => b.titulo);

test("── SIN NADA ESCRITO, ESTÁN TODAS ──", () => {
  assert.equal(buscarBases(BASES, "").length, 3);
  assert.equal(buscarBases(BASES, "   ").length, 3);
});

test("── POR EL NOMBRE DEL ARCHIVO ──", () => {
  assert.deepEqual(titulos(buscarBases(BASES, "agosto")), ["Inscripciones agosto.xlsx"]);
  // Sin importar mayúsculas.
  assert.deepEqual(titulos(buscarBases(BASES, "INSCRIPCIONES")), ["Inscripciones agosto.xlsx"]);
});

test("── TODAS LAS PALABRAS, EN CUALQUIER ORDEN ──", () => {
  // Las dos bases dicen «feria» y «julio», con las palabras en otro orden y
  // separadas por otras. Buscar la frase entera encontraría una sola.
  assert.equal(buscarBases(BASES, "feria julio").length, 2);
  assert.equal(buscarBases(BASES, "julio feria").length, 2);

  // Y no alcanza con que aparezca una sola de las palabras.
  assert.deepEqual(titulos(buscarBases(BASES, "feria agosto")), []);
});

test("── SIN TILDES, QUE ES COMO SE ESCRIBE APURADO ──", () => {
  assert.deepEqual(titulos(buscarBases(BASES, "maria")), ["Base feria - 12 julio.xlsx"]);
  assert.deepEqual(titulos(buscarBases(BASES, "mendez")), ["Inscripciones agosto.xlsx"]);
  // Y al revés: escrito con tilde encuentra lo mismo.
  assert.deepEqual(titulos(buscarBases(BASES, "Méndez")), ["Inscripciones agosto.xlsx"]);
});

test("── POR UN CLIENTE QUE LA BASE TRAJO ──", () => {
  // «¿De qué base salió este contacto?», que es la pregunta de verdad.
  assert.deepEqual(titulos(buscarBases(BASES, "Ana López")), ["julio, stand de la feria.csv"]);
  // Por el correo también.
  assert.deepEqual(titulos(buscarBases(BASES, "ana.lopez@mail.com")), [
    "julio, stand de la feria.csv",
  ]);
  // Y por el código del lead.
  assert.equal(buscarBases(BASES, "CRM-1000").length, 3);
});

test("── POR LA FECHA ──", () => {
  assert.deepEqual(titulos(buscarBases(BASES, "2026-08")), ["Inscripciones agosto.xlsx"]);
});

test("── LO QUE NO ESTÁ, NO APARECE ──", () => {
  assert.deepEqual(buscarBases(BASES, "diciembre"), []);
});

test("── NO TOCA LA LISTA QUE RECIBE ──", () => {
  // Devuelve una copia: si ordenara o vaciara la original, la pantalla se
  // quedaría sin bases al borrar el texto del buscador.
  const antes = [...BASES];
  buscarBases(BASES, "julio");
  assert.deepEqual(BASES, antes);
  assert.notEqual(buscarBases(BASES, ""), BASES);
});
