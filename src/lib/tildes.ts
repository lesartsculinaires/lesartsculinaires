/**
 * Tildes que faltan en nombres y apellidos, como sugerencia.
 *
 * ============================================================================
 * POR QUÉ ESTO NO ES UN CORRECTOR ORTOGRÁFICO
 * ============================================================================
 *
 * Porque un corrector ortográfico sobre nombres propios es una mala idea, y
 * conviene decir por qué antes de que a alguien se le ocurra ampliarlo.
 *
 * Los nombres no están en ningún diccionario. Un corrector que los mire va a
 * proponer barbaridades con la misma seguridad con la que acierta: «Menjívar»
 * no existe para él, «Iraheta» tampoco, y va a querer arreglarlos. Y al revés:
 * hay gente que se apellida «Perez» sin tilde —está en su partida de
 * nacimiento— y corregírselo en silencio no es arreglar un error, es escribir
 * mal el nombre de una persona en su inscripción.
 *
 * Así que esto no adivina: tiene una LISTA. Sólo propone la tilde cuando la
 * palabra escrita está en la lista de abajo, que son los nombres y apellidos
 * donde la forma con tilde es la normal en El Salvador y la región. Fuera de
 * esa lista no dice nada.
 *
 * ============================================================================
 * Y POR QUÉ NUNCA SE APLICA SOLO
 * ============================================================================
 *
 * Porque el 5% de las veces la lista se equivoca con una persona concreta, y
 * ese 5% es exactamente el caso en que más daño hace: el alumno que sí se
 * apellida «Perez» y termina inscrito como otro. Un nombre sin tilde se ve
 * feo; un nombre cambiado por una máquina es un problema de la persona con la
 * escuela.
 *
 * Por eso se ofrece como una pastilla que hay que apretar, y por eso no se usa
 * en la importación de bases: trescientos nombres acomodados de una vez es
 * exactamente la situación donde nadie mira lo que se aplicó.
 *
 * ============================================================================
 * LO QUE EL NAVEGADOR YA HACE, Y ESTO NO REEMPLAZA
 * ============================================================================
 *
 * Las notas y los textos largos ya los revisa el corrector del navegador, en
 * castellano, porque la página se declara `lang="es"`. Eso subraya en rojo lo
 * que está mal escrito en las palabras comunes —que es donde un diccionario
 * sirve— sin tocar nada. Este archivo se ocupa nada más de la parte que el
 * navegador no puede: los nombres propios.
 */

/**
 * Escrito sin tilde → cómo se escribe normalmente.
 *
 * En minúsculas y sin tildes del lado de la clave, para poder buscar sin
 * importar cómo esté capitalizado lo que se escribió.
 *
 * CÓMO AGREGAR UNO: sólo si la forma con tilde es la abrumadoramente normal.
 * Ante la duda, no se agrega: una sugerencia que se ignora seguido deja de
 * mirarse, y entonces tampoco se ven las que valían la pena.
 */
const CON_TILDE: Record<string, string> = {
  // ---- nombres de pila
  angel: "Ángel",
  angeles: "Ángeles",
  adrian: "Adrián",
  agustin: "Agustín",
  aida: "Aída",
  alvaro: "Álvaro",
  andres: "Andrés",
  anibal: "Aníbal",
  belen: "Belén",
  cesar: "César",
  concepcion: "Concepción",
  cristobal: "Cristóbal",
  damian: "Damián",
  efrain: "Efraín",
  fabian: "Fabián",
  german: "Germán",
  hector: "Héctor",
  hernan: "Hernán",
  ines: "Inés",
  ivan: "Iván",
  jazmin: "Jazmín",
  jesus: "Jesús",
  joaquin: "Joaquín",
  jose: "José",
  julian: "Julián",
  lucia: "Lucía",
  martin: "Martín",
  maria: "María",
  monica: "Mónica",
  nestor: "Néstor",
  nicolas: "Nicolás",
  oscar: "Óscar",
  ramon: "Ramón",
  raul: "Raúl",
  ruben: "Rubén",
  saul: "Saúl",
  sebastian: "Sebastián",
  sofia: "Sofía",
  veronica: "Verónica",
  victor: "Víctor",

  // ---- apellidos
  alvarez: "Álvarez",
  benitez: "Benítez",
  bermudez: "Bermúdez",
  chavez: "Chávez",
  diaz: "Díaz",
  dominguez: "Domínguez",
  fernandez: "Fernández",
  galdamez: "Galdámez",
  garcia: "García",
  gomez: "Gómez",
  gonzalez: "González",
  guzman: "Guzmán",
  henriquez: "Henríquez",
  hernandez: "Hernández",
  jimenez: "Jiménez",
  lopez: "López",
  marquez: "Márquez",
  martinez: "Martínez",
  melendez: "Meléndez",
  mendez: "Méndez",
  menendez: "Menéndez",
  menjivar: "Menjívar",
  munoz: "Muñoz",
  nunez: "Núñez",
  ordonez: "Ordóñez",
  perez: "Pérez",
  ramirez: "Ramírez",
  rodriguez: "Rodríguez",
  rios: "Ríos",
  sanchez: "Sánchez",
  solorzano: "Solórzano",
  suarez: "Suárez",
  velasquez: "Velásquez",
  vasquez: "Vásquez",
  zuniga: "Zúñiga",
};

/** Minúsculas y sin tildes ni eñes, para comparar contra las claves. */
const pelado = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase();

/**
 * El mismo nombre con las tildes que le faltan, o null si no hay nada que
 * proponer.
 *
 * Palabra por palabra, y sólo las que están en la lista. Se respeta lo que ya
 * tenía tilde: si alguien escribió «José Perez», la propuesta es «José Pérez»
 * y no se le toca el nombre de pila.
 *
 * Devuelve null —y no el mismo texto— cuando no cambia nada, para que quien
 * llama no tenga que comparar.
 */
export function conTildes(s: string): string | null {
  let cambio = false;

  const salida = s.split(/(\s+)/).map((trozo) => {
    if (!trozo.trim()) return trozo;

    // Un nombre compuesto con guion se mira por partes: «Jose-Maria».
    const partes = trozo.split(/(-)/).map((parte) => {
      if (parte === "-") return parte;

      // Lo que ya tiene tilde o eñe se deja como está: quien la escribió sabía
      // lo que hacía, y proponerle otra cosa es discutirle su propio nombre.
      if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(parte)) return parte;

      const propuesta = CON_TILDE[pelado(parte)];
      if (!propuesta) return parte;

      cambio = true;
      // Se devuelve con la capitalización de la propuesta salvo que lo escrito
      // esté todo en mayúsculas, donde se respeta: «PEREZ» → «PÉREZ».
      return parte === parte.toUpperCase() ? propuesta.toUpperCase() : propuesta;
    });

    return partes.join("");
  });

  return cambio ? salida.join("") : null;
}
