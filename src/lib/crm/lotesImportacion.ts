/**
 * A qué cliente pertenece cada fila de un lote de importación.
 *
 * Vive acá y no dentro de la acción del servidor por dos razones. La primera
 * es que un archivo `"use server"` sólo puede exportar funciones asíncronas,
 * así que un ayudante puro no tiene lugar allá. La segunda es que esto es
 * justo lo que hay que poder probar: si se equivoca, una persona entra dos
 * veces, que es el problema que toda la pantalla de importación existe para
 * evitar.
 */

import { buscarDuplicados, type ContactoConocido } from "@/lib/duplicados";

/** Lo único que hace falta mirar de una fila para repartirla. */
export interface FilaConDestino {
  /** Cliente del CRM al que se suma, si ya existe. */
  unificar_con?: number | null;
  /** Filas que comparten esta clave crean UNA ficha entre todas. */
  grupo?: string | null;
}

export interface Reparto {
  /**
   * Un grupo por cada ficha nueva a crear, en orden. La posición manda: el
   * cliente que devuelva la base para el grupo 0 es el de `grupos[0]`.
   */
  grupos: string[];
  /** Para cada fila, a qué grupo va. Null si se une a un cliente existente. */
  claves: (string | null)[];
  /**
   * Índice de la fila que representa a cada grupo. Es la que aporta los datos
   * del contacto cuando se inserta la ficha.
   */
  cabeceras: number[];
}

/**
 * Reparte las filas en grupos.
 *
 * La clave de una fila sin grupo lleva su posición, para que nunca choque con
 * la de otra: sin eso, dos filas sueltas caerían en el mismo balde y entrarían
 * como una sola persona.
 */
export function repartir(filas: readonly FilaConDestino[]): Reparto {
  const grupos: string[] = [];
  const cabeceras: number[] = [];

  const claves = filas.map((f, i) => {
    if (f.unificar_con != null) return null;

    const clave = f.grupo && f.grupo.trim() ? `g:${f.grupo.trim()}` : `sola:${i}`;
    if (!grupos.includes(clave)) {
      grupos.push(clave);
      cabeceras.push(i);
    }
    return clave;
  });

  return { grupos, claves, cabeceras };
}

/**
 * Con los ids que devolvió la base, a qué cliente apunta cada fila.
 *
 * `creados[i]` es el cliente del grupo `grupos[i]`, en el mismo orden en que
 * se insertaron.
 */
export function asignarClientes(
  filas: readonly FilaConDestino[],
  reparto: Reparto,
  creados: readonly { id: number }[],
): number[] {
  const porGrupo = new Map<string, number>();
  reparto.grupos.forEach((clave, i) => porGrupo.set(clave, creados[i].id));

  return filas.map((f, i) => {
    if (f.unificar_con != null) return f.unificar_con;
    return porGrupo.get(reparto.claves[i] as string) as number;
  });
}

/** Un lead del lote: las filas que lo forman y de quién es. */
export interface LeadDelLote {
  /**
   * Índices de las filas que se funden en este lead, en el orden del archivo.
   * La primera es la que manda; las demás llenan huecos.
   */
  filas: number[];
  clienteId: number;
  /** El programa que quedó. Null cuando ninguna fila trajo uno. */
  productoId: number | null;
}

/**
 * Cuántos leads salen de un lote, y qué filas van en cada uno.
 *
 * ============================================================================
 * POR QUÉ ESTO NO ES «UNA OPORTUNIDAD POR FILA»
 * ============================================================================
 *
 * Porque era eso, y por eso se duplicaban. La pantalla de importación ya junta
 * bien a las personas —tres filas de la misma señora crean UNA ficha—, pero
 * después se le colgaba una oportunidad a cada fila. La ficha quedaba una y los
 * leads tres, y en la pantalla de Clientes, que lista leads, eso se ve como
 * tres veces la misma persona. Es el mismo defecto que tenía el botón
 * «Unificar», del otro lado del CRM.
 *
 * ============================================================================
 * LA REGLA, QUE ES LA MISMA QUE EN `leadRepetido.ts`
 * ============================================================================
 *
 * El programa es lo que separa un trato de otro:
 *
 *   MISMO PROGRAMA         una sola oportunidad, con los datos de todas las
 *                          filas fundidos.
 *
 *   PROGRAMAS DISTINTOS    dos oportunidades, porque son dos ventas con dos
 *                          montos. Juntarlas perdería una, que es peor que el
 *                          duplicado que se está arreglando.
 *
 *   SIN PROGRAMA           no contradice a nadie: se suma al lead que haya. Es
 *                          el caso más común —las planillas de contactos no
 *                          traen esa columna— y si esto abriera un lead aparte
 *                          no se habría arreglado nada.
 *
 * Se trabaja con índices y no con las filas para que la función no dependa de
 * la forma de una fila de importación, que tiene quince campos y cambia.
 */
export function agruparEnLeads(
  clientePorFila: readonly number[],
  productoPorFila: readonly (number | null)[],
): LeadDelLote[] {
  /** Los leads que va juntando cada cliente, en el orden en que aparecen. */
  const porCliente = new Map<number, LeadDelLote[]>();
  const salida: LeadDelLote[] = [];

  clientePorFila.forEach((clienteId, i) => {
    const producto = productoPorFila[i] ?? null;
    let suyos = porCliente.get(clienteId);
    if (!suyos) {
      suyos = [];
      porCliente.set(clienteId, suyos);
    }

    if (producto == null) {
      // Sin programa: al primero que tenga, y si no hay ninguno, uno nuevo.
      if (suyos.length > 0) {
        suyos[0].filas.push(i);
        return;
      }
    } else {
      const mismo = suyos.find((l) => l.productoId === producto);
      if (mismo) {
        mismo.filas.push(i);
        return;
      }
      /*
       * Un lead que todavía no tiene programa adopta el que llega.
       *
       * Es el orden inverso del caso de arriba y hace falta igual: si la
       * primera fila de la persona venía sin programa y la segunda trae
       * Panadería, son la misma inscripción escrita en dos renglones, no dos.
       */
      const huerfano = suyos.find((l) => l.productoId == null);
      if (huerfano) {
        huerfano.productoId = producto;
        huerfano.filas.push(i);
        return;
      }
    }

    const nuevo: LeadDelLote = { filas: [i], clienteId, productoId: producto };
    suyos.push(nuevo);
    salida.push(nuevo);
  });

  return salida;
}

/**
 * Lo que hace falta de una fila para saber si esa persona ya está en el CRM.
 *
 * Es a propósito más que `FilaConDestino`: para repartir alcanza con saber a
 * qué grupo va cada una, pero para reconocer a alguien hay que mirarle los
 * datos.
 */
export interface FilaConContacto extends FilaConDestino {
  nombre?: string | null;
  telefono?: string | null;
  correo?: string | null;
}

/**
 * Cuelga de su ficha las filas de gente que YA está en el CRM.
 *
 * ============================================================================
 * POR QUÉ ESTO PASA EN EL SERVIDOR Y NO EN LA PANTALLA
 * ============================================================================
 *
 * La pantalla ya compara, y compara bien. El problema es contra qué: usa las
 * oportunidades que el navegador tiene cargadas, y eso deja tres agujeros por
 * los que se cuela un duplicado:
 *
 *   LO QUE NO LE TOCA VER      Una asesora ve sólo sus leads. Si el contacto
 *                              del archivo es de otra asesora, para ella no
 *                              existe, y lo importa como nuevo.
 *
 *   LO QUE SE CARGÓ DESPUÉS    La lista se arma al abrir la pantalla. Un
 *                              cliente que otra persona dio de alta mientras
 *                              se preparaba el archivo no está ahí.
 *
 *   LO QUE NO TIENE LEAD       La lista sale de las oportunidades, así que una
 *                              ficha sin ninguna es invisible.
 *
 * Acá no hay nada de eso: la tabla de clientes se ve entera —así está escrita
 * su política— y se lee en el momento de importar. Es la última comprobación
 * antes de crear una ficha, y es la que hace que el resultado no dependa de
 * quién esté mirando la pantalla.
 *
 * ============================================================================
 * POR CORREO O TELÉFONO, NUNCA POR NOMBRE SOLO
 * ============================================================================
 *
 * La pantalla sí propone por nombre, y está bien: hay una persona mirando que
 * puede decir «no, son dos». Acá no hay nadie. Dos alumnas se pueden llamar
 * igual, y unir sus fichas sin preguntar mezcla dos historias que después no
 * se separan.
 *
 * El correo y el teléfono son de una persona; el nombre, no.
 */
export function colgarDeLosQueYaEstan<T extends FilaConContacto>(
  filas: readonly T[],
  conocidos: readonly ContactoConocido[],
): T[] {
  if (conocidos.length === 0) return [...filas];

  /*
   * La clave del grupo, igual que en `repartir`.
   *
   * Tiene que coincidir con aquélla o esto colgaría una fila y dejaría suelta
   * a su compañera, y la misma persona entraría dos veces igual: una unida y
   * una nueva.
   */
  const claveDe = (f: T, i: number): string =>
    f.grupo && f.grupo.trim() ? `g:${f.grupo.trim()}` : `sola:${i}`;

  /*
   * Los datos de la persona, juntando todas sus filas.
   *
   * Una fila puede traer el teléfono y la otra el correo. Buscando fila por
   * fila, la que sólo tiene el nombre no encontraría nada; buscando con lo de
   * todas, alcanza con que UNA traiga un dato reconocible.
   */
  const datos = new Map<string, { telefono: string | null; correo: string | null }>();
  filas.forEach((f, i) => {
    if (f.unificar_con != null) return;
    const clave = claveDe(f, i);
    const previo = datos.get(clave) ?? { telefono: null, correo: null };
    datos.set(clave, {
      telefono: previo.telefono ?? (f.telefono || null),
      correo: previo.correo ?? (f.correo || null),
    });
  });

  const encontrado = new Map<string, number>();
  for (const [clave, d] of datos) {
    const iguales = buscarDuplicados(d, conocidos).filter((c) =>
      c.motivos.some((m) => m === "correo" || m === "telefono"),
    );
    if (iguales.length > 0) encontrado.set(clave, iguales[0].clienteId);
  }

  return filas.map((f, i) => {
    if (f.unificar_con != null) return f;
    const id = encontrado.get(claveDe(f, i));
    return id == null ? f : { ...f, unificar_con: id };
  });
}
