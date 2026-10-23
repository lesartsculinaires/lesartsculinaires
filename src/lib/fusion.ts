/**
 * Fusión de un contacto nuevo con uno que ya existe.
 *
 * La regla de fondo es una sola: completar nunca borra. Un dato que ya está
 * guardado no se pisa con el que viene, porque el que está pudo haberse
 * corregido a mano y el que viene pudo salir de una planilla vieja. Los
 * huecos se llenan; los choques se muestran y los decide una persona.
 */

import { esTelefono, normalizarCorreo, normalizarTelefono, normalizarTexto } from "@/lib/duplicados";

/**
 * Lo que se guarda de un cliente y puede fusionarse.
 *
 * ------------------------------------------------------------------------
 * ESTA LISTA TIENE QUE CRECER CON LA TABLA
 * ------------------------------------------------------------------------
 *
 * Un campo que existe en `clientes` y no está acá se pierde en silencio al
 * unificar: el lead entra, se junta con el que ya estaba, y el dato nuevo que
 * traía no se escribe en ningún lado. Pasó con la edad y el responsable, que
 * se agregaron a la tabla y no acá, así que un menor cargado desde el
 * formulario perdía el nombre del adulto si coincidía con un contacto viejo.
 *
 * Si se agrega una columna a `clientes`, se agrega también en
 * `CAMPOS_DE_CLIENTE`, en `ETIQUETA_CAMPO` y en la lista que leen
 * `unificarCliente` e `importarClientes`.
 */
export interface DatosCliente {
  nombre?: string | null;
  telefono?: string | null;
  telefono_secundario?: string | null;
  correo?: string | null;
  territorio_id?: number | null;
  pais?: string | null;
  fecha_nacimiento?: string | null;
  edad?: number | null;
  responsable_nombre?: string | null;
  responsable_telefono?: string | null;
  responsable_correo?: string | null;
}

export type CampoFusion = keyof DatosCliente;

/**
 * Qué se intenta completar, en orden.
 *
 * `telefono_secundario` no está: no se completa desde el entrante sino que lo
 * llena el teléfono que choca con el primero, más abajo.
 */
export const CAMPOS_DE_CLIENTE: readonly CampoFusion[] = [
  "nombre",
  "telefono",
  "correo",
  "territorio_id",
  "pais",
  "fecha_nacimiento",
  "edad",
  "responsable_nombre",
  "responsable_telefono",
  "responsable_correo",
];

/** Las columnas que hay que leer del cliente para poder fusionarlo. */
export const COLUMNAS_DE_FUSION = ["id", "telefono_secundario", ...CAMPOS_DE_CLIENTE].join(", ");

export interface Choque {
  campo: CampoFusion;
  /** Lo que ya está guardado; se conserva. */
  actual: string;
  /** Lo que traía el registro nuevo; no se aplica. */
  entrante: string;
}

export interface PlanFusion {
  /** Columnas a escribir. Vacío significa que no hay nada que completar. */
  parche: DatosCliente;
  /** Campos que estaban vacíos y se llenaron. */
  completados: CampoFusion[];
  /** Datos distintos que se conservaron como estaban. */
  choques: Choque[];
}

const vacio = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "");

/** ¿Son el mismo dato escrito distinto? */
function equivalentes(campo: CampoFusion, a: string, b: string): boolean {
  if (campo === "correo") return normalizarCorreo(a) === normalizarCorreo(b);
  if (campo === "telefono" || campo === "telefono_secundario") {
    return normalizarTelefono(a) === normalizarTelefono(b);
  }
  return normalizarTexto(a) === normalizarTexto(b);
}

/**
 * ¿El nombre que llega es el mismo que el guardado, pero mejor escrito?
 *
 * La excepción a «lo que está no se pisa», pedida el 22/10/2026. La base de
 * egresados traía «Ana Rocio Rios Galvez» y la ficha decía «Ana +503-7559-
 * 7529» —el nombre que deja WhatsApp—; traía «Jaime Sergio Vásquez Zúniga» y
 * la ficha decía «Jaime Sergio V�squez Z�niga», de una planilla vieja que
 * se leyó con la codificación equivocada. Lo guardado ganaba y quedaba lo
 * peor. Se reemplaza sólo cuando no se pierde nada de lo que había:
 *
 *   LETRAS ROTAS      lo guardado tiene «�» y, salvo esas letras, es lo que
 *                     llega.
 *   SIN NOMBRE        lo guardado es un teléfono, o iniciales que calzan
 *                     con el que llega («FP» → «Francesco Padovani»).
 *   MÁS COMPLETO      cada palabra guardada está en el que llega, y el que
 *                     llega tiene más («Cecilia Monge» → «Cecilia Yamileth
 *                     Monge Blanco»). Un apodo («Feer Larios») no entra:
 *                     ahí decide una persona.
 */
export function nombreMasCompleto(actual: string, nuevo: string): boolean {
  const n = normalizarTexto(nuevo);
  if (!n || n.includes("\uFFFD")) return false;

  if (actual.includes("\uFFFD")) {
    const patron = normalizarTexto(actual)
      .split("\uFFFD")
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".{1,2}");
    if (new RegExp(`^${patron}$`).test(n)) return true;
  }

  const palabrasNuevas = n.split(" ");
  // Lo que deja WhatsApp («+503-7559-7529») no es parte del nombre.
  const guardadas = normalizarTexto(actual)
    .split(" ")
    .filter((p) => p && !/[\d+]/.test(p));

  if (guardadas.length === 0) return palabrasNuevas.length >= 2;
  // Iniciales: cada letra tiene que ser, en orden, la inicial de una palabra
  // del que llega («FP» → «Francesco Padovani»).
  const iniciales = guardadas.map((p) => p.replace(/\./g, ""));
  if (iniciales.every((p) => p.length <= 2)) {
    let i = 0;
    for (const letra of iniciales.join("")) {
      while (i < palabrasNuevas.length && palabrasNuevas[i][0] !== letra) i += 1;
      if (i === palabrasNuevas.length) return false;
      i += 1;
    }
    return palabrasNuevas.length >= 2;
  }
  return (
    palabrasNuevas.length > guardadas.length && guardadas.every((p) => palabrasNuevas.includes(p))
  );
}

/**
 * Qué habría que escribir para fusionar `entrante` sobre `existente`.
 *
 * El teléfono tiene un tratamiento aparte: cuando el contacto ya tiene uno y
 * llega otro distinto, el nuevo va al segundo teléfono si está libre en vez
 * de descartarse. Una persona con dos números es lo normal; perder el
 * segundo porque el primero ya estaba, no.
 */
export function planificarFusion(
  existente: DatosCliente,
  entrante: DatosCliente,
): PlanFusion {
  const parche: DatosCliente = {};
  const completados: CampoFusion[] = [];
  const choques: Choque[] = [];

  for (const campo of CAMPOS_DE_CLIENTE) {
    const nuevo = entrante[campo];
    if (vacio(nuevo)) continue;

    const actual = existente[campo];

    if (vacio(actual)) {
      (parche as Record<string, unknown>)[campo] = nuevo;
      completados.push(campo);
      continue;
    }

    const a = String(actual);
    const b = String(nuevo);
    if (equivalentes(campo, a, b)) continue;

    // Un «teléfono» que no es un número (el código de un grupo, por ejemplo)
    // se reemplaza por el número que llega: no hay nada que perder.
    if (campo === "telefono" && !esTelefono(a) && esTelefono(b)) {
      parche.telefono = b;
      completados.push("telefono");
      continue;
    }

    // El mismo nombre, mejor escrito: ver `nombreMasCompleto`.
    if (campo === "nombre" && nombreMasCompleto(a, b)) {
      parche.nombre = b;
      completados.push("nombre");
      continue;
    }

    // Un segundo teléfono no es un conflicto: es un dato más.
    if (campo === "telefono" && vacio(existente.telefono_secundario)) {
      parche.telefono_secundario = b;
      completados.push("telefono_secundario");
      continue;
    }

    choques.push({ campo, actual: a, entrante: b });
  }

  return { parche, completados, choques };
}

export const ETIQUETA_CAMPO: Record<CampoFusion, string> = {
  nombre: "Nombre",
  telefono: "Teléfono",
  telefono_secundario: "Teléfono secundario",
  correo: "Correo",
  territorio_id: "Territorio",
  pais: "País",
  fecha_nacimiento: "Cumpleaños",
  edad: "Edad",
  responsable_nombre: "Responsable",
  responsable_telefono: "Teléfono del responsable",
  responsable_correo: "Correo del responsable",
};

/** "Teléfono y Correo" — para contar qué se completó. */
export function listarCampos(campos: readonly CampoFusion[]): string {
  const n = campos.map((c) => ETIQUETA_CAMPO[c]);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
