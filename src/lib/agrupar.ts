/**
 * Juntar en una sola persona las filas que hablan del mismo contacto.
 *
 * El problema que resuelve: una planilla trae a la misma persona tres veces
 * —porque preguntó por tres programas, o porque la cargaron tres asesoras— y
 * además esa persona ya está en el CRM. Sin esto quedan cuatro fichas de
 * alguien que es uno solo, y a partir de ahí nadie sabe cuál mirar.
 *
 * La regla, en una línea: **une por teléfono o correo, después mira el
 * nombre**. Los dos primeros identifican; el nombre no. «María Rodríguez»
 * puede ser dos personas distintas, y unirlas por llamarse igual mezcla dos
 * historias que después no se pueden separar. Por eso las coincidencias que
 * son sólo de nombre no se unen solas: se proponen aparte para que alguien
 * decida.
 *
 * Todo acá es puro: entra una lista, sale otra. No toca la base ni la
 * pantalla.
 */

import {
  normalizarCorreo,
  normalizarTelefono,
  normalizarTexto,
  type ContactoConocido,
} from "@/lib/duplicados";

/** Lo mínimo que hace falta de una fila del archivo para poder agruparla. */
export interface FilaAgrupable {
  nombre: string;
  telefono: string | null;
  correo: string | null;
}

export type Certeza = "alta" | "revisar";

export interface Persona {
  /**
   * Cliente del CRM al que pertenece el grupo. Null si nadie de este grupo
   * existía todavía y hay que crearlo.
   */
  clienteId: number | null;
  /** El nombre que se va a usar. Ver `elegirNombre`. */
  nombre: string;
  telefono: string | null;
  correo: string | null;
  /** Posiciones en el archivo (índice de `filas`, base 0) que caen acá. */
  filas: number[];
  /**
   * `alta`: se unieron por teléfono o correo y los nombres son compatibles.
   * `revisar`: se unieron por un identificador pero los nombres no se parecen
   * en nada. Casi siempre es un apodo o el nombre de la empresa, y de vez en
   * cuando es un teléfono familiar compartido entre dos personas distintas.
   */
  certeza: Certeza;
  /** Por qué se unieron: "telefono", "correo", o los dos. */
  motivos: ("telefono" | "correo")[];
  /** Los otros nombres que aparecieron para esta misma persona. */
  otrosNombres: string[];
}

/** Dos filas que se llaman igual pero no comparten ningún identificador. */
export interface Sospecha {
  /** Índices de filas del archivo, o -1 cuando el par es con alguien del CRM. */
  filas: number[];
  /** Cliente del CRM implicado, si lo hay. */
  clienteId: number | null;
  nombre: string;
}

export interface Agrupacion {
  personas: Persona[];
  /**
   * Parecidos que NO se unieron: mismo nombre, ningún identificador en común.
   * Se muestran para que alguien mire, no se aplican solos.
   */
  sospechas: Sospecha[];
}

// --------------------------------------------------------------- los nombres

/** Las palabras del nombre, sin acentos y sin las de una sola letra. */
function palabras(nombre: string): string[] {
  return normalizarTexto(nombre)
    .split(" ")
    .filter((p) => p.length > 1);
}

/**
 * ¿Estos dos nombres pueden ser de la misma persona?
 *
 * Compara palabras sueltas y no el texto completo, porque en la práctica el
 * mismo contacto llega escrito de muchas formas: «Ana María Pérez», «Pérez
 * Ana», «Ana Perez». Ordenar y comparar palabra por palabra las da por
 * iguales; comparar la cadena entera, no.
 *
 * Alcanza con que compartan la mitad de las palabras del nombre más corto.
 * Pedir todas dejaría afuera a quien a veces escribe su segundo nombre y a
 * veces no, que es lo más común de todo.
 */
export function nombresCompatibles(a: string, b: string): boolean {
  const x = palabras(a);
  const y = palabras(b);

  // Sin nombre utilizable no hay nada que contradiga: no se opone a la unión.
  if (x.length === 0 || y.length === 0) return true;

  const enComun = x.filter((p) => y.includes(p)).length;
  const corto = Math.min(x.length, y.length);
  return enComun / corto >= 0.5;
}

/**
 * De todos los nombres del grupo, cuál se queda.
 *
 * Gana el más largo de los que están escritos con mayúsculas y minúsculas
 * normales. Una planilla exportada suele traer «ANA PEREZ» y la ficha del CRM
 * «Ana María Pérez»; el segundo tiene más información y se lee mejor, y la
 * versión larga casi siempre incluye a la corta.
 */
export function elegirNombre(nombres: readonly string[]): string {
  const limpios = nombres.map((n) => n.trim()).filter(Boolean);
  if (limpios.length === 0) return "";

  const puntaje = (n: string): number => {
    const todoMayusculas = n === n.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(n);
    const conAcentos = /[áéíóúñÁÉÍÓÚÑ]/.test(n) ? 1 : 0;
    return palabras(n).length * 10 + conAcentos * 5 - (todoMayusculas ? 8 : 0);
  };

  return [...limpios].sort((a, b) => puntaje(b) - puntaje(a) || b.length - a.length)[0];
}

// ------------------------------------------------------------- la agrupación

/** Conjuntos disjuntos: la forma barata de ir uniendo de a pares. */
class Union {
  private padre: number[] = [];

  nuevo(): number {
    this.padre.push(this.padre.length);
    return this.padre.length - 1;
  }

  raiz(i: number): number {
    while (this.padre[i] !== i) {
      this.padre[i] = this.padre[this.padre[i]];
      i = this.padre[i];
    }
    return i;
  }

  unir(a: number, b: number): void {
    const ra = this.raiz(a);
    const rb = this.raiz(b);
    if (ra !== rb) this.padre[rb] = ra;
  }
}

interface Nodo {
  /** Índice de fila en el archivo, o null si es un cliente del CRM. */
  fila: number | null;
  clienteId: number | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
}

export interface OpcionesAgrupar {
  filas: readonly FilaAgrupable[];
  /** Los contactos que ya están en el CRM. */
  existentes: readonly ContactoConocido[];
}

/**
 * Agrupa las filas del archivo entre sí y contra el CRM.
 *
 * Las filas sin teléfono ni correo quedan cada una sola: no hay con qué
 * decidir que son otra persona ni que son la misma, y en la duda vale más una
 * ficha de más que dos historias mezcladas.
 */
export function agrupar({ filas, existentes }: OpcionesAgrupar): Agrupacion {
  const nodos: Nodo[] = [
    ...existentes.map((c) => ({
      fila: null,
      clienteId: c.clienteId,
      nombre: c.nombre,
      telefono: c.telefono,
      correo: c.correo,
    })),
    ...filas.map((f, i) => ({
      fila: i,
      clienteId: null,
      nombre: f.nombre,
      telefono: f.telefono,
      correo: f.correo,
    })),
  ];

  const u = new Union();
  for (const _ of nodos) u.nuevo();

  // Un índice por identificador. Cada vez que dos nodos comparten uno, se
  // unen. Da igual el orden en que lleguen.
  const porTelefono = new Map<string, number>();
  const porCorreo = new Map<string, number>();
  const unidosPor = new Map<number, Set<"telefono" | "correo">>();

  const marcar = (i: number, motivo: "telefono" | "correo") => {
    const set = unidosPor.get(i) ?? new Set();
    set.add(motivo);
    unidosPor.set(i, set);
  };

  nodos.forEach((n, i) => {
    const tel = normalizarTelefono(n.telefono);
    if (tel) {
      const previo = porTelefono.get(tel);
      if (previo != null) {
        u.unir(previo, i);
        marcar(previo, "telefono");
        marcar(i, "telefono");
      } else {
        porTelefono.set(tel, i);
      }
    }

    const cor = normalizarCorreo(n.correo);
    if (cor) {
      const previo = porCorreo.get(cor);
      if (previo != null) {
        u.unir(previo, i);
        marcar(previo, "correo");
        marcar(i, "correo");
      } else {
        porCorreo.set(cor, i);
      }
    }
  });

  // ----------------------------------------------------------- a armar grupos
  const grupos = new Map<number, number[]>();
  nodos.forEach((_, i) => {
    const r = u.raiz(i);
    const lista = grupos.get(r) ?? [];
    lista.push(i);
    grupos.set(r, lista);
  });

  const personas: Persona[] = [];

  for (const miembros of grupos.values()) {
    const delArchivo = miembros.filter((i) => nodos[i].fila != null);
    // Un cliente del CRM que no aparece en el archivo no tiene nada que
    // importar: no genera grupo.
    if (delArchivo.length === 0) continue;

    const delCrm = miembros.filter((i) => nodos[i].clienteId != null);
    const nombres = miembros.map((i) => nodos[i].nombre).filter(Boolean);

    const motivos = new Set<"telefono" | "correo">();
    for (const i of miembros) for (const m of unidosPor.get(i) ?? []) motivos.add(m);

    // El nombre se compara contra el elegido, no todos contra todos: lo que
    // importa es si alguno desentona con el que va a quedar en la ficha.
    const elegido = elegirNombre(nombres);
    const discrepa = nombres.some((n) => !nombresCompatibles(n, elegido));

    personas.push({
      clienteId: delCrm.length > 0 ? nodos[delCrm[0]].clienteId : null,
      nombre: elegido,
      // El primer dato no vacío del grupo. Completar huecos con lo que traiga
      // otra fila es justamente para lo que sirve unir.
      telefono: miembros.map((i) => nodos[i].telefono).find(Boolean) ?? null,
      correo: miembros.map((i) => nodos[i].correo).find(Boolean) ?? null,
      filas: delArchivo.map((i) => nodos[i].fila as number).sort((a, b) => a - b),
      certeza: miembros.length > 1 && discrepa ? "revisar" : "alta",
      motivos: [...motivos].sort(),
      otrosNombres: [...new Set(nombres.filter((n) => n !== elegido))],
    });
  }

  personas.sort((a, b) => a.filas[0] - b.filas[0]);

  return { personas, sospechas: buscarSospechas(nodos, u) };
}

/**
 * Los que se llaman igual pero no comparten teléfono ni correo.
 *
 * No se unen: puede ser la misma persona con dos teléfonos, o dos personas
 * distintas que se llaman igual, y desde acá no hay forma de saberlo. Se
 * listan para que quien conoce a la gente mire.
 */
function buscarSospechas(nodos: readonly Nodo[], u: Union): Sospecha[] {
  const porNombre = new Map<string, number[]>();

  nodos.forEach((n, i) => {
    const clave = normalizarTexto(n.nombre);
    // Un nombre de una sola palabra —«Ana», «Contacto»— empareja demasiado
    // para que el aviso signifique algo.
    if (!clave || palabras(n.nombre).length < 2) return;
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), i]);
  });

  const salida: Sospecha[] = [];

  for (const indices of porNombre.values()) {
    if (indices.length < 2) continue;
    // Si ya quedaron en el mismo grupo, no hay nada que avisar.
    const raices = new Set(indices.map((i) => u.raiz(i)));
    if (raices.size < 2) continue;

    // Sólo interesa si hay al menos una fila del archivo: dos clientes viejos
    // repetidos entre sí no son problema de esta importación.
    const filas = indices.map((i) => nodos[i].fila).filter((f): f is number => f != null);
    if (filas.length === 0) continue;

    salida.push({
      filas,
      clienteId: indices.map((i) => nodos[i].clienteId).find((c) => c != null) ?? null,
      nombre: nodos[indices[0]].nombre,
    });
  }

  return salida;
}
