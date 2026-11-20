/**
 * ¿Los avisos de Meta salen en inglés cuando se cambia el idioma?
 *
 *     node --test supabase/pruebas/traduccionMeta.test.mjs
 *
 * Los revisores de Meta ven el CRM en inglés en los videos. Los avisos de
 * envío los arma el servidor en castellano y la pantalla los traduce con el
 * diccionario; si alguien cambia una coma del texto en castellano y no la
 * clave, el aviso vuelve a salir en castellano sin que nada se rompa a la
 * vista. Esto lo vigila.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { compilar } from "./compilar.mjs";

const { EN, MOLDES_EN } = await compilar("src/lib/i18n/en.ts");
const { FALTA_HUMAN_AGENT, sinPermisoParaEscribir } = await compilar("src/lib/meta/ventana.ts");

const traducir = (es) => {
  if (EN[es] !== undefined) return EN[es];
  for (const [molde, en] of MOLDES_EN) { const m = molde.exec(es); if (m) return en(m); }
  return es;
};

test("el permiso de Meta que falta sale en inglés, con el texto de Meta", () => {
  for (const canal of ["Messenger", "Instagram"]) {
    const es = sinPermisoParaEscribir(canal, { code: 10, message: "Cannot message users who are not admins" });
    const en = traducir(es);
    assert.notEqual(en, es);
    assert.match(en, new RegExp(`on ${canal}\\.`));
    assert.match(en, /Advanced Access/);
    assert.match(en, /\(Meta: Cannot message users who are not admins\)$/);
  }
});

test("Human Agent y las ventanas por canal tienen su traducción", () => {
  assert.ok(EN[FALTA_HUMAN_AGENT]);
  const canales = fs.readFileSync("src/lib/canales.ts", "utf8");
  // Cada «laVentana» del archivo, armada como la arma el compilador.
  const textos = [...canales.matchAll(/laVentana:(?:\s*\n|\s*HUMAN_AGENT)([\s\S]*?),\n\s*porDondeLlega/g)].map((m) => m[1]);
  assert.ok(textos.length >= 3);
  for (const bloque of textos) {
    for (const parte of bloque.split(/\n\s*:\s*|\?\s*(?=")/)) {
      const piezas = [...parte.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
      const frase = piezas.join("");
      if (frase.length < 40 || frase.includes("TikTok")) continue;
      assert.ok(EN[frase], `falta en en.ts: ${frase.slice(0, 70)}…`);
    }
  }
});

test("los plazos con número usan los moldes", () => {
  assert.equal(traducir("Venció hace 5 días"), "Overdue by 5 days");
  assert.equal(traducir("Era hace 11 días"), "Was due 11 days ago");
  assert.equal(traducir("6 pendientes para hoy"), "6 items due today");
  assert.equal(traducir("Recordatorios, 6 por atender"), "Reminders, 6 pending");
  assert.equal(traducir("Algo que no está"), "Algo que no está");
});
