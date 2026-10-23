import { compilar } from "./compilar.mjs";
/**
 * Cursos y diplomados vendidos, y quién los vendió.
 *
 *     node supabase/pruebas/vendidos.test.mjs
 *
 * Pedido el 23/10/2026: en el Dashboard y en los reportes del día y del mes,
 * cuántos cursos y cuántos diplomados se vendieron y cuántos de cada uno
 * vendió cada asesora. Los tipos salen de la categoría del programa en el
 * catálogo de Les Arts: «Curso corto», «Diplomado», «Certificación», «Otro».
 */
const { contarVendidos, tipoDePrograma, decirVendidos } = await compilar("src/lib/vendidos.ts");

let f = 0;
const es = (t, r, e) => {
  const ok = JSON.stringify(r) === JSON.stringify(e);
  if (!ok) {
    f++;
    console.log(`✗ ${t}\n   dio ${JSON.stringify(r)}\n   esperaba ${JSON.stringify(e)}`);
  } else console.log(`✓ ${t}`);
};

console.log("── el tipo sale de la categoría ──");
es("Curso corto → curso", tipoDePrograma("Curso corto"), "curso");
es("Diplomado → diplomado", tipoDePrograma("Diplomado"), "diplomado");
es("Certificación → otro", tipoDePrograma("Certificación"), "otro");
es("Otro → otro", tipoDePrograma("Otro"), "otro");
es("sin categoría → otro", tipoDePrograma(null), "otro");

console.log("\n── un día de ventas ──");
const v = contarVendidos([
  { quien: "Alexandra Ramos", programa: "Curso corto Cocina Nikkei", categoria: "Curso corto", monto: 150 },
  { quien: "Alexandra Ramos", programa: "Diplomado Superior de Cocina Internacional", categoria: "Diplomado", monto: 1200 },
  { quien: "Alexandra Ramos", programa: "Diplomado Superior de Cocina Internacional", categoria: "Diplomado", monto: 1200 },
  { quien: "Estefany Gonzalez", programa: "Curso corto Cocina Nikkei", categoria: "Curso corto", monto: 150 },
  { quien: "Estefany Gonzalez", programa: "Workshop", categoria: "Otro", monto: 40 },
  { quien: null, programa: null, categoria: null, monto: 0 },
]);
es("cursos, diplomados, otros y total", [v.cursos, v.diplomados, v.otros, v.total], [2, 2, 2, 6]);
es("la suma da el total de ganados", v.cursos + v.diplomados + v.otros, v.total);
es("montos por tipo", [v.montoCursos, v.montoDiplomados, v.montoOtros], [300, 2400, 40]);
es("por asesora, de quien más vendió a quien menos", v.porAsesora.map((a) => [a.quien, a.cursos, a.diplomados, a.otros, a.total, a.monto]), [
  ["Alexandra Ramos", 1, 2, 0, 3, 2550],
  ["Estefany Gonzalez", 1, 0, 1, 2, 190],
  ["Sin asignar", 0, 0, 1, 1, 0],
]);
es("qué programas se vendieron", v.porPrograma.map((p) => [p.programa, p.tipo, p.ventas]), [
  ["Curso corto Cocina Nikkei", "curso", 2],
  ["Diplomado Superior de Cocina Internacional", "diplomado", 2],
  ["Sin programa elegido", "otro", 1],
  ["Workshop", "otro", 1],
]);
es("se dice en palabras", decirVendidos(v.porAsesora[0]), "1 curso y 2 diplomados");
es("con otros", decirVendidos(v), "2 cursos, 2 diplomados y 2 otros programas");
es("lo que está en cero no se dice", decirVendidos({ cursos: 0, diplomados: 1, otros: 0 }), "1 diplomado");
es("y sin nada", decirVendidos({ cursos: 0, diplomados: 0, otros: 0 }), "ningún curso ni diplomado");

console.log("\n── sin ventas ──");
const nada = contarVendidos([]);
es("todo en cero y sin filas", [nada.total, nada.porAsesora.length, nada.porPrograma.length], [0, 0, 0]);

console.log(f === 0 ? "\nTodo bien." : `\n${f} fallaron.`);
process.exit(f ? 1 : 0);
