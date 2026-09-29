/**
 * Qué conversación queda pendiente de contestar.
 *
 *     node --test supabase/pruebas/pendientes.test.mjs
 *
 * ============================================================================
 * LAS DOS COSAS QUE DEJAN UN HILO DEBIENDO
 * ============================================================================
 *
 *   MENSAJES SIN ABRIR   `sinLeer` los cuenta: alguien escribió y nadie entró.
 *
 *   MARCADA A MANO       `noLeida` la pone una persona que SÍ leyó y decidió
 *                        que todavía le debe algo a ese cliente.
 *
 * La segunda es la que se pierde. El hilo se ve igual que cualquier otro y el
 * contador dice cero, así que una regla que sólo mirara `sinLeer` escondería
 * justo los hilos que alguien dejó marcados a propósito —o sea, los que más
 * importan—.
 *
 * La bandeja ya usaba esta condición en tres lugares, escrita a mano cada vez.
 * Con el filtro nuevo serían cuatro, y para cuatro copias alcanza con que una
 * se olvide de `noLeida`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compilar } from "./compilar.mjs";

const { estaPendiente, cuantosPendientes } = await compilar("src/lib/pendientes.ts");

const hilo = (extra) => ({ sinLeer: 0, noLeida: false, archivada: false, ...extra });

test("── LAS DOS FORMAS DE QUEDAR PENDIENTE ──", () => {
  assert.equal(estaPendiente(hilo({ sinLeer: 3 })), true);

  // La marcada a mano: contador en cero y pendiente igual. Es la que se perdía.
  assert.equal(estaPendiente(hilo({ sinLeer: 0, noLeida: true })), true);

  // Y las dos a la vez, que pasa cuando entran mensajes en un hilo ya marcado.
  assert.equal(estaPendiente(hilo({ sinLeer: 2, noLeida: true })), true);
});

test("── UN HILO AL DÍA NO ESTÁ PENDIENTE ──", () => {
  assert.equal(estaPendiente(hilo({})), false);
});

test("── ARCHIVAR NO ES LEER ──", () => {
  /*
   * `estaPendiente` no mira `archivada` a propósito: archivar es una decisión
   * aparte, y quien abre la pestaña de archivadas tiene derecho a ver cuáles
   * quedaron debiendo. Quién los muestra lo decide la pantalla.
   */
  assert.equal(estaPendiente(hilo({ sinLeer: 1, archivada: true })), true);
  assert.equal(estaPendiente(hilo({ noLeida: true, archivada: true })), true);
});

test("── EL NÚMERO DE LA PESTAÑA CUENTA SÓLO LOS ACTIVOS ──", () => {
  /*
   * Los archivados quedan afuera del contador aunque estén pendientes: se
   * archivan para sacarlos de la vista, y un número que los contara mandaría a
   * buscar un hilo que la pestaña no muestra. Ese es el peor número: el que no
   * cuadra con lo que se ve.
   */
  const bandeja = [
    hilo({ sinLeer: 4 }),
    hilo({ noLeida: true }),
    hilo({}),
    hilo({ sinLeer: 9, archivada: true }),
    hilo({ noLeida: true, archivada: true }),
  ];

  assert.equal(cuantosPendientes(bandeja), 2);
});

test("── UNA BANDEJA AL DÍA CUENTA CERO ──", () => {
  // Y cero es lo que hace que la pastilla no se dibuje, así que la pestaña se
  // ve limpia cuando no hay nada que hacer.
  assert.equal(cuantosPendientes([hilo({}), hilo({})]), 0);
  assert.equal(cuantosPendientes([]), 0);
});
