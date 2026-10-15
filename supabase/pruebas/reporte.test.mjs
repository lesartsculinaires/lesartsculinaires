import { compilar } from "./compilar.mjs";
/**
 * El reporte del día y del mes.
 *
 *     node supabase/pruebas/reporte.test.mjs
 *
 * Pedido el 14 de octubre de 2026: un reporte para marketing, digerible y
 * medible. Esto comprueba que cuente igual que el Dashboard, que compare
 * contra el período anterior, que explique por qué se pierden los leads y que
 * el archivo para Excel se abra bien.
 */
const { periodoPedido, armarReporte, reporteACsv, cortes } = await compilar("src/lib/reporte.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

let n = 0;
const lead = (registro, extra = {}) => ({
  id: ++n, codigo: `CRM-${n}`, cliente: `Cliente ${n}`, canal: "Instagram", producto: "Cocina", productoId: 1,
  vendedor: "Alexandra", territorio: "San Salvador", etapa: "Prospectos", estado: "Activo", motivo: null,
  registro, cierre: null, valor: 400, cerrada: null, programas: [1], etiquetas: [], nota: null, ...extra,
});
const vacio = { leads: [], mensajes: [], conversaciones: 0, movimientos: [], notas: [] };
const catalogo = {
  programas: [
    { id: 1, nombre: "Cocina", categoria: "Diplomado", precio: 430, horario: "Sábados", activo: true },
    { id: 2, nombre: "Pastelería", categoria: "Diplomado", precio: 495, horario: null, activo: true },
    { id: 3, nombre: "Viejo", categoria: "Curso corto", precio: null, horario: null, activo: false },
  ],
  etiquetas: [{ id: 10, nombre: "Visita al instituto", color: "#8a5200" }, { id: 11, nombre: "PROMO 15 %", color: "#0f6e7a" }],
};

console.log("── el período que se pide ──");
{
  const p = periodoPedido("2026-10-14", undefined, "2026-10-15");
  es("un día", [p.actual.tipo, p.actual.desde, p.actual.hasta], ["dia", "2026-10-14", "2026-10-15"]);
  es("se lee como día de la semana", p.actual.etiqueta, "Miércoles 14 de octubre de 2026");
  es("se compara con el día anterior", [p.anterior.desde, p.anterior.hasta], ["2026-10-13", "2026-10-14"]);
  const m = periodoPedido(undefined, "2026-01", "2026-10-15");
  es("un mes", [m.actual.desde, m.actual.hasta, m.actual.etiqueta], ["2026-01-01", "2026-02-01", "Enero 2026"]);
  es("enero se compara con diciembre del año anterior", [m.anterior.desde, m.anterior.hasta], ["2025-12-01", "2026-01-01"]);
  es("diciembre termina el 1 de enero", periodoPedido(undefined, "2026-12").actual.hasta, "2027-01-01");
  es("lo que no se entiende es hoy", periodoPedido("ayer", undefined, "2026-10-15").actual.desde, "2026-10-15");
}

console.log("\n── cuenta igual que el Dashboard ──");
{
  const r = { desde: "2026-10-01", hasta: "2026-11-01" };
  const ls = [
    lead("2026-10-02"),
    lead("2026-09-20", { estado: "Ganado", cierre: "2026-10-08", cerrada: 430 }),
    lead("2026-10-05", { estado: "Perdido", cierre: "2026-10-06", motivo: "Muy caro" }),
    lead("2026-09-25", { estado: "Perdido", cierre: "2026-09-30" }),
  ];
  const c = cortes(ls, r);
  es("nuevos por registro", c.nuevos.length, 2);
  es("ganados por cierre, aunque haya entrado en septiembre", c.ganados.length, 1);
  es("perdidos por cierre; el de septiembre no", c.perdidos.length, 1);
}

console.log("\n── el reporte del día ──");
{
  const p = periodoPedido("2026-10-14", undefined, "2026-10-15");
  const hoy = {
    ...vacio,
    leads: [
      lead("2026-10-14", { canal: "Instagram", etiquetas: [10] }),
      lead("2026-10-14", { canal: "Instagram", programas: [1, 2] }),
      lead("2026-10-14", { canal: "Feria", productoId: 2, producto: "Pastelería", programas: [2] }),
      lead("2026-10-01", { estado: "Ganado", cierre: "2026-10-14", cerrada: 430 }),
      lead("2026-10-10", { estado: "Perdido", cierre: "2026-10-14", motivo: "Muy caro", nota: "Le pareció caro; dijo que vuelve en enero." }),
      lead("2026-10-11", { estado: "Perdido", cierre: "2026-10-14", motivo: "Muy caro", productoId: 2, producto: "Pastelería" }),
      lead("2026-10-12", { estado: "Perdido", cierre: "2026-10-14", motivo: null }),
    ],
    mensajes: [{ quien: "Alexandra", mensajes: 40, conversaciones: 12 }],
    conversaciones: 12,
    movimientos: [{ quien: "Alexandra", etapas: 9, ganados: 1, perdidos: 3 }],
    notas: [{ quien: "Alexandra", notas: 5 }],
  };
  const ayer = { ...vacio, leads: [lead("2026-10-13"), lead("2026-10-13")] };
  const r = armarReporte(p.actual, hoy, ayer, p.anterior, catalogo);
  const v = Object.fromEntries(r.indicadores.map((i) => [i.clave, [i.valor, i.anterior, i.cambio]]));
  es("leads nuevos, con ayer y el cambio", v.nuevos, [3, 2, 50]);
  es("ganados y perdidos del día", [v.ganados[0], v.perdidos[0]], [1, 3]);
  es("la tasa de cierre en puntos", v.tasa, [33, 0, 33]);
  es("el monto de lo ganado", v.monto[0], 430);
  es("conversaciones y mensajes", [v.conversaciones[0], v.mensajes[0]], [12, 40]);
  es("canales: Instagram primero, con su porcentaje", r.canales[0], { canal: "Instagram", nuevos: 2, porcentaje: 67, ganados: 1, perdidos: 3 });
  const cocina = r.programas.find((x) => x.nombre === "Cocina");
  const paste = r.programas.find((x) => x.nombre === "Pastelería");
  es("un interesado en dos programas cuenta en los dos", [cocina.interesados, paste.interesados], [2, 2]);
  es("los programas traen su información", [cocina.categoria, cocina.precio, cocina.horario], ["Diplomado", 430, "Sábados"]);
  es("el dado de baja sin movimiento no aparece", r.programas.some((x) => x.nombre === "Viejo"), false);
  es("la etiqueta puesta se cuenta", r.etiquetas, [{ nombre: "Visita al instituto", color: "#8a5200", leads: 1 }]);
  es("POR QUÉ SE PIERDEN: el motivo, cuántos y dónde", r.motivos[0], { motivo: "Muy caro", leads: 2, porcentaje: 67, programaPrincipal: "Cocina", sinDecir: false });
  es("los sin motivo, al final y dichos", r.motivos[1].motivo, "Sin motivo anotado");
  es("cada perdido, uno por uno, con su comentario", r.perdidos.map((x) => [x.motivo, x.nota]), [
    ["Muy caro", "Le pareció caro; dijo que vuelve en enero."], ["Muy caro", ""], ["Sin motivo anotado", ""],
  ]);
  es("el listado del día tiene a todos", r.leads.length, 7);
  es("y dice qué le pasó a cada uno", r.leads.find((x) => x.estado === "Ganado").queTuvo, "Se ganó");
  es("las conclusiones lo dicen en palabras", r.conclusiones.some((c) => c.includes("«Muy caro»")), true);
  es("la asesora junta sus números", r.asesoras[0], { quien: "Alexandra", nuevos: 3, ganados: 1, perdidos: 3, conversaciones: 12, mensajes: 40, movimientos: 9, seguimientos: 5 });

  const csv = reporteACsv(r);
  es("el archivo empieza con BOM, para los acentos en Excel", csv.charCodeAt(0), 0xfeff);
  es("separa con punto y coma", csv.includes("Canal;Leads nuevos;% de los nuevos;Ganados;Perdidos"), true);
  es("y protege el texto con punto y coma adentro", csv.includes('"Le pareció caro; dijo que vuelve en enero."'), true);
}

console.log("\n── el reporte del mes: más corto, con semanas ──");
{
  const p = periodoPedido(undefined, "2026-10", "2026-10-15");
  const r = armarReporte(p.actual, { ...vacio, leads: [lead("2026-10-01"), lead("2026-10-09"), lead("2026-10-30")] }, null, null, catalogo);
  es("no trae el listado lead por lead", r.leads.length, 0);
  es("trae las semanas del mes", r.semanas.map((s) => [s.etiqueta, s.nuevos]), [
    ["Del 1 al 7", 1], ["Del 8 al 14", 1], ["Del 15 al 21", 0], ["Del 22 al 28", 0], ["Del 29 al 31", 1],
  ]);
  es("sin mes anterior, sin comparación", r.indicadores[0].anterior, null);
}

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
