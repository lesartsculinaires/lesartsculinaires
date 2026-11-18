/**
 * Qué tipo de dispositivo es (límite de sesiones por rol, 12/11/2026).
 *
 *     node --test supabase/pruebas/dispositivo.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { tipoDeDispositivo, agenteCorto } = await compilar("src/lib/dispositivo.ts");

const UA = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipadViejo: "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1",
  androidCel: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  androidTab: "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

test("computadoras", () => {
  assert.equal(tipoDeDispositivo(UA.windows), "computadora");
  assert.equal(tipoDeDispositivo(UA.mac, 0), "computadora");
});

test("celulares", () => {
  assert.equal(tipoDeDispositivo(UA.iphone, 5), "celular");
  assert.equal(tipoDeDispositivo(UA.androidCel, 5), "celular");
});

test("tablets, incluido el iPad que se presenta como Mac", () => {
  assert.equal(tipoDeDispositivo(UA.mac, 5), "tablet");
  assert.equal(tipoDeDispositivo(UA.ipadViejo, 5), "tablet");
  assert.equal(tipoDeDispositivo(UA.androidTab, 5), "tablet");
});

test("el nombre corto para la lista", () => {
  assert.equal(agenteCorto(UA.windows), "Chrome · Windows");
  assert.equal(agenteCorto(UA.mac, 5), "Safari · iPad");
  assert.equal(agenteCorto(UA.iphone), "Safari · iPhone");
  assert.equal(agenteCorto(""), "Navegador · otro sistema");
});
