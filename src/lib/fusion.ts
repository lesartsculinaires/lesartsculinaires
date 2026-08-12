/**
 * Fusión de un contacto nuevo con uno que ya existe.
 *
 * La regla de fondo es una sola: completar nunca borra. Un dato que ya está
 * guardado no se pisa con el que viene, porque el que está pudo haberse
 * corregido a mano y el que viene pudo salir de una planilla vieja. Los
 * huecos se llenan; los choques se muestran y los decide una persona.
 */

import { normalizarCorreo, normalizarTelefono, normalizarTexto } from "@/lib/duplicados";

/** Lo que se guarda de un cliente y puede fusionarse. */
export interface DatosCliente {
  nombre?: string | null;
  telefono?: string | null;
  telefono_secundario?: string | null;
  correo?: string | null;
  territorio_id?: number | null;
}

export type CampoFusion = keyof DatosCliente;

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

  const campos: CampoFusion[] = ["nombre", "telefono", "correo", "territorio_id"];

  for (const campo of campos) {
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
};

/** "Teléfono y Correo" — para contar qué se completó. */
export function listarCampos(campos: readonly CampoFusion[]): string {
  const n = campos.map((c) => ETIQUETA_CAMPO[c]);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
