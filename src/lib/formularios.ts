/**
 * Un formulario de feria, y qué hacer con lo que se contesta.
 *
 * Acá vive lo que se puede comprobar sin base y sin navegador: si una
 * respuesta está completa, qué campos del lead salen de ella, y qué se escribe
 * en la nota con lo que no cabe en ningún campo.
 *
 * Está separado del alta de leads a propósito. `altaLead` sabe crear un lead
 * —y avisar de duplicados, y asignar el código—; esto sabe leer un formulario.
 * Juntarlos haría que cada pregunta nueva de una feria tuviera que pasar por
 * el alta, que es el camino por donde entra todo lo demás.
 */

export type TipoCampo =
  | "texto"
  | "parrafo"
  | "telefono"
  | "correo"
  | "numero"
  | "opcion"
  | "opciones";

/** Los campos del lead que una pregunta puede alimentar. */
export type Mapeo =
  | "nombre"
  | "telefono"
  | "correo"
  | "edad"
  | "responsable_nombre"
  | "responsable_telefono"
  | "responsable_correo"
  | "producto_id"
  | "territorio_id";

export interface Opcion {
  texto: string;
  /** Id de catálogo, cuando la pregunta alimenta uno. Null si es sólo texto. */
  valor: number | null;
}

export interface Campo {
  id: number;
  orden: number;
  etiqueta: string;
  ayuda: string | null;
  tipo: TipoCampo;
  requerido: boolean;
  opciones: Opcion[];
  mapeaA: Mapeo | null;
}

export interface Formulario {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  canalId: number | null;
  etapaId: number | null;
  estadoId: number | null;
  territorioId: number | null;
  campos: Campo[];
  /** Cuántos leads entraron por acá. */
  respuestas: number;
}

/** Lo tecleado, por id de campo. Las de opción múltiple guardan un arreglo. */
export type Respuestas = Record<number, string | string[]>;

// ------------------------------------------------------------------ revisar

/** Un problema por campo, para poder pintarlo al lado de su pregunta. */
export type Problemas = Record<number, string>;

const SOLO_DIGITOS = /\D+/g;

/**
 * Un correo con forma de correo.
 *
 * Deliberadamente flojo: algo, arroba, algo, punto, algo. Las expresiones
 * estrictas rechazan direcciones válidas raras pero reales, y en una feria eso
 * significa un lead que no se puede cargar con la persona parada enfrente. Lo
 * que hay que atajar es el dedazo —falta la arroba, sobra un espacio—, no
 * certificar que la casilla existe.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ¿Se puede guardar esto?
 *
 * Devuelve un mapa vacío cuando está todo bien. Se revisa campo por campo y no
 * de a uno: con una sola queja por vez, completar un formulario de siete
 * preguntas puede llevar siete intentos.
 */
export function revisar(campos: readonly Campo[], respuestas: Respuestas): Problemas {
  const problemas: Problemas = {};

  for (const campo of campos) {
    const cruda = respuestas[campo.id];
    const texto = Array.isArray(cruda) ? cruda.join(", ") : (cruda ?? "");
    const vacio = texto.trim() === "";

    if (campo.requerido && vacio) {
      problemas[campo.id] = "Falta contestar esto.";
      continue;
    }
    // Lo que quedó en blanco y no era obligatorio no se revisa: un teléfono
    // vacío no es un teléfono mal escrito.
    if (vacio) continue;

    if (campo.tipo === "correo" && !CORREO.test(texto.trim())) {
      problemas[campo.id] = "Ese correo no parece completo.";
      continue;
    }

    if (campo.tipo === "telefono") {
      const digitos = texto.replace(SOLO_DIGITOS, "");
      if (digitos.length < 8) {
        problemas[campo.id] = "Un teléfono lleva ocho dígitos como mínimo.";
        continue;
      }
    }

    if (campo.tipo === "numero" && Number.isNaN(Number(texto.trim()))) {
      problemas[campo.id] = "Esto tiene que ser un número.";
      continue;
    }

    // Una opción que no está en la lista sólo puede venir de una pantalla
    // vieja: alguien dejó el formulario abierto y mientras tanto se editó la
    // pregunta. Guardarla dejaría un valor que ninguna pantalla sabe mostrar.
    if (campo.tipo === "opcion" || campo.tipo === "opciones") {
      const validas = campo.opciones.map((o) => o.texto);
      const elegidas = Array.isArray(cruda) ? cruda : [texto];
      if (elegidas.some((e) => !validas.includes(e))) {
        problemas[campo.id] = "Esa opción ya no está en la pregunta. Volvé a elegir.";
      }
    }
  }

  return problemas;
}

export const estaCompleto = (campos: readonly Campo[], r: Respuestas): boolean =>
  Object.keys(revisar(campos, r)).length === 0;

// -------------------------------------------------------------- armar el lead

export interface DatosDelLead {
  nombre: string;
  telefono: string | null;
  correo: string | null;
  edad: number | null;
  responsable_nombre: string | null;
  responsable_telefono: string | null;
  responsable_correo: string | null;
  producto_id: number | null;
  territorio_id: number | null;
}

const VACIO: DatosDelLead = {
  nombre: "",
  telefono: null,
  correo: null,
  edad: null,
  responsable_nombre: null,
  responsable_telefono: null,
  responsable_correo: null,
  producto_id: null,
  territorio_id: null,
};

/**
 * Lo contestado, convertido en los campos del lead.
 *
 * Las preguntas que no declaran `mapeaA` no aparecen acá y no es un olvido:
 * van a la nota. Un formulario de feria pregunta cosas que no tienen columna
 * —el centro educativo, si quiere una MasterClass— y forzarlas dentro de un
 * campo que casi encaja es peor que dejarlas escritas donde se leen.
 */
export function armarLead(campos: readonly Campo[], respuestas: Respuestas): DatosDelLead {
  const lead: DatosDelLead = { ...VACIO };

  for (const campo of campos) {
    if (!campo.mapeaA) continue;

    const cruda = respuestas[campo.id];
    const texto = (Array.isArray(cruda) ? cruda[0] : cruda)?.trim() ?? "";
    if (texto === "") continue;

    switch (campo.mapeaA) {
      case "nombre":
        lead.nombre = texto;
        break;
      case "edad": {
        const n = Number(texto);
        lead.edad = Number.isFinite(n) ? Math.round(n) : null;
        break;
      }
      case "producto_id":
      case "territorio_id": {
        // De un catálogo no se guarda el texto sino el id que trae la opción.
        // Sin eso, «Mixología» sería una cadena suelta que no engancha con
        // Programas ni con el Dashboard, que es todo el punto de conectarlo.
        const opcion = campo.opciones.find((o) => o.texto === texto);
        lead[campo.mapeaA] = opcion?.valor ?? null;
        break;
      }
      default:
        lead[campo.mapeaA] = texto;
    }
  }

  return lead;
}

/**
 * La nota que queda en la ficha con todo lo contestado.
 *
 * Van TODAS las preguntas, también las que ya se guardaron en un campo. Es a
 * propósito: quien abre la ficha tres semanas después quiere leer la
 * conversación de la feria entera, no adivinar cuál de los datos vino de ahí y
 * cuál lo escribió alguien después.
 *
 * Las que quedaron en blanco no se listan: una nota con cinco «—» seguidos se
 * lee peor y no dice nada que la ausencia no diga.
 */
export function redactarNota(
  formulario: { nombre: string },
  campos: readonly Campo[],
  respuestas: Respuestas,
): string {
  const lineas = campos
    .map((campo) => {
      const cruda = respuestas[campo.id];
      const texto = Array.isArray(cruda) ? cruda.join(", ") : (cruda ?? "");
      return texto.trim() === "" ? null : `${campo.etiqueta}: ${texto.trim()}`;
    })
    .filter((l): l is string => l != null);

  return [`Formulario «${formulario.nombre}»`, ...lineas].join("\n");
}
