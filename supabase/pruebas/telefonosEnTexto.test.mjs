/**
 * Los números que un lead escribe en el chat se reconocen, con o sin espacios.
 *
 *     node --test supabase/pruebas/telefonosEnTexto.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { telefonosEnTexto } = await compilar("src/lib/telefonosEnTexto.ts");
const marcar = (t) => telefonosEnTexto(t).map((x) => x.paraMarcar);

test("── EL SALVADOR, ESCRITO DE TODAS LAS FORMAS ──", () => {
  for (const t of [
    "78803928", "7880 3928", "7880-3928", "7880.3928",
    "mi número es 78803928 gracias", "Llámeme al 7880 3928.",
    "+503 7880 3928", "+50378803928", "503 78803928", "(503) 7880-3928", "+503-7880-3928",
  ]) {
    assert.deepEqual(marcar(t), ["50378803928"], t);
  }
  assert.deepEqual(marcar("fijo 2250 1234"), ["50322501234"]);
  assert.deepEqual(marcar("6123 4567"), ["50361234567"]);
  assert.equal(telefonosEnTexto("7880 3928")[0].comoSeVe, "+503 7880 3928");
});

test("── VARIOS EN UN MENSAJE, SIN REPETIR ──", () => {
  assert.deepEqual(marcar("el mío 7880 3928 y el de mi mamá 7123-4567"), ["50378803928", "50371234567"]);
  assert.deepEqual(marcar("78803928 o +503 7880 3928"), ["50378803928"]);
});

test("── OTROS PAÍSES, SÓLO CON + ──", () => {
  assert.deepEqual(marcar("+1 305 555 1234"), ["13055551234"]);
  assert.deepEqual(marcar("+52 55 1234 5678"), ["525512345678"]);
  assert.equal(telefonosEnTexto("+1 305 555 1234")[0].comoSeVe, "+1 305 555 1234");
  assert.deepEqual(marcar("305 555 1234"), []); // sin + no se adivina
});

test("── LO QUE NO ES UN TELÉFONO ──", () => {
  for (const t of [
    "$1,350", "25/11/2026", "a las 10:30", "CRM-2780", "ADMISIONES 2027",
    "mi DUI es 01234567-8", "DUI 71234567-8", "tarjeta 4111111111111111",
    "código 12345678", "son 3 cuotas de $100", "", null,
    "785 años", "1234 5678",
  ]) {
    assert.deepEqual(marcar(t), [], String(t));
  }
});
