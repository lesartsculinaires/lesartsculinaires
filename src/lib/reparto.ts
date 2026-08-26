/**
 * A quién le toca el lead que acaba de entrar.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ AL AZAR Y NO POR TURNOS
 * ------------------------------------------------------------------------
 *
 * Repartir por turnos —uno a cada quien, en orden— deja las cargas exactamente
 * parejas, pero para eso hay que recordar a quién le tocó el último. Ese dato
 * hay que guardarlo, leerlo y escribirlo con cada mensaje, y dos mensajes que
 * entran en el mismo segundo pueden leer el mismo turno y dárselo a la misma
 * persona.
 *
 * Al azar no recuerda nada, así que no tiene ese problema ni ese estado. A
 * cambio, las cargas quedan parejas «en promedio» y no exactas: con veinte
 * leads y dos personas, un 12–8 es perfectamente normal. La escuela decidió
 * que eso no importa, y con esa decisión el camino simple es también el
 * correcto.
 *
 * ------------------------------------------------------------------------
 * POR QUÉ ESTÁ SOLO EN SU ARCHIVO
 * ------------------------------------------------------------------------
 *
 * Para poder tirar mil veces y mirar cómo repartió, sin base, sin red y sin
 * levantar nada. Un reparto torcido no se nota mirando: se nota tres meses
 * después, cuando alguien dice que siempre le tocan a ella.
 */

/** Lo mínimo que hace falta saber de un candidato para sortear. */
export interface Candidato {
  id: number;
  nombre: string;
}

/**
 * Uno al azar, o nulo si no hay ninguno.
 *
 * `azar` se recibe en vez de llamar a `Math.random()` adentro justamente para
 * poder probarlo: en las pruebas entra una función que devuelve lo que se le
 * pida, y en producción entra la de verdad.
 */
export function sortear(
  candidatos: readonly Candidato[],
  azar: () => number = Math.random,
): Candidato | null {
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  // `Math.min` es el cinturón de seguridad: si `azar()` devolviera exactamente
  // 1 —no debería, pero es una función que viene de afuera— el índice se iría
  // una posición más allá del final y esto devolvería `undefined` en vez de un
  // candidato, con el lead quedando sin asignar y sin que nadie sepa por qué.
  const i = Math.min(Math.floor(azar() * candidatos.length), candidatos.length - 1);
  return candidatos[i];
}

/**
 * ¿Este cliente ya tiene un lead, del tipo que sea?
 *
 * Con esto alcanza para las dos reglas que pidió la escuela, y por eso no hay
 * dos funciones:
 *
 *   Tiene uno abierto      no se abre otro, y sigue siendo de quien lo venía
 *                          atendiendo. Que un cliente hable dos veces no lo
 *                          convierte en dos clientes.
 *
 *   Los tiene cerrados     tampoco se abre otro. Un ex-alumno que vuelve a
 *                          escribir se atiende sobre su ficha, donde está lo
 *                          que ya cursó; si hace falta abrirle una venta
 *                          nueva, eso lo decide una persona mirando.
 *
 * ------------------------------------------------------------------------
 * QUIÉN APLICA ESTA REGLA HOY
 * ------------------------------------------------------------------------
 *
 * La base, en `abrir_lead_de_whatsapp`. Acá quedó escrita porque es donde se
 * explica, y porque la prueba de la regla vive al lado; pero el webhook ya no
 * la llama y NO hay que volver a llamarla desde ahí.
 *
 * El motivo es que preguntar esto desde el servidor obliga a un viaje a la
 * base para preguntar y otro para escribir, y entre los dos entra el mensaje
 * siguiente de la misma persona: pregunta antes de que el primero haya
 * escrito, recibe «todavía no», y abre un segundo lead con otro asesor. Eso es
 * lo que duplicaba los leads de WhatsApp. La base lo resuelve en una sola
 * llamada, con candado, que es la única forma de que no quede hueco.
 */
export const yaEsLead = (cuantasOportunidades: number): boolean =>
  cuantasOportunidades > 0;

/** Los meses que se dejan pasar antes de volver a escribirle a quien dijo que no. */
export const MESES_PARA_REACTIVAR = 3;

/**
 * Cuándo volver a escribirle, en YYYY-MM-DD.
 *
 * Se cuenta por calendario y no por días: «tres meses» dicho un 31 de enero es
 * el 30 de abril, no el 1 de mayo. Y el recorte del final es por los meses
 * cortos —un 31 de noviembre no existe—, que sin esto se desbordarían al mes
 * siguiente en silencio.
 */
export function fechaDeReactivacion(desde: string, meses = MESES_PARA_REACTIVAR): string {
  const [a, m, d] = desde.split("-").map(Number);
  const total = m - 1 + meses;
  const anio = a + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
