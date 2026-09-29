/**
 * El formulario de un anuncio de Meta, leído del mensaje que lo trae.
 *
 * ============================================================================
 * QUÉ LLEGA, Y QUÉ SE HACÍA CON ESO
 * ============================================================================
 *
 * Cuando alguien completa un formulario de una pauta, WhatsApp abre el chat con
 * un mensaje que trae las respuestas en renglones:
 *
 *     ¡Hola! Completé el formulario y me gustaría obtener más información.
 *     Email: magdalenamartinez24@hotmail.com
 *     Full name: Magdalena Martinez
 *     Phone number: 7966 4432
 *     Province: Colón
 *     Curso Corto de tu interés: Pastelería Saludable
 *     City: Chalatenango
 *
 * Todo eso quedaba como un mensaje más y la ficha se abría vacía: quien
 * atendía copiaba el nombre, el correo y el curso a mano, de un mensaje que ya
 * los tenía escritos. Por cada lead de pauta.
 *
 * ============================================================================
 * POR QUÉ SE LEE DEL TEXTO Y NO DE UN CAMPO DE META
 * ============================================================================
 *
 * Porque no hay campo. Meta manda esto como un mensaje de texto común: la
 * estructura la puso quien armó el anuncio, no la API. Por eso mismo las
 * etiquetas cambian entre una pauta y otra —«Full name» en una, «Nombre
 * completo» en la siguiente— y esto reconoce las dos formas.
 *
 * Y por eso mismo se lee del texto guardado y no hace falta ninguna columna
 * nueva: los formularios que YA llegaron se pueden leer igual.
 *
 * ============================================================================
 * LA REGLA QUE NO SE NEGOCIA
 * ============================================================================
 *
 * Esto sólo RELLENA HUECOS. Nunca pisa un dato que ya está, ni uno que una
 * persona escribió. Un formulario mal llenado —el teléfono de otro, el nombre
 * en minúsculas— no puede borrar lo que alguien corrigió a mano: un dato de
 * menos se completa mirando el hilo, uno pisado se pierde sin que nadie se
 * entere.
 */

/** Lo que se pudo sacar del formulario. Todo puede faltar. */
export interface DelFormulario {
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  /** El curso o diplomado por el que preguntó, tal como lo escribió la pauta. */
  programa: string | null;
  /** Departamento o provincia. */
  departamento: string | null;
  ciudad: string | null;
  empresa: string | null;
  cargo: string | null;
}

export const NADA: DelFormulario = {
  nombre: null,
  correo: null,
  telefono: null,
  programa: null,
  departamento: null,
  ciudad: null,
  empresa: null,
  cargo: null,
};

/** Sin tildes, sin mayúsculas y sin espacios de más: para comparar etiquetas. */
const plano = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Cómo se llama cada dato en las pautas de la escuela.
 *
 * ============================================================================
 * EL ORDEN IMPORTA, Y ES POR ESO QUE ESTO ES UNA LISTA Y NO UN OBJETO
 * ============================================================================
 *
 * Una etiqueta puede coincidir con varias entradas: «Curso Corto de tu interés»
 * contiene «curso» y también «interes». Se recorre en orden y gana la primera,
 * así que las más específicas van primero.
 *
 * Con un objeto el orden dependería de cómo lo recorra el motor, que es la
 * clase de detalle que funciona hasta que deja de funcionar.
 */
const COMO_SE_LLAMAN: { campo: keyof DelFormulario; dicen: string[] }[] = [
  {
    campo: "correo",
    dicen: ["email", "e-mail", "correo", "correo electronico", "mail"],
  },
  {
    campo: "nombre",
    dicen: ["full name", "nombre completo", "nombre y apellido", "nombre", "name"],
  },
  {
    campo: "telefono",
    dicen: [
      "phone number",
      "telefono",
      "numero de telefono",
      "numero de celular",
      "celular",
      "whatsapp",
      "phone",
      "numero",
    ],
  },
  /*
   * El programa, antes que ciudad y departamento.
   *
   * Sus etiquetas son las más largas y variadas —«Curso Corto de tu interés»,
   * «¿Qué diplomado te interesa?»— y son las que más se parecen a cualquier
   * otra cosa. Van primero para que ganen su propia coincidencia.
   */
  {
    campo: "programa",
    dicen: [
      "curso corto de tu interes",
      "curso de tu interes",
      "curso de interes",
      "programa de interes",
      "diplomado de tu interes",
      "que diplomado te interesa",
      "que curso te interesa",
      "programa",
      "diplomado",
      "curso",
      "interes",
    ],
  },
  {
    campo: "departamento",
    dicen: ["province", "provincia", "departamento", "state", "estado", "region"],
  },
  { campo: "ciudad", dicen: ["city", "ciudad", "municipio", "localidad"] },
  { campo: "empresa", dicen: ["company", "empresa", "negocio", "organizacion"] },
  { campo: "cargo", dicen: ["job title", "cargo", "puesto", "ocupacion", "profesion"] },
];

/** A qué campo corresponde esta etiqueta, o null si no se reconoce. */
function queCampoEs(etiqueta: string): keyof DelFormulario | null {
  const e = plano(etiqueta);
  if (e === "") return null;

  // Primero, el que coincide ENTERO: «nombre» es el campo nombre y no otra cosa.
  for (const { campo, dicen } of COMO_SE_LLAMAN) {
    if (dicen.some((d) => d === e)) return campo;
  }

  /*
   * Después, el que aparece adentro. Es lo que hace que «Curso Corto de tu
   * interés» y «¿Cuál es tu nombre completo?» se reconozcan sin tener que
   * anotar cada frase que se le ocurra a quien arma la pauta.
   */
  for (const { campo, dicen } of COMO_SE_LLAMAN) {
    if (dicen.some((d) => e.includes(d))) return campo;
  }

  return null;
}

/**
 * Cuántos datos hay que reconocer para creer que esto es un formulario.
 *
 * Con uno solo alcanzaría para confundir un mensaje común: «Programa: el del
 * sábado» es una frase que alguien puede escribir. Con dos, la forma ya es la
 * de un formulario y no la de una conversación.
 */
const MINIMO = 2;

/**
 * Lee el mensaje y devuelve lo que trae, o `null` si no parece un formulario.
 *
 * Devolver `null` y no «todo vacío» es a propósito: quien llama tiene que poder
 * distinguir «no era un formulario» de «era uno y no traía nada», porque lo
 * primero no es un problema y lo segundo sí.
 */
export function leerFormulario(texto: string | null | undefined): DelFormulario | null {
  const cuerpo = (texto ?? "").trim();
  if (cuerpo === "") return null;

  const salida: DelFormulario = { ...NADA };
  let reconocidos = 0;

  for (const renglon of cuerpo.split(/\r?\n/)) {
    /*
     * Se parte en el PRIMER dos puntos y no en todos.
     *
     * Un valor puede tener los suyos —una dirección web, una hora— y partir
     * por todos dejaría «https» de valor y el resto tirado.
     */
    const corte = renglon.indexOf(":");
    if (corte < 0) continue;

    // Las pautas a veces mandan la etiqueta en negrita, con asteriscos.
    const etiqueta = renglon.slice(0, corte).replace(/[*_~`]/g, "").trim();
    const valor = renglon.slice(corte + 1).trim();
    if (valor === "") continue;

    const campo = queCampoEs(etiqueta);
    if (!campo) continue;

    // El PRIMERO gana. Un formulario con dos «Nombre» es raro, y si pasa, el de
    // arriba es el que la persona llenó primero.
    if (salida[campo] != null) continue;

    salida[campo] = valor;
    reconocidos += 1;
  }

  return reconocidos >= MINIMO ? salida : null;
}

/**
 * El teléfono del formulario, sólo si sirve.
 *
 * ============================================================================
 * POR QUÉ NO SE USA PARA IDENTIFICAR A NADIE
 * ============================================================================
 *
 * El número del hilo es el que WhatsApp confirmó: es desde donde escribe la
 * persona. El del formulario lo escribió ella a mano y puede estar mal, ser el
 * de la mamá, o tener el código de país de otro país.
 *
 * Así que éste sólo sirve para completar una ficha que NO tiene teléfono —cosa
 * rara en WhatsApp y normal en un lead que entró por otro lado—. Nunca para
 * buscar a quién pertenece un mensaje.
 */
export function telefonoUtil(crudo: string | null): string | null {
  const digitos = (crudo ?? "").replace(/\D/g, "");
  if (digitos.length === 8) return `503${digitos}`;
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/** «Chalatenango, Colón» o lo que haya: para el territorio de la ficha. */
export function comoSeUbica(f: DelFormulario): string | null {
  const partes = [f.ciudad, f.departamento].filter((x): x is string => Boolean(x));
  return partes.length > 0 ? [...new Set(partes)].join(", ") : null;
}
