/**
 * La proyección de la meta del mes: avance, ritmo, asesoras, semanas y meses.
 *
 *     node --test supabase/pruebas/proyeccionMeta.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { proyeccionDelMes, semanasDelMesCalendario } = await compilar("src/lib/tablero/proyeccion.ts");

const nombres = new Map([[1, "Alexandra"], [2, "Sussy"]]);
const v = (fecha, vendedorId, categoria, monto, cantidad = 1) => ({ fecha, vendedorId, categoria, cantidad, monto });
const ventas = [
  v("2026-11-03", 1, "diplomado", 1000),
  v("2026-11-10", 1, "curso_corto", 250),
  v("2026-11-12", 2, "diplomado", 2000),
  v("2026-11-20", null, "corporativo", 750, 0),
  v("2026-10-15", 2, "diplomado", 3000),
  v("2026-12-01", 1, "diplomado", 9999), // otro mes
];
const metas = [{ mes: "2026-11-01", valor: 10000 }, { mes: "2026-10-01", valor: 6000 }];

test("── AVANCE Y PROYECCIÓN ──", () => {
  const p = proyeccionDelMes({ mes: "2026-11-01", hoy: "2026-11-24", ventas, metas, nombres });
  assert.equal(p.meta, 10000);
  assert.equal(p.vendido, 4000);
  assert.equal(p.porcentaje, 0.4);
  assert.equal(p.falta, 6000);
  assert.equal(p.diasCorridos, 24);
  assert.equal(Math.round(p.proyeccion), 5000); // 4000 / 24 × 30
  assert.equal(p.porcentajeProyectado, 0.5);
  assert.equal(p.semanasQuedan, 2); // 23–29 y 30
  assert.equal(p.porSemanaParaLlegar, 3000);
  assert.deepEqual(p.desglose, { diplomados: { cantidad: 2, monto: 3000 }, cursosCortos: { cantidad: 1, monto: 250 }, corporativo: 750 });
});

test("── ASESORAS, DE MAYOR A MENOR, SIN ASESORA AL FINAL ──", () => {
  const p = proyeccionDelMes({ mes: "2026-11-01", hoy: "2026-11-24", ventas, metas, nombres, sinNombre: "Corporativo" });
  assert.deepEqual(p.asesoras.map((a) => [a.nombre, a.monto]), [["Sussy", 2000], ["Alexandra", 1250], ["Corporativo", 750]]);
  assert.equal(p.asesoras[0].deLaMeta, 0.2);
  assert.equal(p.asesoras[0].parte, 0.5);
  assert.equal(p.asesoras[1].cursosCortos, 1);
});

test("── SEMANAS DEL MES, RECORTADAS AL MES ──", () => {
  const s = semanasDelMesCalendario("2026-11-01");
  assert.equal(s[0].desde, "2026-11-01");
  assert.equal(s[0].hasta, "2026-11-01"); // domingo 1
  assert.equal(s.at(-1).hasta, "2026-11-30");
  const p = proyeccionDelMes({ mes: "2026-11-01", hoy: "2026-11-24", ventas, metas, nombres });
  assert.equal(p.semanas.reduce((t, x) => t + x.monto, 0), 4000);
  assert.equal(Math.round(p.semanas.reduce((t, x) => t + x.meta, 0)), 10000);
  assert.equal(p.semanas.find((x) => x.actual).desde, "2026-11-23");
  assert.equal(p.semanas.filter((x) => x.futura).length, 1);
});

test("── LOS ÚLTIMOS SEIS MESES ──", () => {
  const p = proyeccionDelMes({ mes: "2026-11-01", hoy: "2026-11-24", ventas, metas, nombres });
  assert.equal(p.meses.length, 6);
  assert.equal(p.meses.at(-1).mes, "2026-11-01");
  assert.equal(p.meses.at(-1).actual, true);
  const oct = p.meses.find((m) => m.mes === "2026-10-01");
  assert.equal(oct.monto, 3000);
  assert.equal(oct.porcentaje, 0.5);
  assert.equal(p.meses.find((m) => m.mes === "2026-06-01").meta, null);
});

test("── SIN META, Y MESES PASADOS O FUTUROS ──", () => {
  const sin = proyeccionDelMes({ mes: "2026-11-01", hoy: "2026-11-24", ventas, metas: [], nombres });
  assert.equal(sin.meta, null);
  assert.equal(sin.porcentaje, null);
  assert.equal(sin.porSemanaParaLlegar, null);
  const pasado = proyeccionDelMes({ mes: "2026-10-01", hoy: "2026-11-24", ventas, metas, nombres });
  assert.equal(pasado.diasCorridos, 31);
  assert.equal(pasado.proyeccion, 3000);
  assert.equal(pasado.semanasQuedan, 0);
  const futuro = proyeccionDelMes({ mes: "2026-12-01", hoy: "2026-11-24", ventas, metas, nombres });
  assert.equal(futuro.diasCorridos, 0);
  assert.equal(futuro.proyeccion, null);
});
