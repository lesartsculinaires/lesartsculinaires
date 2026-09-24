/**
 * El formato de texto de WhatsApp: ponerlo, quitarlo y dibujarlo.
 *
 * ============================================================================
 * QUÉ ACEPTA WHATSAPP, Y QUÉ NO
 * ============================================================================
 *
 * WhatsApp no manda texto con formato: manda texto pelado con unas marcas, y
 * es la aplicación de la persona la que las dibuja. Son cuatro, y nada más:
 *
 *     *negrita*            ~tachado~
 *     _cursiva_            ```monoespaciado```
 *
 * NO HAY SUBRAYADO. No es que falte implementarlo: WhatsApp no tiene una marca
 * para subrayar, así que un botón de subrayado mandaría un símbolo suelto que
 * le llega al cliente tal cual. Por eso este archivo tiene cuatro marcas y no
 * cinco, aunque un editor de texto normal tenga la quinta.
 *
 * Instagram y Messenger no dibujan NINGUNA de las cuatro: los asteriscos le
 * llegan a la persona como asteriscos. Por eso quién ofrece la barra no se
 * decide acá sino en `canales.ts`, con el resto de lo que cada red puede.
 *
 * ============================================================================
 * LAS REGLAS FINAS, QUE SON LAS QUE HACEN QUE SE VEA
 * ============================================================================
 *
 * Las marcas tienen que ABRAZAR el texto. `* hola *` no sale en negrita en
 * ningún teléfono, y es el error que se comete solo cuando uno selecciona con
 * el ratón y se lleva el espacio de al lado. Por eso `alternarMarca` recorta la
 * selección antes de envolverla: el espacio queda afuera de las marcas.
 *
 * Y dentro del monoespaciado no se dibuja nada más, que es como se comporta
 * WhatsApp: ``` *hola* ``` sale con los asteriscos a la vista.
 */

export type Marca = "negrita" | "cursiva" | "tachado" | "mono";

/** El símbolo de cada marca, que va igual al abrir y al cerrar. */
export const SIMBOLO: Record<Marca, string> = {
  negrita: "*",
  cursiva: "_",
  tachado: "~",
  mono: "```",
};

/** Cómo se llama cada una en la pantalla. */
export const NOMBRE: Record<Marca, string> = {
  negrita: "Negrita",
  cursiva: "Cursiva",
  tachado: "Tachado",
  mono: "Monoespaciado",
};

/** El orden en que se prueban al leer. El mono primero: sus tres tildes
 *  invertidas empiezan con un carácter que no choca, pero buscarlo después
 *  haría que el primer ``` se leyera como algo más. */
const ORDEN: Marca[] = ["mono", "negrita", "cursiva", "tachado"];

// ---------------------------------------------------------------------------
// PONER Y QUITAR
// ---------------------------------------------------------------------------

export interface Envuelto {
  valor: string;
  /** Dónde queda la selección después, para no perderla al pulsar el botón. */
  inicio: number;
  fin: number;
}

/**
 * Pone la marca alrededor de lo seleccionado, o se la quita si ya la tiene.
 *
 * Que sea un interruptor y no sólo un «poner» es lo que hace que el botón se
 * pueda deshacer con el mismo botón, como en cualquier editor. Sin eso, darle
 * dos veces dejaría `**hola**`, que WhatsApp dibuja con un asterisco a la
 * vista de cada lado.
 *
 * Sin nada seleccionado, escribe el par y deja el cursor en el medio: es lo
 * que se espera cuando se pulsa el botón antes de escribir.
 */
export function alternarMarca(
  valor: string,
  inicio: number,
  fin: number,
  marca: Marca,
): Envuelto {
  const s = SIMBOLO[marca];

  // La selección, recortada: los espacios de los bordes quedan afuera de las
  // marcas o el formato no se dibuja en el teléfono.
  const crudo = valor.slice(inicio, fin);
  const izq = crudo.length - crudo.trimStart().length;
  const der = crudo.length - crudo.trimEnd().length;
  const a = inicio + izq;
  const b = fin - der;
  const dentro = valor.slice(a, b);

  if (dentro === "") {
    // Sin selección: el par vacío y el cursor en el medio.
    const valorNuevo = valor.slice(0, inicio) + s + s + valor.slice(fin);
    return { valor: valorNuevo, inicio: inicio + s.length, fin: inicio + s.length };
  }

  // ¿Ya está marcada? Dos formas: las marcas por fuera de la selección
  // —seleccionó sólo el texto— o por dentro —seleccionó las marcas también—.
  const afuera =
    valor.slice(Math.max(0, a - s.length), a) === s && valor.slice(b, b + s.length) === s;
  if (afuera) {
    const valorNuevo =
      valor.slice(0, a - s.length) + dentro + valor.slice(b + s.length);
    return { valor: valorNuevo, inicio: a - s.length, fin: b - s.length };
  }

  const adentro =
    dentro.length > s.length * 2 && dentro.startsWith(s) && dentro.endsWith(s);
  if (adentro) {
    const pelado = dentro.slice(s.length, -s.length);
    const valorNuevo = valor.slice(0, a) + pelado + valor.slice(b);
    return { valor: valorNuevo, inicio: a, fin: a + pelado.length };
  }

  const valorNuevo = valor.slice(0, a) + s + dentro + s + valor.slice(b);
  return { valor: valorNuevo, inicio: a + s.length, fin: b + s.length };
}

// ---------------------------------------------------------------------------
// LEER
// ---------------------------------------------------------------------------

export interface Pedazo {
  texto: string;
  negrita: boolean;
  cursiva: boolean;
  tachado: boolean;
  mono: boolean;
}

const pelado = (texto: string): Pedazo => ({
  texto,
  negrita: false,
  cursiva: false,
  tachado: false,
  mono: false,
});

/**
 * ¿Sirve como cierre el símbolo que está en `j`, para una marca abierta que
 * empezó su contenido en `desde`?
 *
 * Es una sola función y no dos por una razón que costó una prueba en rojo: si
 * la regla de «hay cierre más adelante» y la de «acá cierra» no son idénticas,
 * el lector abre una marca que después nunca cierra y se COME el símbolo de
 * apertura. El texto sale mutilado. Con las dos preguntas contestadas por la
 * misma función eso no puede pasar.
 */
const cierraAca = (texto: string, desde: number, j: number, s: string): boolean =>
  // Con algo en el medio —`**` no es negrita vacía, es dos asteriscos— y
  // pegado al texto: `*hola*` sí, `*hola *` no.
  j > desde && !/\s/.test(texto[j - 1] ?? "");

/** ¿Hay un cierre válido para esta marca más adelante? */
function cierraMasAdelante(texto: string, desde: number, s: string): boolean {
  let i = desde;
  while (i < texto.length) {
    const j = texto.indexOf(s, i);
    if (j === -1) return false;
    if (cierraAca(texto, desde, j, s)) return true;
    i = j + s.length;
  }
  return false;
}

/**
 * Parte el texto en tramos, cada uno con las marcas que le tocan.
 *
 * Es lo que deja dibujar en la burbuja lo mismo que ve la persona en su
 * teléfono. Sin esto, la asesora escribe algo en negrita y en el CRM lo
 * relee con asteriscos: dos lecturas distintas del mismo mensaje.
 *
 * Lo que no se puede interpretar queda como texto: un asterisco suelto es un
 * asterisco. Es la regla que evita que un mensaje se vea mutilado porque la
 * persona escribió «2*3».
 */
export function aPedazos(texto: string): Pedazo[] {
  const salida: Pedazo[] = [];
  // Cada marca abierta se acuerda de dónde empezó su contenido: sin eso no se
  // puede saber si un símbolo cierra algo o si está vacío.
  const abiertas: { marca: Marca; desde: number }[] = [];
  const marcasAbiertas = () => abiertas.map((x) => x.marca);
  let buffer = "";
  let i = 0;

  const soltar = () => {
    if (buffer === "") return;
    const puestas = marcasAbiertas();
    salida.push({
      texto: buffer,
      negrita: puestas.includes("negrita"),
      cursiva: puestas.includes("cursiva"),
      tachado: puestas.includes("tachado"),
      mono: puestas.includes("mono"),
    });
    buffer = "";
  };

  while (i < texto.length) {
    const puestas = marcasAbiertas();
    // Dentro del monoespaciado sólo se busca su propio cierre: WhatsApp no
    // dibuja nada más ahí adentro.
    const candidatas = puestas.includes("mono") ? (["mono"] as Marca[]) : ORDEN;

    let avanzo = false;
    for (const marca of candidatas) {
      const s = SIMBOLO[marca];
      if (!texto.startsWith(s, i)) continue;

      const arriba = abiertas[abiertas.length - 1];
      // Cierra: es la de más adentro y cierra de verdad acá.
      if (arriba?.marca === marca && cierraAca(texto, arriba.desde, i, s)) {
        soltar();
        abiertas.pop();
        i += s.length;
        avanzo = true;
        break;
      }

      // Abre: no está abierta ya, hay cierre más adelante y lo que sigue no es
      // un espacio ni OTRO SÍMBOLO IGUAL. Lo último es lo que deja que `***`
      // —que alguien escribe como separador— siga siendo tres asteriscos y no
      // un asterisco en negrita.
      const sigue = texto.slice(i + s.length);
      if (
        !puestas.includes(marca) &&
        !/^\s/.test(sigue) &&
        !sigue.startsWith(s[0] ?? "") &&
        cierraMasAdelante(texto, i + s.length, s)
      ) {
        soltar();
        abiertas.push({ marca, desde: i + s.length });
        i += s.length;
        avanzo = true;
        break;
      }
    }

    if (avanzo) continue;
    buffer += texto[i];
    i += 1;
  }

  soltar();
  return salida.length > 0 ? salida : [pelado(texto)];
}

/**
 * El texto sin las marcas.
 *
 * Para donde no se puede dibujar formato y se muestra un resumen —la fila de
 * la bandeja, el aviso del navegador—: ahí los asteriscos son ruido que se
 * come el lugar del texto de verdad.
 */
export const textoPlano = (texto: string): string =>
  aPedazos(texto)
    .map((p) => p.texto)
    .join("");
