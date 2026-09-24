/**
 * El aviso de que falta poco para una llamada agendada.
 *
 *     node --test supabase/pruebas/avisoDeEvento.test.mjs
 *
 * ============================================================================
 * POR QUÉ SE PRUEBA ACÁ Y NO EN EL NAVEGADOR
 * ============================================================================
 *
 * Porque lo que puede salir mal es el reloj, y en un navegador habría que
 * esperar. Acá la hora se pasa como dato: «faltan once minutos» y «faltan
 * nueve» se comprueban en el mismo milisegundo.
 *
 * Los dos errores que rompen esto de verdad son los bordes. Si avisa a los
 * once minutos, avisa de más y molesta; si deja de avisar justo a la hora,
 * puede no avisar nunca, porque el reloj del CRM corre cada medio minuto y la
 * llamada de las 13:30 cae en el hueco entre dos vueltas. Los dos bordes
 * tienen su comprobación.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { avisosDeAgenda, meToca, cuantoFalta, llaveDelAviso, minutosHasta } =
  await compilar("src/lib/avisoDeEvento.ts");

const AHORA = new Date("2026-09-24T13:20:00.000Z");

/** Un evento, con lo justo para esta regla. */
const evento = (extra = {}) => ({
  id: 1,
  oportunidadId: 7,
  tipoId: 1,
  vendedorId: 5,
  creadoPor: 5,
  iniciaEn: "2026-09-24T13:30:00.000Z", // faltan 10
  duracionMin: 30,
  canal: "Llamada",
  estado: "Pendiente",
  resultado: null,
  proximaAccion: null,
  ...extra,
});

const YO = { vendedorId: 5 };

test("── LOS DOS BORDES DE LA VENTANA ──", () => {
  // Justo a los diez: entra. Es lo que pidió la escuela.
  assert.equal(avisosDeAgenda([evento()], YO, AHORA).length, 1);

  // A los once: todavía no. Avisar de más es lo que hace que se ignore.
  const once = evento({ iniciaEn: "2026-09-24T13:31:00.000Z" });
  assert.equal(avisosDeAgenda([once], YO, AHORA).length, 0);

  // Justo a la hora: SIGUE AVISANDO. Si se cortara acá, una llamada podría
  // caer en el hueco entre dos vueltas del reloj y no avisar nunca.
  const ahora = evento({ iniciaEn: "2026-09-24T13:20:00.000Z" });
  assert.equal(avisosDeAgenda([ahora], YO, AHORA).length, 1);

  // Un minuto tarde: todavía, por el margen.
  const tarde = evento({ iniciaEn: "2026-09-24T13:19:00.000Z" });
  assert.equal(avisosDeAgenda([tarde], YO, AHORA).length, 1);

  // Cinco minutos tarde: ya no. Un cartel que no se va deja de leerse.
  const vieja = evento({ iniciaEn: "2026-09-24T13:15:00.000Z" });
  assert.equal(avisosDeAgenda([vieja], YO, AHORA).length, 0);
});

test("── A QUIÉN LE TOCA ──", () => {
  // A quien la atiende.
  assert.equal(meToca(evento({ vendedorId: 5, creadoPor: 9 }), YO), true);

  // Y A QUIEN LA AGENDÓ, que es lo que se pidió: la jefa agenda para la
  // asesora y quiere saber que está por pasar.
  assert.equal(meToca(evento({ vendedorId: 9, creadoPor: 5 }), YO), true);

  // A nadie más.
  assert.equal(meToca(evento({ vendedorId: 9, creadoPor: 9 }), YO), false);

  // Dirección entra sin ficha de vendedor: no le saltan las llamadas de todo
  // el equipo, que sería ruido puro.
  assert.equal(meToca(evento(), { vendedorId: null }), false);
});

test("── SALTA UNA SOLA VEZ AUNQUE SEA LAS DOS COSAS ──", () => {
  // El caso normal: la asesora se agenda su propia llamada.
  const suyo = evento({ vendedorId: 5, creadoPor: 5 });
  assert.equal(avisosDeAgenda([suyo], YO, AHORA).length, 1);
});

test("── UN EVENTO VIEJO, SIN AUTOR ANOTADO ──", () => {
  // Los de antes de la migración tienen `creadoPor` nulo. Le tiene que seguir
  // avisando a quien lo atiende: lo que falta es el segundo destinatario, no
  // el aviso entero.
  const viejo = evento({ creadoPor: null });
  assert.equal(avisosDeAgenda([viejo], YO, AHORA).length, 1);

  // Y a quien no lo atiende, nada: sin autor no hay a quién más avisarle.
  assert.equal(avisosDeAgenda([viejo], { vendedorId: 9 }, AHORA).length, 0);
});

test("── LO QUE YA SE ATENDIÓ NO AVISA ──", () => {
  for (const estado of ["Realizado", "No se presentó", "Reagendado"]) {
    assert.equal(
      avisosDeAgenda([evento({ estado })], YO, AHORA).length,
      0,
      `«${estado}» no tendría que avisar`,
    );
  }
});

test("── SI SE JUNTAN DOS, PRIMERO LA QUE EMPIEZA ANTES ──", () => {
  const a = evento({ id: 1, iniciaEn: "2026-09-24T13:29:00.000Z" }); // faltan 9
  const b = evento({ id: 2, iniciaEn: "2026-09-24T13:23:00.000Z" }); // faltan 3
  const r = avisosDeAgenda([a, b], YO, AHORA);
  assert.deepEqual(r.map((x) => x.evento.id), [2, 1]);
});

test("── EL NÚMERO REDONDEA HACIA ARRIBA ──", () => {
  // A nueve minutos y medio tiene que decir 10, no 9: quedarse corto es el
  // error que hace llegar tarde.
  const medio = new Date("2026-09-24T13:20:30.000Z");
  assert.equal(minutosHasta("2026-09-24T13:30:00.000Z", medio), 10);

  // Una fecha rota devuelve null en vez de un número inventado.
  assert.equal(minutosHasta("no es una fecha", AHORA), null);
});

test("── CÓMO SE LEE ──", () => {
  assert.equal(cuantoFalta(10), "En 10 minutos");
  assert.equal(cuantoFalta(1), "En 1 minuto");
  assert.equal(cuantoFalta(0), "Es ahora");
  // Nunca un número negativo en pantalla.
  assert.equal(cuantoFalta(-1), "Es ahora");
});

test("── REAGENDAR VUELVE A AVISAR ──", () => {
  // La llave lleva la hora, no sólo el id: mover una llamada de las 10 a las
  // 15 es un aviso nuevo. Con el id solo se quedaba en silencio.
  const antes = llaveDelAviso(evento());
  const despues = llaveDelAviso(evento({ iniciaEn: "2026-09-24T18:00:00.000Z" }));
  assert.notEqual(antes, despues);

  // Y el mismo evento sin mover da la misma llave, o avisaría en cada vuelta
  // del reloj.
  assert.equal(llaveDelAviso(evento()), antes);
});
