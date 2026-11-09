/**
 * Los cálculos del Tablero Comercial dan lo mismo que la plantilla en Excel.
 *
 *     node --test supabase/pruebas/tablero.test.mjs
 *
 * ============================================================================
 * CÓMO SE ARMÓ LA PRUEBA
 * ============================================================================
 *
 * Se tomó la plantilla «Tablero Comercial Institutos» de la Dirección, se
 * llenó con el caso de abajo (una semana de LAC en noviembre, tres acciones y
 * una fila de actividad), se recalculó con LibreOffice, y lo que dio quedó en
 * `tablero-plantilla.json`. Esta prueba mete el mismo caso en
 * `lib/tablero/calculos.ts` y compara KPI por KPI: real, meta, semáforo y %.
 *
 * Si alguien cambia una fórmula y el número deja de coincidir con el Excel,
 * se entera acá y no en la reunión de los lunes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compilar } from "./compilar.mjs";

const { resumenDelMes, kpisDelMes, indiceDe, faltaVender, lecturaDelCuadre, calcularGrupo, lecturaDeAccion } =
  await compilar("src/lib/tablero/calculos.ts");
const { semanasDelMes, mesDeLaSemana, lunesDe } = await compilar("src/lib/tablero/semanas.ts");

const EXCEL = JSON.parse(fs.readFileSync(new URL("./tablero-plantilla.json", import.meta.url), "utf8"));
const HOY = "2026-11-09";
const MES = "2026-11-01";

// ------------------------------------------------------------ el caso de prueba

const semana = {
  lunes: "2026-11-02",
  manual: {
    "mk.pauta_meta": 300, "mk.pauta_tiktok": 50, "mk.pauta_google": 0, "mk.pauta_otros": 20,
    "mk.alcance": 15000, "mk.seguidores": 80, "mk.publicaciones": 4, "mk.visitas_colegios": 1, "mk.clases_muestra": 1,
    "mk.leads_meta": 30, "mk.leads_tiktok": 5, "mk.leads_google": 0, "mk.leads_organico": 12, "mk.leads_colegios": 6,
    "mk.leads_alianzas": 2, "mk.leads_clases": 3, "mk.leads_referidos": 4, "mk.leads_recontacto": 2,
    "mk.resenas": 3, "mk.calificacion": 4.6,
    "ventas.contactados_24h": 50, "ventas.contactados": 60, "ventas.citas": 9,
    "ventas.inscritos_meta": 2, "ventas.inscritos_tiktok": 0, "ventas.inscritos_google": 0, "ventas.inscritos_organico": 1,
    "ventas.inscritos_colegios": 1, "ventas.inscritos_alianzas": 0, "ventas.inscritos_clases": 1, "ventas.inscritos_referidos": 1,
    "ventas.inscritos_recontacto": 0,
    "ventas.cursos_cortos": 3, "ventas.cotizaciones_corp": 1, "ventas.contratos_corp": 0,
    "ventas.cobrado_nuevos": 2200, "ventas.cursos_cortos_monto": 300, "ventas.corporativo_monto": 0, "ventas.descuentos": 250,
  },
  crm: {},
};

const acciones = [
  { tipo: "Visita a colegio o universidad", accion: "Charla en colegio", responsable: "MK", fecha: "2026-11-05", estado: "Hecha",
    costo: 40, leadsEsperados: 25, leadsObtenidos: 18, inscritos: 2, venta: 800 },
  { tipo: "Campaña de pauta", accion: "Pauta de noviembre", responsable: "MK", fecha: "2026-11-07", estado: "Planificada",
    costo: 100, leadsEsperados: 50, leadsObtenidos: null, inscritos: null, venta: null },
  { tipo: "Feria", accion: "Feria de universidades", responsable: "Ventas", fecha: "2026-11-20", estado: "Planificada",
    costo: 60, leadsEsperados: 30, leadsObtenidos: null, inscritos: null, venta: null },
];

const actividad = [
  { lunes: "2026-11-02", vendedorId: 1, crm: {},
    manual: { llamadas: 40, mensajes: 60, recontactos: 10, citas_agendadas: 8, citas_realizadas: 6, salidas_campo: 2, eventos: 1, ventas_cerradas: 3 } },
];

// Las metas de la plantilla para LAC (hoja «Metas»), más las dos del mes que llenó el caso.
const metas = {
  delMes: { [MES]: { venta_nueva: 38200, leads: 300, presupuesto_pauta: 1500 } },
  fijas: {
    cursos_cortos: 10, contratos_corp: 2, contactados_24h: 0.9, descuentos_pct: 0.2, conversion: 0.1,
    retorno_pauta: 5, publicaciones: 12, calificacion: 4.5, acciones_a_tiempo: 0.9, acciones_sin_pauta: 4,
    salidas_campo: 8, leads_sin_pauta_pct: 0.4,
  },
};

const resumen = resumenDelMes(MES, [semana], acciones, actividad, HOY);
const kpis = kpisDelMes(resumen, metas);

const cerca = (a, b) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-9);

// ------------------------------------------------------------------- semanas

test("una semana suma al mes de su jueves", () => {
  assert.deepEqual(semanasDelMes("2026-11-01"), ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
  // El lunes 30 de noviembre tiene su jueves en diciembre: es de diciembre.
  assert.equal(mesDeLaSemana("2026-11-30"), "2026-12-01");
  assert.deepEqual(semanasDelMes("2026-12-01"), ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28"]);
  // La semana del ejemplo de la plantilla (26/10) es de octubre: «no suma» a noviembre.
  assert.equal(mesDeLaSemana("2026-10-26"), "2026-10-01");
  assert.equal(lunesDe("2026-11-08"), "2026-11-02");
  assert.equal(lunesDe("2026-11-09"), "2026-11-09");
});

// --------------------------------------------------- KPI por KPI contra el Excel

for (const [nombre, excel] of Object.entries(EXCEL.kpis)) {
  test(`KPI «${nombre}» da lo mismo que el Excel`, () => {
    const k = kpis.find((x) => x.kpi.nombre === nombre);
    assert.ok(k, `no está el KPI «${nombre}»`);
    assert.ok(cerca(k.real, excel.real), `real: dio ${k.real}, el Excel ${excel.real}`);
    assert.ok(cerca(k.meta, excel.meta), `meta: dio ${k.meta}, el Excel ${excel.meta}`);
    assert.equal(k.estado, excel.estado, "semáforo");
    assert.ok(cerca(k.cumplimiento, excel.pct), `%: dio ${k.cumplimiento}, el Excel ${excel.pct}`);
  });
}

test("hay exactamente los 23 KPIs de la plantilla", () => {
  assert.equal(kpis.length, Object.keys(EXCEL.kpis).length);
});

test("el índice de cumplimiento, general y por responsable", () => {
  assert.ok(cerca(indiceDe(kpis), EXCEL.indice.LAC));
  assert.ok(cerca(indiceDe(kpis, "mk"), EXCEL.indice.mk));
  assert.ok(cerca(indiceDe(kpis, "ventas"), EXCEL.indice.ventas));
  assert.ok(cerca(indiceDe(kpis, "compartido"), EXCEL.indice.compartido));
});

test("¿cuánto falta vender este mes?", () => {
  const f = faltaVender(resumen, metas);
  assert.equal(f.meta, EXCEL.faltaVender.meta);
  assert.equal(f.lograda, EXCEL.faltaVender.lograda);
  assert.equal(f.falta, EXCEL.faltaVender.falta);
  assert.ok(cerca(f.porcentaje, EXCEL.faltaVender.porcentaje));
  assert.equal(f.semanasQuedan, EXCEL.faltaVender.semanasQuedan);
  assert.ok(cerca(f.porSemana, EXCEL.faltaVender.porSemana));
});

test("el cuadre MK ↔ Ventas", () => {
  assert.equal(resumen.leads, EXCEL.cuadre.leads);
  assert.equal(resumen.contactados, EXCEL.cuadre.contactados);
  assert.equal(resumen.citas, EXCEL.cuadre.citas);
  assert.equal(resumen.inscritos, EXCEL.cuadre.inscritos);
  assert.equal(lecturaDelCuadre(resumen), EXCEL.cuadre.lectura);
});

// ----------------------------------------------- lo que el CRM agrega a la plantilla

test("lo del CRM entra solo, y lo que escribe el área manda", () => {
  const conCrm = resumenDelMes(MES, [{ lunes: "2026-11-02", manual: {}, crm: { "mk.leads_meta": 40, "ventas.contactados": 35 } }], [], [], HOY);
  assert.equal(conCrm.leads, 40, "los leads del CRM entran aunque MK no haya cargado nada");
  assert.equal(conCrm.contactados, 35, "y los contactados, con la semana ya terminada");
  const corregido = resumenDelMes(MES, [{ lunes: "2026-11-02", manual: { "mk.leads_meta": 42 }, crm: { "mk.leads_meta": 40 } }], [], [], HOY);
  assert.equal(corregido.leads, 42, "el número del área pisa el del CRM");
});

test("los montos de «referencia» no toman el número del CRM", () => {
  const r = resumenDelMes(MES, [{ lunes: "2026-11-02", manual: {}, crm: { "ventas.cobrado_nuevos": 5000 } }], [], [], HOY);
  assert.equal(r.cobradoNuevos, null, "el monto lo escribe Ventas: sin escribirlo, no hay dato");
  const conAlgo = resumenDelMes(
    MES, [{ lunes: "2026-11-02", manual: { "ventas.descuentos": 100 }, crm: { "ventas.cobrado_nuevos": 5000 } }], [], [], HOY,
  );
  assert.equal(conAlgo.cobradoNuevos, 0, "con la semana cargada a mano, el monto no escrito es cero");
});

test("un mes de antes del Tablero: lo del CRM cuenta, lo manual queda vacío (no en cero)", () => {
  // Noviembre de 2025: semanas terminadas, el CRM con datos, nadie escribió nada.
  const semanas = [
    { lunes: "2025-11-03", manual: {}, crm: { "ventas.inscritos_meta": 2, "ventas.cursos_cortos": 3, "mk.leads_meta": 20 } },
    ...["2025-11-10", "2025-11-17", "2025-11-24"].map((lunes) => ({ lunes, manual: {}, crm: { "mk.leads_meta": 5 } })),
  ];
  const actividad = [{ lunes: "2025-11-03", vendedorId: 1, manual: {}, crm: { mensajes: 40, ventas_cerradas: 2 } }];
  const r = resumenDelMes("2025-11-01", semanas, [], actividad, HOY);
  assert.equal(r.inscritos, 2);
  assert.equal(r.cursosCortos, 3);
  assert.equal(r.contratosCorp, null, "los contratos se escriben a mano");
  assert.equal(r.ventaNueva, null);
  assert.equal(r.descuentos, null);
  assert.equal(r.actividad.mensajes, 40);
  assert.equal(r.actividad.salidasCampo, null, "las salidas de campo se anotan a mano");
  const k = kpisDelMes(r, { delMes: {}, fijas: { contratos_corp: 2, salidas_campo: 8, cursos_cortos: 10 } });
  const estado = (c) => k.find((x) => x.kpi.clave === c).estado;
  assert.equal(estado("contratos_corp"), null, "sin dato no se pinta de rojo");
  assert.equal(estado("salidas_campo"), null);
  assert.equal(estado("cursos_cortos"), "No cumple", "lo que el CRM sí sabe se evalúa");
});

test("una semana de antes del CRM no cuenta como cargada: no vendió cero, no hay datos", () => {
  const r = resumenDelMes("2025-11-01", [], [], [], HOY);
  assert.equal(r.semanasVentas, 0);
  assert.equal(r.cursosCortos, null);
  assert.equal(r.inscritos, null);
});

test("una semana que no terminó no cuenta para Ventas si nadie cargó nada", () => {
  const r = resumenDelMes(MES, [], [], [], "2026-11-05");
  assert.equal(r.semanasVentas, 0);
  assert.equal(r.ventaNueva, null);
});

// ---------------------------------------------------------- grupos y acciones

test("un grupo a menos de un mes y bajo 60% es URGENTE", () => {
  const g = calcularGrupo(
    { programa: "DSCI", grupo: "DSCI-1-2027", duracionMeses: 12, inicio: "2026-12-01", matricula1: 265, matricula2: 150,
      mensualidad: 230, graduacion: 350, mensualidadPreventa: 161, cupo: 22, reservas: 5, inscritos: 3 },
    HOY,
  );
  assert.equal(g.valorTotal, 265 + 150 + 230 * 12 + 350);
  assert.equal(g.ocupados, 8);
  assert.equal(g.faltan, 14);
  assert.equal(g.aportaHoy, 5 * 161 + 3 * 230);
  assert.equal(g.alerta, "URGENTE: menos de 60% a un mes");
});

test("la lectura de cada acción", () => {
  assert.equal(lecturaDeAccion(acciones[0], HOY), "Bajo lo esperado");
  assert.equal(lecturaDeAccion(acciones[1], HOY), "ATRASADA: ya pasó la fecha");
  assert.equal(lecturaDeAccion(acciones[2], HOY), "Pendiente");
});
