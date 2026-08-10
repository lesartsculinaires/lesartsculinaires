/**
 * Detección de contactos repetidos por nombre, teléfono o correo.
 *
 * Vive acá y no en cada pantalla porque el mismo criterio se aplica en tres
 * lugares —el alta manual, la importación masiva y la verificación final del
 * servidor— y tienen que coincidir. Si el navegador avisara con una regla y
 * el servidor rechazara con otra, el usuario vería un error que no puede
 * explicarse.
 */

/** Minúsculas, sin acentos, sin espacios de más. */
export const normalizarTexto = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Deja sólo los dígitos y descarta el código de país.
 *
 * En la base conviven "7100-0001", "7100 0001" y "+503 7100 0001" para el
 * mismo teléfono. Comparar el texto crudo no encontraría ninguno de esos
 * pares. El corte a los últimos 8 dígitos es el largo de un número
 * salvadoreño; con menos de 8 no se compara, para que un "1234" suelto no
 * empareje con media base.
 */
export function normalizarTelefono(s: string | null | undefined): string | null {
  const digitos = String(s ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return digitos.slice(-8);
}

export const normalizarCorreo = (s: string | null | undefined): string | null => {
  const v = String(s ?? "").trim().toLowerCase();
  return v ? v : null;
};

/** Un contacto ya guardado, reducido a lo que hace falta para comparar. */
export interface ContactoConocido {
  clienteId: number;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  /** Código de una de sus oportunidades, para poder señalarla. */
  codigo?: string | null;
}

/** Por qué campo coincidieron dos contactos. */
export type MotivoDuplicado = "nombre" | "telefono" | "correo";

export interface Coincidencia extends ContactoConocido {
  motivos: MotivoDuplicado[];
}

export interface DatosContacto {
  nombre?: string | null;
  telefono?: string | null;
  correo?: string | null;
}

/**
 * Contactos ya existentes que coinciden con los datos dados.
 *
 * Los tres campos se evalúan por separado y se acumulan los motivos: saber
 * que coincide el correo *y* el teléfono es mucho más concluyente que saber
 * que coincide sólo el nombre, y quien decide necesita ver la diferencia.
 */
export function buscarDuplicados(
  datos: DatosContacto,
  conocidos: readonly ContactoConocido[],
): Coincidencia[] {
  const nombre = datos.nombre ? normalizarTexto(datos.nombre) : null;
  const telefono = normalizarTelefono(datos.telefono);
  const correo = normalizarCorreo(datos.correo);

  if (!nombre && !telefono && !correo) return [];

  const salida = new Map<number, Coincidencia>();

  for (const c of conocidos) {
    const motivos: MotivoDuplicado[] = [];

    if (correo && normalizarCorreo(c.correo) === correo) motivos.push("correo");
    if (telefono && normalizarTelefono(c.telefono) === telefono) motivos.push("telefono");
    if (nombre && normalizarTexto(c.nombre) === nombre) motivos.push("nombre");

    if (motivos.length === 0) continue;

    // El mismo cliente puede llegar repetido si el índice viene de las
    // oportunidades: se queda con la entrada de más motivos.
    const previo = salida.get(c.clienteId);
    if (!previo || motivos.length > previo.motivos.length) {
      salida.set(c.clienteId, { ...c, motivos });
    }
  }

  // Primero lo más concluyente: correo, después teléfono, después nombre.
  const peso = (m: MotivoDuplicado) => (m === "correo" ? 3 : m === "telefono" ? 2 : 1);
  const puntaje = (c: Coincidencia) => c.motivos.reduce((a, m) => a + peso(m), 0);

  return [...salida.values()].sort((a, b) => puntaje(b) - puntaje(a));
}

/** "correo y teléfono" — para armar el aviso en castellano. */
export function describirMotivos(motivos: readonly MotivoDuplicado[]): string {
  const nombres: Record<MotivoDuplicado, string> = {
    correo: "el correo",
    telefono: "el teléfono",
    nombre: "el nombre",
  };
  const lista = motivos.map((m) => nombres[m]);
  if (lista.length === 1) return lista[0];
  return `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
}
