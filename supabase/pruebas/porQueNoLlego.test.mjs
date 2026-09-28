/**
 * Lo que Meta escribe cuando no entrega, dicho en castellano.
 *
 *     node --test supabase/pruebas/porQueNoLlego.test.mjs
 *
 * ============================================================================
 * DE DÓNDE SALE
 * ============================================================================
 *
 * En el hilo de la escuela, debajo de dos mensajes que no llegaron, decía:
 *
 *     Media upload error
 *
 * En inglés, sin ninguna pista de qué hacer, en medio de una pantalla en
 * español. Es de los errores que no significan nada hasta que se sabe qué
 * significan —Meta no pudo bajar la imagen del encabezado— y que se arreglan
 * solos una vez dicho.
 *
 * Son otra familia que la de los errores de envío: éstos Meta los ACEPTA y
 * después no los entrega, así que no pasan por el traductor de `enviar.ts`;
 * llegan por el webhook de estados y se guardan tal cual.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { porQueNoLlego } = await compilar("src/lib/whatsapp/porQueNoLlego.ts");

test("── EL DE LA IMAGEN DICE QUÉ HACER ──", () => {
  const dicho = porQueNoLlego("Media upload error");

  assert.ok(dicho);
  assert.match(dicho, /imagen/i);
  // Lo que importa no es que esté traducido sino que diga el siguiente paso.
  assert.match(dicho, /Subir imagen/);
  assert.equal(/Media upload error/.test(dicho), false);
});

test("── NO IMPORTA CÓMO VENGA ESCRITO ──", () => {
  // Meta manda el mismo error con mayúsculas distintas según por dónde salga.
  for (const forma of ["Media upload error", "MEDIA UPLOAD ERROR", "media upload error"]) {
    assert.match(porQueNoLlego(forma) ?? "", /imagen/i);
  }
});

test("── LO QUE NO SE RECONOCE SE MUESTRA IGUAL ──", () => {
  /*
   * A propósito. Inventarle una traducción a un error que no se entendió es
   * peor que el inglés: manda a arreglar lo que no está roto, y encima esconde
   * el texto con el que se podría buscar qué pasó.
   */
  assert.equal(porQueNoLlego("Something entirely new"), "Something entirely new");
});

test("── Y SIN ERROR, NO SE DIBUJA NADA ──", () => {
  // Devolver cadena vacía dejaría una línea en blanco debajo de cada burbuja.
  for (const nada of [null, undefined, "", "   "]) {
    assert.equal(porQueNoLlego(nada), null);
  }
});

test("── LA VENTANA VENCIDA, QUE ES OTRO ARREGLO ──", () => {
  const dicho = porQueNoLlego("Re-engagement message");

  assert.match(dicho ?? "", /24 horas/);
  assert.match(dicho ?? "", /plantilla/i);
});
