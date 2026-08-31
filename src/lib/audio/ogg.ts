/**
 * De lo que graba el navegador a lo que acepta WhatsApp.
 *
 * ============================================================================
 * EL PROBLEMA, QUE NO SE VE HASTA QUE SE INTENTA
 * ============================================================================
 *
 * Grabar una nota de voz en el navegador se hace con `MediaRecorder`, y en
 * Chrome —que es lo que usa la escuela— lo único que sabe grabar es esto:
 *
 *     audio/webm;codecs=opus     sí
 *     audio/mp4;codecs=opus      sí
 *     audio/ogg;codecs=opus      NO
 *
 * Y la lista de WhatsApp es justo la de al lado:
 *
 *     audio/ogg (opus)           sí — es lo que usa para las notas de voz
 *     audio/aac, audio/mpeg      sí
 *     audio/mp4                  sí, pero con AAC adentro, no con Opus
 *     audio/webm                 NO, en absoluto
 *
 * O sea: el navegador graba en un envase que WhatsApp no abre. No hay opción
 * de configuración que arregle eso.
 *
 * ============================================================================
 * POR QUÉ NO HACE FALTA CONVERTIR NADA
 * ============================================================================
 *
 * Porque el sonido ya está en el formato correcto. Lo que graba Chrome es Opus
 * —el mismo códec que usa WhatsApp— metido adentro de un envase WebM. Lo único
 * que hay que hacer es sacarlo de ese envase y meterlo en uno Ogg.
 *
 * Eso es re-empaquetar, no recodificar: los paquetes de audio salen y entran
 * byte por byte idénticos. No se pierde calidad, no hay que decodificar nada,
 * y tarda milisegundos en vez de segundos. Una nota de un minuto se re-empaqueta
 * sin que la persona note ninguna espera.
 *
 * Las alternativas eran peores:
 *
 *   CONVERTIR EN EL SERVIDOR   haría falta ffmpeg, que en Netlify no está y no
 *                              se puede instalar. Y el audio entero tendría que
 *                              subir y bajar por la función.
 *
 *   UNA LIBRERÍA DE WASM       ffmpeg.wasm pesa entre 10 y 30 MB que hay que
 *                              bajar antes de poder grabar la primera nota.
 *                              Para cambiar de envase un archivo que ya está
 *                              bien.
 *
 *   MANDAR EL mp4 CON OPUS     Meta acepta el tipo «audio/mp4», así que el
 *                              envío no falla. Lo que falla es después: Opus
 *                              adentro de MP4 casi ningún teléfono lo abre, y
 *                              el cliente recibe un archivo que no suena. Es el
 *                              peor de los tres, porque no da error.
 *
 * ============================================================================
 * CÓMO SE LEE ESTE ARCHIVO
 * ============================================================================
 *
 * Dos mitades:
 *
 *   1. `paquetesDeWebm`  abre el WebM y saca los paquetes de Opus y la
 *                        cabecera que los describe.
 *   2. `armarOgg`        los mete en páginas Ogg, con sus sumas de control.
 *
 * `webmAOgg` es las dos, una detrás de la otra, y es lo único que hace falta
 * usar desde afuera.
 */

/** El resultado de abrir el WebM: la cabecera de Opus y sus paquetes. */
interface Adentro {
  /**
   * El bloque «OpusHead» tal cual venía.
   *
   * Dice cuántos canales, a qué frecuencia y cuántas muestras hay que
   * descartar al empezar. Se copia sin tocar: inventarlo daría un audio que
   * suena mal o directamente no abre.
   */
  cabecera: Uint8Array;
  /** Un paquete de Opus por cada trocito de sonido, en orden. */
  paquetes: Uint8Array[];
}

/* ==========================================================================
 * 1. Abrir el WebM
 * ==========================================================================
 *
 * WebM es Matroska, y Matroska es EBML: una sucesión de elementos, cada uno
 * con un identificador, un tamaño y sus datos. Algunos elementos contienen
 * otros adentro. No hace falta entenderlo entero: alcanza con bajar hasta dos
 * lugares —donde está la cabecera de Opus y donde están los paquetes— y
 * saltear todo lo demás sin mirarlo.
 */

/** Los elementos que tienen otros adentro y hay que abrir. */
const CON_HIJOS = new Set([
  0x18538067, // Segment
  0x1654ae6b, // Tracks
  0xae, //       TrackEntry
  0x1f43b675, // Cluster
  0xa0, //       BlockGroup
]);

const CODEC_PRIVATE = 0x63a2;
const SIMPLE_BLOCK = 0xa3;
const BLOCK = 0xa1;

/**
 * Lee un número de los de EBML.
 *
 * Van con el largo escrito adelante: el primer bit en uno dice «un byte», el
 * segundo «dos bytes», y así. `conMarca` decide si ese bit queda adentro del
 * valor —para los identificadores, que se comparan tal cual— o se saca —para
 * los tamaños, que son números de verdad—.
 *
 * Devuelve null cuando no hay bytes suficientes, que es como termina el
 * recorrido de un archivo cortado a la mitad.
 */
function leerNumero(
  b: Uint8Array,
  i: number,
  conMarca: boolean,
): { valor: number; largo: number } | null {
  if (i >= b.length) return null;

  const primero = b[i];
  if (primero === 0) return null;

  let largo = 1;
  let mascara = 0x80;
  while (largo <= 8 && (primero & mascara) === 0) {
    mascara >>= 1;
    largo++;
  }
  if (largo > 8 || i + largo > b.length) return null;

  let valor = conMarca ? primero : primero & (mascara - 1);
  for (let k = 1; k < largo; k++) valor = valor * 256 + b[i + k];

  return { valor, largo };
}

/** Un tamaño con todos los bits en uno: «no sé cuánto mide», y lo escribe Chrome. */
const tamanoDesconocido = (b: Uint8Array, i: number, largo: number): boolean => {
  const primero = b[i] & ((1 << (8 - largo)) - 1);
  if (primero !== (1 << (8 - largo)) - 1) return false;
  for (let k = 1; k < largo; k++) if (b[i + k] !== 0xff) return false;
  return true;
};

/**
 * Los paquetes de Opus que hay adentro de un WebM.
 *
 * Recorre el árbol de elementos entrando sólo donde hace falta. Lo que no
 * conoce lo saltea por su tamaño, que es justo la gracia de EBML: no hay que
 * saber qué es cada cosa para poder pasarla de largo.
 */
export function paquetesDeWebm(bytes: Uint8Array): Adentro {
  let cabecera: Uint8Array | null = null;
  const paquetes: Uint8Array[] = [];

  const recorrer = (desde: number, hasta: number) => {
    let i = desde;

    while (i < hasta) {
      const id = leerNumero(bytes, i, true);
      if (!id) return;
      i += id.largo;

      const tam = leerNumero(bytes, i, false);
      if (!tam) return;

      const abierto = tamanoDesconocido(bytes, i, tam.largo);
      i += tam.largo;

      // Un elemento sin tamaño llega hasta donde llegue su padre. Chrome
      // escribe así el Segment, porque cuando empieza a grabar todavía no sabe
      // cuánto va a durar.
      const fin = abierto ? hasta : Math.min(i + tam.valor, hasta);

      if (CON_HIJOS.has(id.valor)) {
        recorrer(i, fin);
      } else if (id.valor === CODEC_PRIVATE && !cabecera) {
        cabecera = bytes.subarray(i, fin);
      } else if (id.valor === SIMPLE_BLOCK || id.valor === BLOCK) {
        for (const p of paquetesDelBloque(bytes.subarray(i, fin))) paquetes.push(p);
      }

      i = fin;
    }
  };

  recorrer(0, bytes.length);

  if (!cabecera) {
    throw new Error("El audio grabado no trae la cabecera de Opus.");
  }
  if (paquetes.length === 0) {
    throw new Error("El audio grabado no trae sonido.");
  }

  return { cabecera, paquetes };
}

/**
 * Los paquetes que trae un bloque.
 *
 * Un bloque empieza con el número de pista, dos bytes de tiempo y uno de
 * banderas. Después viene el sonido, que puede ser un paquete solo o varios
 * pegados —«lacing», y hay tres maneras distintas de escribir dónde termina
 * cada uno—.
 *
 * Chrome usa la primera, la de un paquete por bloque. Las otras tres están
 * igual porque el archivo también puede venir de otro navegador: Firefox y
 * Safari graban distinto, y un bloque mal leído no da error sino ruido.
 */
function paquetesDelBloque(b: Uint8Array): Uint8Array[] {
  const pista = leerNumero(b, 0, false);
  if (!pista) return [];

  // Número de pista, dos bytes de tiempo relativo, un byte de banderas.
  let i = pista.largo + 3;
  if (i > b.length) return [];

  const lacing = (b[pista.largo + 2] >> 1) & 0x03;
  if (lacing === 0) return [b.subarray(i)];

  const cuantos = b[i] + 1;
  i++;

  const largos: number[] = [];

  if (lacing === 2) {
    // Todos iguales: se reparte lo que queda.
    const cada = Math.floor((b.length - i) / cuantos);
    for (let k = 0; k < cuantos; k++) largos.push(cada);
  } else if (lacing === 1) {
    // Xiph: cada largo en bytes de 255, y uno menor cierra.
    for (let k = 0; k < cuantos - 1; k++) {
      let total = 0;
      while (i < b.length) {
        total += b[i];
        const era255 = b[i] === 255;
        i++;
        if (!era255) break;
      }
      largos.push(total);
    }
    largos.push(b.length - i - largos.reduce((s, x) => s + x, 0));
  } else {
    // EBML: el primero entero, los demás como diferencia con el anterior.
    const primero = leerNumero(b, i, false);
    if (!primero) return [];
    i += primero.largo;
    largos.push(primero.valor);

    for (let k = 1; k < cuantos - 1; k++) {
      const dif = leerNumero(b, i, false);
      if (!dif) return [];
      i += dif.largo;
      // La diferencia va con signo, corrida a la mitad del rango.
      const mitad = 2 ** (7 * dif.largo - 1) - 1;
      largos.push(largos[largos.length - 1] + dif.valor - mitad);
    }
    largos.push(b.length - i - largos.reduce((s, x) => s + x, 0));
  }

  const salida: Uint8Array[] = [];
  for (const largo of largos) {
    if (largo <= 0 || i + largo > b.length) break;
    salida.push(b.subarray(i, i + largo));
    i += largo;
  }
  return salida;
}

/* ==========================================================================
 * 2. Cuánto dura cada paquete
 * ========================================================================== */

/**
 * Muestras que dura cada paquete de Opus, según su primer byte.
 *
 * Hace falta para las «posiciones» de Ogg, que son un número de muestras
 * acumuladas. Sin esto habría que suponer 20 ms por paquete: anda casi
 * siempre, y cuando no, el reproductor muestra una duración equivocada y la
 * barra de avance salta.
 *
 * La tabla es la del formato: el primer byte trae un número de configuración
 * y de ahí sale cuánto dura un cuadro.
 */
const MUESTRAS: readonly number[] = [
  480, 960, 1920, 2880, // SILK banda angosta
  480, 960, 1920, 2880, // SILK banda media
  480, 960, 1920, 2880, // SILK banda ancha
  480, 960, //            híbrido súper ancha
  480, 960, //            híbrido completa
  120, 240, 480, 960, //  CELT angosta
  120, 240, 480, 960, //  CELT ancha
  120, 240, 480, 960, //  CELT súper ancha
  120, 240, 480, 960, //  CELT completa
];

/** Cuántas muestras, a 48 kHz, dura este paquete. */
export function duracionDelPaquete(p: Uint8Array): number {
  if (p.length === 0) return 0;

  const porCuadro = MUESTRAS[p[0] >> 3] ?? 960;
  const cuantos = p[0] & 0x03;

  if (cuantos === 0) return porCuadro; //     uno
  if (cuantos === 1 || cuantos === 2) return porCuadro * 2; // dos
  // Los que dicen cuántos en el segundo byte.
  return porCuadro * (p.length > 1 ? p[1] & 0x3f : 1);
}

/* ==========================================================================
 * 3. Armar el Ogg
 * ==========================================================================
 *
 * Un Ogg es una fila de páginas. Cada página lleva una cabecera de 27 bytes,
 * una tabla que dice dónde termina cada paquete, y los paquetes.
 */

/**
 * La tabla de sumas de control de Ogg.
 *
 * Es un CRC-32 con un polinomio propio y sin las vueltas que usa el CRC-32 de
 * siempre —ni se invierte al entrar ni al salir—. Escribirlo mal no rompe
 * nada visible: el archivo se arma, pesa lo mismo, y el reproductor lo
 * descarta sin decir por qué.
 */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let r = n << 24;
    for (let k = 0; k < 8; k++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    t[n] = r >>> 0;
  }
  return t;
})();

function crc(b: Uint8Array): number {
  let r = 0;
  for (const x of b) r = ((r << 8) ^ TABLA_CRC[((r >>> 24) ^ x) & 0xff]) >>> 0;
  return r >>> 0;
}

/**
 * Una página de Ogg, ya con su suma de control.
 *
 * `posicion` es cuántas muestras se llevan reproducidas al terminar esta
 * página; en las dos de cabecera va cero. `bandera` marca la primera (2) y la
 * última (4) del archivo.
 */
function pagina(
  paquetes: readonly Uint8Array[],
  posicion: number,
  serie: number,
  numero: number,
  bandera: number,
): Uint8Array {
  // Cada paquete se parte en tramos de 255. Un paquete de 255 justos necesita
  // un tramo de cero atrás para decir que terminó ahí.
  const tramos: number[] = [];
  for (const p of paquetes) {
    let quedan = p.length;
    while (quedan >= 255) {
      tramos.push(255);
      quedan -= 255;
    }
    tramos.push(quedan);
  }

  const cuerpo = paquetes.reduce((s, p) => s + p.length, 0);
  const salida = new Uint8Array(27 + tramos.length + cuerpo);
  const v = new DataView(salida.buffer);

  salida.set([0x4f, 0x67, 0x67, 0x53], 0); // «OggS»
  salida[4] = 0; //                           versión
  salida[5] = bandera;

  /*
   * La posición son ocho bytes, y en JavaScript un número entero sólo llega
   * hasta 2^53. Se parte en dos mitades de 32 bits en vez de usar BigInt: una
   * nota de voz de una hora son 172 millones de muestras, así que la mitad de
   * arriba siempre va en cero, y esto anda en cualquier navegador.
   */
  v.setUint32(6, posicion >>> 0, true);
  v.setUint32(10, Math.floor(posicion / 2 ** 32), true);

  v.setUint32(14, serie, true);
  v.setUint32(18, numero, true);
  v.setUint32(22, 0, true); // la suma, que se calcula con este hueco en cero
  salida[26] = tramos.length;
  salida.set(tramos, 27);

  let i = 27 + tramos.length;
  for (const p of paquetes) {
    salida.set(p, i);
    i += p.length;
  }

  v.setUint32(22, crc(salida), true);
  return salida;
}

/** «OpusTags», que el formato exige aunque no tengamos nada que decir. */
function etiquetas(): Uint8Array {
  const quien = new TextEncoder().encode("CRM Les Arts Culinaires");
  const b = new Uint8Array(8 + 4 + quien.length + 4);
  const v = new DataView(b.buffer);

  b.set(new TextEncoder().encode("OpusTags"), 0);
  v.setUint32(8, quien.length, true);
  b.set(quien, 12);
  v.setUint32(12 + quien.length, 0, true); // sin comentarios
  return b;
}

/** Cuántos paquetes entran en una página: la tabla de tramos es de un byte. */
const TRAMOS_POR_PAGINA = 250;

/** Arma el archivo Ogg a partir de la cabecera y los paquetes. */
export function armarOgg(adentro: Adentro): Uint8Array {
  // Un número cualquiera identifica la pista adentro del archivo. Cambia en
  // cada nota para que dos no se confundan si alguna vez se pegan.
  const serie = (Math.random() * 0xffffffff) >>> 0;
  const paginas: Uint8Array[] = [];

  let numero = 0;
  paginas.push(pagina([adentro.cabecera], 0, serie, numero++, 0x02));
  paginas.push(pagina([etiquetas()], 0, serie, numero++, 0x00));

  let posicion = 0;
  let lote: Uint8Array[] = [];

  const cerrar = (ultima: boolean) => {
    if (lote.length === 0 && !ultima) return;
    paginas.push(pagina(lote, posicion, serie, numero++, ultima ? 0x04 : 0x00));
    lote = [];
  };

  for (const p of adentro.paquetes) {
    lote.push(p);
    posicion += duracionDelPaquete(p);

    // Se corta por cantidad de tramos, no de paquetes: un paquete largo ocupa
    // varios, y pasarse de 255 no entra en la tabla de la página.
    const tramos = lote.reduce((s, x) => s + Math.floor(x.length / 255) + 1, 0);
    if (tramos >= TRAMOS_POR_PAGINA) cerrar(false);
  }

  cerrar(true);

  const total = paginas.reduce((s, p) => s + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const p of paginas) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

/**
 * De WebM con Opus a Ogg con Opus, sin tocar el sonido.
 *
 * Lo único que hace falta llamar desde afuera. Lanza con un mensaje en
 * castellano si lo que entra no es lo que se espera —un WebM sin Opus, un
 * archivo cortado— para que la pantalla pueda decir algo útil en vez de
 * «undefined».
 */
export function webmAOgg(bytes: Uint8Array): Uint8Array {
  return armarOgg(paquetesDeWebm(bytes));
}

/** El tipo que hay que declarar al subirlo y al mandárselo a Meta. */
export const TIPO_OGG = "audio/ogg";

/**
 * Cuánto dura, en segundos, lo que se grabó.
 *
 * Se calcula de los paquetes y no del reloj de la grabación: es lo que
 * realmente quedó en el archivo, y es lo que va a mostrar el reproductor.
 */
export function segundosDe(paquetes: readonly Uint8Array[]): number {
  const muestras = paquetes.reduce((s, p) => s + duracionDelPaquete(p), 0);
  return muestras / 48000;
}
