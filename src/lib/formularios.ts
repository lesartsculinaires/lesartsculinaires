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
  /**
   * Todos los programas que marcó, cuando la pregunta admite varios.
   *
   * La escuela lo pidió así: «en la opción de formulario, donde aparecen los
   * tipos de diplomados, que pueda seleccionar varios si está interesado en
   * varios». Antes una pregunta de elegir-varias que alimentaba el programa
   * guardaba sólo la primera marca y las demás se perdían sin aviso.
   *
   * `producto_id` sigue siendo uno —el primero que marcó— porque es el que
   * lleva la plata del trato. Los demás quedan acá y van a
   * `oportunidad_programas`, que es lo que después evita que una base nueva
   * por el segundo programa le abra un lead aparte.
   */
  programas_interes: number[];
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
  programas_interes: [],
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
  /*
   * El arreglo se crea acá, no se copia de `VACIO`.
   *
   * `{ ...VACIO }` copia la referencia, así que todas las llamadas
   * compartirían el mismo arreglo y los programas de un formulario aparecerían
   * en el siguiente. Con dos personas llenando en la misma feria, la segunda
   * habría heredado los intereses de la primera.
   */
  const lead: DatosDelLead = { ...VACIO, programas_interes: [] };

  for (const campo of campos) {
    if (!campo.mapeaA) continue;

    const cruda = respuestas[campo.id];
    /*
     * Todas las marcas, no sólo la primera.
     *
     * Acá se hacía `cruda[0]`, y con una pregunta de elegir-varias eso tiraba
     * en silencio todo lo que la persona hubiera marcado además de lo primero.
     * En una feria, alguien interesado en Pastelería Y Barismo entraba como si
     * sólo hubiera preguntado por Pastelería.
     */
    const todas = (Array.isArray(cruda) ? cruda : [cruda])
      .map((t) => t?.trim() ?? "")
      .filter((t) => t !== "");
    const texto = todas[0] ?? "";
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
        const idDe = (t: string): number | null =>
          campo.opciones.find((o) => o.texto === t)?.valor ?? null;

        lead[campo.mapeaA] = idDe(texto);

        /*
         * Las demás marcas, cuando la pregunta admite varias.
         *
         * Sólo del programa: territorio es uno solo por definición —nadie vive
         * en dos lugares— y una pregunta de elegir-varias mapeada ahí sería un
         * error de quien armó el formulario, no algo que haya que soportar.
         */
        if (campo.mapeaA === "producto_id") {
          for (const t of todas) {
            const id = idDe(t);
            if (id != null && !lead.programas_interes.includes(id)) {
              lead.programas_interes.push(id);
            }
          }
        }
        break;
      }
      default:
        lead[campo.mapeaA] = texto;
    }
  }

  return lead;
}

/**
 * Con qué nombre entra el lead cuando nadie escribió uno.
 *
 * Ninguna pregunta del formulario es obligatoria: en una feria se llena de
 * pie, con la persona enfrente, y bloquear el guardado por un campo vacío
 * significa perder el contacto entero. Pero `clientes.nombre` es `not null` en
 * la base, así que un lead sin ninguna palabra en el nombre no se puede
 * guardar aunque quisiéramos.
 *
 * La salida es armarlo con lo que sí haya. «Contacto 7100-4455» no es un
 * nombre, y no pretende serlo: es una etiqueta con la que la ficha se puede
 * encontrar y renombrar después. Lo importante es que el teléfono queda
 * guardado, que es lo que hace falta para volver a llamar.
 *
 * Devuelve null sólo si no hay absolutamente nada con qué identificar a nadie.
 * Ahí sí conviene frenar: una ficha vacía no es un lead, es una fila que
 * alguien va a tener que borrar.
 */
export function nombreParaElLead(lead: DatosDelLead): string | null {
  const propio = lead.nombre.trim();
  if (propio) return propio;

  const tel = lead.telefono?.trim();
  if (tel) return `Contacto ${tel}`;

  const correo = lead.correo?.trim();
  if (correo) return `Contacto ${correo}`;

  // El teléfono del responsable es lo último a lo que agarrarse: es de otra
  // persona, pero por ahí se llega igual a ésta.
  const resp = lead.responsable_telefono?.trim();
  if (resp) return `Contacto ${resp}`;

  return null;
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
