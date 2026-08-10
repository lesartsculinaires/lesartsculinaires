/**
 * Validación del alta de clientes.
 *
 * Separada de la pantalla para que el mismo criterio valga en el navegador y
 * en el servidor. Devuelve la lista de problemas en vez de un booleano: para
 * poder señalar cada campo y explicar qué le falta, "es inválido" no alcanza.
 */

/** Campos del formulario que pueden fallar. */
export type CampoCliente =
  | "nombre"
  | "telefono"
  | "correo"
  | "fecha_registro"
  | "fecha_cierre"
  | "valor_oportunidad";

export interface Problema {
  campo: CampoCliente;
  mensaje: string;
  /** Impide guardar. Un aviso sólo advierte. */
  bloquea: boolean;
}

/** Los que no se pueden dejar vacíos. */
export const OBLIGATORIOS: readonly CampoCliente[] = ["nombre", "fecha_registro"];

export const ETIQUETAS: Record<CampoCliente, string> = {
  nombre: "Nombre",
  telefono: "Teléfono",
  correo: "Correo",
  fecha_registro: "Fecha de registro",
  fecha_cierre: "Fecha de cierre",
  valor_oportunidad: "Valor de la oportunidad",
};

export interface DatosAlta {
  nombre: string;
  telefono: string | null;
  correo: string | null;
  fecha_registro: string;
  fecha_cierre: string | null;
  valor_oportunidad: number | null;
}

/**
 * Forma de correo aceptable.
 *
 * Deliberadamente permisiva: validar direcciones a rajatabla rechaza
 * direcciones legítimas raras. Sólo atrapa lo que es claramente un error de
 * tipeo —sin arroba, sin punto, con espacios—.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarAlta(d: DatosAlta): Problema[] {
  const p: Problema[] = [];

  if (!d.nombre.trim()) {
    p.push({ campo: "nombre", mensaje: "Poné el nombre del cliente.", bloquea: true });
  } else if (d.nombre.trim().length < 2) {
    p.push({ campo: "nombre", mensaje: "El nombre es demasiado corto.", bloquea: true });
  }

  if (!d.fecha_registro) {
    p.push({ campo: "fecha_registro", mensaje: "Poné la fecha de registro.", bloquea: true });
  }

  // Los opcionales sólo se revisan si tienen algo: vacío es una respuesta
  // válida, mal escrito no.
  if (d.correo && !CORREO.test(d.correo.trim())) {
    p.push({ campo: "correo", mensaje: "Ese correo no parece válido.", bloquea: true });
  }

  if (d.telefono) {
    const digitos = d.telefono.replace(/\D/g, "");
    if (digitos.length < 8) {
      p.push({
        campo: "telefono",
        mensaje: "Un teléfono lleva al menos 8 dígitos.",
        bloquea: true,
      });
    }
  }

  if (d.valor_oportunidad != null && d.valor_oportunidad < 0) {
    p.push({
      campo: "valor_oportunidad",
      mensaje: "El valor no puede ser negativo.",
      bloquea: true,
    });
  }

  // Cerrar antes de registrar es casi siempre un error de tipeo, pero no
  // imposible: una matrícula cargada tarde. Se avisa sin bloquear.
  if (d.fecha_cierre && d.fecha_registro && d.fecha_cierre < d.fecha_registro) {
    p.push({
      campo: "fecha_cierre",
      mensaje: "La fecha de cierre es anterior a la de registro.",
      bloquea: false,
    });
  }

  return p;
}

/** Sólo los que impiden guardar. */
export const bloqueantes = (p: readonly Problema[]): Problema[] =>
  p.filter((x) => x.bloquea);

/** "Nombre y Correo" — para el encabezado del aviso. */
export function listarCampos(p: readonly Problema[]): string {
  const nombres = [...new Set(p.map((x) => ETIQUETAS[x.campo]))];
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
