/**
 * Los huecos de una plantilla de WhatsApp: `{{1}}` y `{{nombre_del_dato}}`.
 *
 * ============================================================================
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ============================================================================
 *
 * Porque el CRM sólo entendía uno de los dos formatos, y la escuela usa el
 * otro. Todo lo que leía plantillas buscaba `{{\d+}}` —sólo dígitos—, así que
 * con una plantilla como la que tienen cargada:
 *
 *     ¡Hola! Hola, buen día, {{order_id}}
 *
 * pasaba esto, en cadena:
 *
 *   1. `cuantasVariables` contaba CERO huecos.
 *   2. La pantalla no dibujaba ninguna casilla para llenar.
 *   3. La vista previa mostraba «{{order_id}}» tal cual, en crudo.
 *   4. El envío salía sin `components`.
 *   5. Meta lo rechazaba: la plantilla declara un parámetro y no le llegó
 *      ninguno.
 *
 * O sea que el botón «Mandar» no podía funcionar. No era el token, ni la
 * aprobación de la plantilla, ni la ventana de 24 horas: era que el CRM no
 * sabía leer esa forma de escribir un hueco.
 *
 * ============================================================================
 * LOS DOS FORMATOS, Y POR QUÉ NO SE MEZCLAN
 * ============================================================================
 *
 * Meta admite dos maneras de marcar un hueco en el cuerpo de una plantilla:
 *
 *   POSICIONAL   `{{1}}`, `{{2}}`…   se manda una lista y el orden manda.
 *   CON NOMBRE   `{{order_id}}`       se manda el nombre junto al valor.
 *
 * Y no se pueden mezclar en la misma plantilla: Meta la rechaza al crearla. Por
 * eso acá se decide el formato de la plantilla entera mirando el primer hueco,
 * y no hueco por hueco.
 *
 * Lo que cambia al mandar es el JSON:
 *
 *   posicional   { "type": "text", "text": "Evelyn" }
 *   con nombre   { "type": "text", "parameter_name": "order_id", "text": "Evelyn" }
 *
 * Mandar el primero donde va el segundo es exactamente el error que estaba
 * pasando, así que este archivo devuelve los huecos con su nombre y quien
 * arma el envío ya no tiene que adivinar.
 */

/** Un hueco del cuerpo, en el orden en que aparece. */
export interface Hueco {
  /**
   * Lo que va adentro de las llaves: «1» o «order_id».
   *
   * Es la clave que Meta espera en `parameter_name` cuando la plantilla usa
   * nombres, y el número de orden cuando usa posiciones.
   */
  clave: string;
  /** Cómo se le pide el dato a quien va a mandar: «Nombre del dato», «Dato 1». */
  etiqueta: string;
}

/**
 * Un hueco es `{{` algo `}}`, con o sin espacios.
 *
 * El contenido se acepta ancho a propósito —letras, números, guiones bajos— y
 * después se decide si es un número o un nombre. Un patrón más estricto
 * dejaría afuera los nombres con mayúsculas o con guion, que Meta acepta, y
 * volveríamos al mismo problema con otra plantilla.
 */
const HUECO = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** ¿Esta plantilla usa nombres en vez de posiciones? */
export const conNombres = (cuerpo: string | null): boolean => {
  const primero = [...(cuerpo ?? "").matchAll(HUECO)][0];
  return primero != null && !/^\d+$/.test(primero[1]);
};

/**
 * Los huecos del cuerpo, en orden y sin repetir.
 *
 * Sin repetir porque `{{1}}` puede aparecer dos veces en el mismo texto y
 * sigue siendo un solo dato que hay que dar: pedirlo dos veces haría mandar un
 * parámetro de más, y Meta rechaza el envío por la cuenta.
 *
 * En orden de aparición y no alfabético: es el orden en que se leen las
 * casillas, y con posiciones además es el orden que Meta espera.
 */
export function huecosDe(cuerpo: string | null): Hueco[] {
  if (!cuerpo) return [];

  const vistos = new Set<string>();
  const huecos: Hueco[] = [];

  for (const m of cuerpo.matchAll(HUECO)) {
    const clave = m[1];
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    huecos.push({
      clave,
      etiqueta: /^\d+$/.test(clave)
        ? `Dato ${clave} (va donde dice {{${clave}}})`
        : // Con nombre se muestra el nombre, que es lo que le dice a quien
          // manda qué tiene que escribir. «order_id» no es bonito, pero es lo
          // que puso quien creó la plantilla y es más útil que «Dato 1».
          `${clave.replace(/[_-]+/g, " ")} (va donde dice {{${clave}}})`,
    });
  }

  /*
   * Con posiciones se ordenan por número.
   *
   * Meta las numera y el orden de aparición en el texto puede no ser el mismo:
   * una plantilla puede decir «{{2}} … {{1}}». Mandar los valores al revés
   * pondría el nombre donde va el programa sin que nadie se entere hasta que
   * el cliente lo lea.
   */
  if (!conNombres(cuerpo)) {
    huecos.sort((a, b) => Number(a.clave) - Number(b.clave));
  }

  return huecos;
}

/** Cuántos huecos hay que llenar. */
export const cuantosHuecos = (cuerpo: string | null): number => huecosDe(cuerpo).length;

/**
 * El cuerpo con lo escrito puesto en su lugar, para verlo antes de mandarlo.
 *
 * Los valores van en el mismo orden que `huecosDe`, que es el orden de las
 * casillas en pantalla. Un hueco sin llenar se deja como está: así se ve
 * cuál falta en vez de quedar un agujero en la frase.
 */
export function conValores(cuerpo: string | null, valores: readonly string[]): string {
  if (!cuerpo) return "";
  const huecos = huecosDe(cuerpo);

  return cuerpo.replace(HUECO, (entero, clave: string) => {
    const i = huecos.findIndex((h) => h.clave === clave);
    const v = i >= 0 ? valores[i] : undefined;
    return v != null && v.trim() !== "" ? v : entero;
  });
}

/**
 * El bloque `components` que va en el envío, o `undefined` si no hace falta.
 *
 * Una plantilla sin huecos no lleva `components` en absoluto: mandarlo vacío
 * hace que Meta la rechace.
 */
export function componentesDe(
  cuerpo: string | null,
  valores: readonly string[],
): { type: string; parameters: Record<string, string>[] }[] | undefined {
  const huecos = huecosDe(cuerpo);
  if (huecos.length === 0) return undefined;

  const nombrados = conNombres(cuerpo);

  return [
    {
      type: "body",
      parameters: huecos.map((h, i) => ({
        type: "text",
        // `parameter_name` sólo cuando la plantilla usa nombres. Mandarlo en
        // una posicional también es un error para Meta.
        ...(nombrados ? { parameter_name: h.clave } : {}),
        text: valores[i] ?? "",
      })),
    },
  ];
}
