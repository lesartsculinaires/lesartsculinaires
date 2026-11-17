/**
 * Las historias de Instagram en la bandeja (17/11/2026).
 *
 *     node --test supabase/pruebas/historiasIg.test.mjs
 *
 * Una mención en una historia llega como adjunto `story_mention`; una
 * respuesta a una historia nuestra, como texto con `reply_to.story`. Las dos
 * tienen que traer la URL de la historia (para bajarla y para el enlace).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { leerWebhookIg, ARCHIVO_IG } = await compilar("src/lib/instagram/mensajes.ts");

const carga = (message) => ({
  object: "instagram",
  entry: [{ id: "cuenta", time: 1, messaging: [{ sender: { id: "persona" }, recipient: { id: "cuenta" }, timestamp: 1763390000000, message }] }],
});

test("una mención en una historia trae la historia para bajar y el enlace", () => {
  const { mensajes } = leerWebhookIg(carga({
    mid: "m1",
    attachments: [{ type: "story_mention", payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1" } }],
  }));
  assert.equal(mensajes.length, 1);
  const m = mensajes[0];
  assert.equal(m.tipo, "story_mention");
  assert.equal(m.media.clase, "story_mention");
  assert.equal(m.origen.red, "historia_mencion");
  assert.equal(m.origen.url, "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1");
  assert.ok(ARCHIVO_IG.has("story_mention"), "se baja");
});

test("una respuesta a una historia conserva el texto y trae la historia", () => {
  const { mensajes } = leerWebhookIg(carga({
    mid: "m2",
    text: "¿Cuándo empieza?",
    reply_to: { story: { id: "1789", url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2" } },
  }));
  const m = mensajes[0];
  assert.equal(m.tipo, "story_reply");
  assert.equal(m.texto, "¿Cuándo empieza?");
  assert.equal(m.media.url, "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2");
  assert.equal(m.origen.red, "historia_respuesta");
  assert.equal(m.origen.campana, "1789");
  assert.ok(ARCHIVO_IG.has("story_reply"), "se baja");
});

test("un mensaje normal no cambia", () => {
  const { mensajes } = leerWebhookIg(carga({ mid: "m3", text: "Hola" }));
  assert.equal(mensajes[0].tipo, "text");
  assert.equal(mensajes[0].media, null);
  assert.equal(mensajes[0].origen, null);
});
