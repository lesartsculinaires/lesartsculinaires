/**
 * Las cuentas del Calendario: hora de El Salvador, grillas y cruces.
 *
 *     node --test supabase/pruebas/calendario.test.mjs
 *
 * Lo que más importa es la hora: El Salvador es UTC−6, y una llamada de las
 * 7 p. m. en el ISO ya es del día siguiente. Antes el calendario agrupaba por
 * esa fecha UTC y la mostraba un día tarde.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const c = await compilar("src/lib/calendario.ts");

test("la hora es la de El Salvador, aunque el ISO ya sea de mañana", () => {
  const iso = "2026-11-13T01:00:00.000Z"; // 12/11 a las 19:00 en El Salvador
  assert.equal(c.diaSV(iso), "2026-11-12");
  assert.equal(c.horaSV(iso), "19:00");
  assert.equal(c.minutoSV(iso), 19 * 60);
  assert.equal(c.horaInputSV("2026-11-12T15:05:00.000Z"), "09:05");
});

test("de fecha y hora de El Salvador al ISO, ida y vuelta", () => {
  const iso = c.isoDesdeSV("2026-11-12", "19:30");
  assert.equal(iso, "2026-11-13T01:30:00.000Z");
  assert.equal(c.diaSV(iso), "2026-11-12");
  assert.equal(c.horaInputSV(iso), "19:30");
});

test("hoy en El Salvador a la medianoche UTC sigue siendo ayer", () => {
  assert.equal(c.hoySV(new Date("2026-11-13T03:00:00.000Z")), "2026-11-12");
});

test("la semana va de domingo a sábado", () => {
  const s = c.semanaDe("2026-11-12"); // jueves
  assert.equal(s[0], "2026-11-08");
  assert.equal(s[6], "2026-11-14");
  assert.equal(c.diaDeLaSemana(s[0]), 0);
});

test("la grilla del mes empieza en domingo y cubre el mes entero", () => {
  const g = c.grillaDelMes("2026-11-12");
  assert.equal(g[0][0], "2026-11-01"); // noviembre de 2026 empieza en domingo
  assert.ok(g.flat().includes("2026-11-30"));
  assert.equal(g.length, 5);
  const feb = c.grillaDelMes("2026-02-10"); // empieza en domingo y tiene 28
  assert.equal(feb.length, 4);
  for (const semana of c.grillaDelMes("2026-08-01")) assert.equal(semana.length, 7);
  assert.equal(c.grillaDelMes("2026-08-01").length, 6);
});

test("moverse un mes desde el 31 cae en el último día", () => {
  assert.equal(c.sumarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(c.sumarMeses("2026-12-15", 1), "2027-01-15");
  assert.equal(c.moverRango("semana", "2026-11-12", -1), "2026-11-05");
  assert.equal(c.moverRango("dia", "2026-12-31", 1), "2027-01-01");
});

test("los títulos de la barra", () => {
  assert.equal(c.tituloDelRango("mes", "2026-11-12"), "noviembre de 2026");
  assert.equal(c.tituloDelRango("semana", "2026-11-12"), "8 – 14 de noviembre de 2026");
  assert.equal(c.tituloDelRango("semana", "2026-12-02"), "29 nov – 5 dic de 2026");
  assert.equal(c.tituloDelRango("dia", "2026-11-12"), "jueves, 12 de noviembre de 2026");
});

const ev = (id, hora, dur) => ({ id, iniciaEn: c.isoDesdeSV("2026-11-12", hora), duracionMin: dur });

test("los que se cruzan van lado a lado; los que no, a todo el ancho", () => {
  const a = c.acomodarDia([ev(1, "09:00", 60), ev(2, "09:30", 30), ev(3, "11:00", 30)]);
  const por = Object.fromEntries(a.map((x) => [x.id, x]));
  assert.deepEqual([por[1].carril, por[1].carriles], [0, 2]);
  assert.deepEqual([por[2].carril, por[2].carriles], [1, 2]);
  assert.deepEqual([por[3].carril, por[3].carriles], [0, 1]);
});

test("uno que termina cuando empieza otro no se cruza", () => {
  const a = c.acomodarDia([ev(1, "09:00", 30), ev(2, "09:30", 30)]);
  assert.ok(a.every((x) => x.carriles === 1 && x.carril === 0));
});

test("un carril que se libera se vuelve a usar", () => {
  const a = c.acomodarDia([ev(1, "09:00", 120), ev(2, "09:00", 30), ev(3, "09:45", 30)]);
  const por = Object.fromEntries(a.map((x) => [x.id, x]));
  assert.equal(por[1].carril, 0);
  assert.equal(por[2].carril, 1);
  assert.equal(por[3].carril, 1);
  assert.ok(a.every((x) => x.carriles === 2));
});

test("los cortos ocupan al menos 20 minutos en pantalla", () => {
  const [x] = c.acomodarDia([ev(1, "10:00", 15)]);
  assert.equal(x.hasta - x.desde, 20);
});

test("crear con un clic redondea al cuarto de hora", () => {
  assert.equal(c.alCuarto(9 * 60 + 44), 9 * 60 + 30);
  assert.equal(c.horaDeMinuto(c.alCuarto(23 * 60 + 59)), "23:45");
  assert.equal(c.etiquetaDeHora(0), "12 a. m.");
  assert.equal(c.etiquetaDeHora(13), "1 p. m.");
});
