/**
 * Qué marca se usa y de dónde salen sus llaves (CRM unificado, 12/11/2026).
 *
 *     node --test supabase/pruebas/marcas.test.mjs
 *
 * Lo que no puede pasar nunca: que el CRM unificado, con HC elegida, use una
 * llave de LAC (o al revés), ni que los sitios de una sola marca cambien en
 * algo. `MODO_UNIFICADO` se decide al cargar el módulo, así que cada modo se
 * compila y carga por separado.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const conVariables = async (vars, fn) => {
  const antes = { ...process.env };
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
    Object.assign(process.env, antes);
  }
};

test("sitio de una sola marca: todo como siempre", async () => {
  await conVariables({ WHATSAPP_TOKEN: "token-de-siempre", LAC_WHATSAPP_TOKEN: "no-usar" }, async () => {
    const m = await compilar("src/lib/marcas.ts");
    assert.equal(m.MODO_UNIFICADO, false);
    assert.equal(m.MARCA_FIJA, "lac");
    // Aunque alguien deje la galleta puesta, un sitio de una marca la ignora.
    assert.equal(m.marcaDeLaGalleta("hc"), "lac");
    const s = await compilar("src/lib/marca/servidor.ts");
    assert.equal(s.env("WHATSAPP_TOKEN"), "token-de-siempre");
  });
});

test("sitio de HC: la marca fija es HC", async () => {
  await conVariables({ NEXT_PUBLIC_MARCA: "hc" }, async () => {
    const m = await compilar("src/lib/marcas.ts");
    assert.equal(m.MARCA_FIJA, "hc");
    assert.equal(m.marcaDeLaGalleta(null), "hc");
  });
});

test("CRM unificado: cada marca con sus llaves, sin caer en las de la otra", async () => {
  await conVariables(
    {
      NEXT_PUBLIC_CRM_UNIFICADO: "1",
      LAC_WHATSAPP_TOKEN: "token-lac",
      HC_WHATSAPP_TOKEN: "token-hc",
      WHATSAPP_TOKEN: "sin-prefijo",
    },
    async () => {
      const m = await compilar("src/lib/marcas.ts");
      assert.equal(m.MODO_UNIFICADO, true);
      assert.equal(m.marcaDeLaGalleta("hc"), "hc");
      assert.equal(m.marcaDeLaGalleta("lac"), "lac");
      assert.equal(m.marcaDeLaGalleta("cualquiera"), "lac");
      const s = await compilar("src/lib/marca/servidor.ts");
      assert.equal(s.env("WHATSAPP_TOKEN", "lac"), "token-lac");
      assert.equal(s.env("WHATSAPP_TOKEN", "hc"), "token-hc");
      // Fuera de un pedido (sin galletas) NO se adivina: en el unificado eso
      // mostró el catálogo de LAC en HC. Se falla a la vista.
      assert.throws(() => s.marcaDelPedido(), /fuera de un pedido/);
      // A una marca sin la variable no se le presta la de la otra.
      assert.equal(s.env("WHATSAPP_WABA_ID", "hc"), undefined);
    },
  );
});

test("los colores de cada marca salen de su paleta", async () => {
  const m = await compilar("src/lib/marcas.ts");
  assert.equal(m.variablesDeColor("lac")["--crm-resalte"], "#FFCE00");
  assert.equal(m.variablesDeColor("hc")["--crm-resalte"], "#CE9847");
  assert.equal(m.MARCAS.hc.instituto, "Instituto Internacional de Diseño de Modas");
  assert.equal(m.MARCAS.lac.instituto, "Instituto Superior");
});
