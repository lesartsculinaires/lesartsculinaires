/**
 * Los meses de la Evolución sin que una fecha rara los dispare (12/11/2026).
 *
 *     node --test supabase/pruebas/selectorDeMeses.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { porMes } = await compilar("src/lib/periodos.ts");
const { repartirMeses, fechasParaRevisar } = await compilar("src/lib/selectorDeMeses.ts");

const op = (id, fecha, extra = {}) => ({
  id, cliente: `Cliente ${id}`, fechaRegistro: fecha, mes: `${fecha.slice(0, 7)}-01`,
  fechaCierre: null, estado: "Nuevo", cerrada: 0, valor: 0, ...extra,
});

// El caso de HC: 33 leads normales y uno con fecha de nacimiento (1985).
const lista = [
  ...Array.from({ length: 20 }, (_, i) => op(i + 1, `2026-${String((i % 11) + 1).padStart(2, "0")}-10`)),
  op(100, "2025-04-28"),
  op(573, "1985-08-26"),
];

test("una fecha de 1985 ya no son 480 botones", () => {
  const meses = porMes(lista);
  assert.ok(meses.length > 480, "porMes sigue rellenando (las barras siguen continuas)");
  const { recientes, anteriores } = repartirMeses(meses, 12);
  assert.equal(recientes.length, 12);
  assert.equal(recientes.at(-1).clave, "2026-11");
  // Los anteriores: sólo los meses con algo, agrupados por año, del más nuevo al más viejo.
  assert.deepEqual(anteriores.map((a) => a.anio), ["2025", "1985"]);
  assert.deepEqual(anteriores[1].meses.map((m) => m.clave), ["1985-08"]);
  const total = anteriores.reduce((s, a) => s + a.meses.length, 0);
  assert.ok(total <= 3, `quedan ${total} meses viejos para elegir`);
});

test("pocos meses: todos como botones, sin lista", () => {
  const { recientes, anteriores } = repartirMeses(porMes([op(1, "2026-10-01"), op(2, "2026-11-02")]), 12);
  assert.equal(recientes.length, 2);
  assert.equal(anteriores.length, 0);
});

test("avisa las fechas imposibles, no las normales", () => {
  const raras = fechasParaRevisar(lista, "2026-11-12");
  assert.deepEqual(raras.map((r) => [r.id, r.fecha, r.cual]), [[573, "1985-08-26", "registro"]]);
  const futuro = fechasParaRevisar([op(9, "2031-01-01")], "2026-11-12");
  assert.equal(futuro.length, 1);
});

test("el importador ya no acepta una fecha de nacimiento como registro", async () => {
  const { fechaImposible } = await compilar("src/lib/importar.ts");
  assert.equal(fechaImposible("1985-08-26", "2026-11-12"), true);
  assert.equal(fechaImposible("2012-08-31", "2026-11-12"), true);
  assert.equal(fechaImposible("2025-04-28", "2026-11-12"), false);
  assert.equal(fechaImposible("2026-11-11", "2026-11-12"), false);
  assert.equal(fechaImposible("2027-03-01", "2026-11-12"), true);
});
