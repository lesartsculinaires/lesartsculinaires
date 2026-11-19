/**
 * Messenger con token de Página (19/11/2026).
 *
 * Desde el CRM de HC no salía ningún mensaje de Messenger: se mandaba con un
 * token de usuario y Meta contestaba «(#100) The requested user cannot be
 * found». `tokenDePagina` pide el de la Página antes de mandar. Acá se prueba
 * sin red, con un Meta de mentira.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenDePagina, olvidarTokensDePagina } from "../../src/lib/meta/tokenDePagina.ts";

const META = "https://graph.facebook.com/v21.0";

function metaDeMentira(respuesta) {
  const pedidos = [];
  const impl = async (url, init) => {
    pedidos.push({ url, auth: init?.headers?.authorization });
    if (respuesta === "caida") throw new Error("sin red");
    return { ok: respuesta.ok ?? true, json: async () => respuesta.cuerpo };
  };
  return { impl, pedidos };
}

test("un token de usuario se cambia por el de la Página", async () => {
  olvidarTokensDePagina();
  const { impl, pedidos } = metaDeMentira({ cuerpo: { access_token: "token-de-pagina", id: "534" } });
  const t = await tokenDePagina("token-de-usuario", "534", META, impl);
  assert.equal(t, "token-de-pagina");
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, `${META}/534?fields=access_token`);
  assert.equal(pedidos[0].auth, "Bearer token-de-usuario");
});

test("se recuerda: el segundo mensaje no vuelve a preguntar", async () => {
  olvidarTokensDePagina();
  const { impl, pedidos } = metaDeMentira({ cuerpo: { access_token: "token-de-pagina" } });
  await tokenDePagina("u", "534", META, impl, 1_000);
  const t = await tokenDePagina("u", "534", META, impl, 2_000);
  assert.equal(t, "token-de-pagina");
  assert.equal(pedidos.length, 1);
});

test("pasadas unas horas, se vuelve a pedir", async () => {
  olvidarTokensDePagina();
  const { impl, pedidos } = metaDeMentira({ cuerpo: { access_token: "token-de-pagina" } });
  await tokenDePagina("u", "534", META, impl, 0);
  await tokenDePagina("u", "534", META, impl, 7 * 60 * 60 * 1000);
  assert.equal(pedidos.length, 2);
});

test("si Meta no da token de Página, se sigue con el configurado", async () => {
  olvidarTokensDePagina();
  const { impl } = metaDeMentira({ ok: false, cuerpo: { error: { message: "(#100) ..." } } });
  assert.equal(await tokenDePagina("el-configurado", "534", META, impl), "el-configurado");
});

test("si Meta no contesta, se sigue con el configurado", async () => {
  olvidarTokensDePagina();
  const { impl } = metaDeMentira("caida");
  assert.equal(await tokenDePagina("el-configurado", "534", META, impl), "el-configurado");
});

test("cada Página con su token", async () => {
  olvidarTokensDePagina();
  const impl = async (url) => ({ ok: true, json: async () => ({ access_token: url.includes("/111?") ? "de-la-111" : "de-la-222" }) });
  assert.equal(await tokenDePagina("u", "111", META, impl), "de-la-111");
  assert.equal(await tokenDePagina("u", "222", META, impl), "de-la-222");
});
