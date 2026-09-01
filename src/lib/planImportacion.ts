/**
 * Qué va a pasar exactamente si se aprieta Importar.
 *
 * Está separado de la pantalla porque es la parte que hay que poder probar:
 * decide cuántas fichas se crean, cuáles se completan y qué filas se quedan
 * afuera. La pantalla sólo lo muestra.
 */

import { agrupar, type Persona, type Sospecha } from "@/lib/agrupar";
import { agruparEnLeads } from "@/lib/crm/lotesImportacion";
import type { ContactoConocido } from "@/lib/duplicados";
import type { FilaImportada } from "@/lib/importar";

/**
 * `unificar`  junta lo que es la misma persona, dentro del archivo y contra el CRM.
 * `omitir`    deja afuera lo que ya está cargado. Sirve para subir sólo lo nuevo.
 * `crear`     mete todo tal cual, sin mirar repetidos. Es la salida de emergencia.
 */
export type Modo = "unificar" | "omitir" | "crear";

/** Una fila lista para mandar, ya decidido a qué persona pertenece. */
export interface Destino {
  fila: FilaImportada;
  /** Cliente del CRM al que se suma. Null si la persona es nueva. */
  unificarCon: number | null;
  /** Filas que comparten esta clave crean una sola ficha entre todas. */
  grupo: string | null;
  /** Los datos ya unificados: el nombre más completo, los huecos rellenos. */
  nombre: string;
  telefono: string | null;
  correo: string | null;
  /**
   * Datos de la persona, no del trato, juntados entre todas sus filas.
   *
   * Es el caso que la escuela pidió: la base de cumpleaños trae el nombre y la
   * fecha, la de inscripciones trae el nombre y el país. Si cada fila mandara
   * sólo lo suyo, la ficha se quedaría con lo que trajo la última.
   */
  pais: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
}

/** El primer valor que alguna fila del grupo haya traído. */
function primeroQueHaya<K extends "pais" | "fecha_nacimiento" | "edad">(
  filas: readonly FilaImportada[],
  campo: K,
): FilaImportada[K] {
  for (const f of filas) {
    const v = f[campo];
    if (v != null && v !== "") return v;
  }
  return null as FilaImportada[K];
}

export interface Resumen {
  /** Filas del archivo que se pueden importar (sin errores). */
  validas: number;
  /** Filas descartadas por un error, por ejemplo sin nombre. */
  conError: number;
  /** Fichas de cliente que se van a crear. */
  fichasNuevas: number;
  /** Oportunidades que se van a agregar. Una por fila importada. */
  oportunidades: number;
  /** Filas que se suman a un contacto que ya estaba en el CRM. */
  seUnenAlCrm: number;
  /** Filas que se juntan con otra fila del mismo archivo. */
  seJuntanEntreSi: number;
  /** Filas que no se importan. */
  omitidas: number;
  /**
   * Filas que caen sobre alguien que YA está en el CRM y le abren un lead
   * nuevo igual, por ser de otro programa.
   *
   * Es correcto que pase —dos programas son dos ventas— pero hay que decirlo
   * antes de importar y no después. La escuela lo pidió con estas palabras:
   * «si una misma persona pregunta en distintas fechas distintos productos,
   * ésa es otra razón por la que se pueden duplicar los leads cuando
   * ingresamos nueva base de datos». No se duplican: se abre un segundo trato.
   * Pero visto de golpe en la lista de Clientes se lee igual que un duplicado,
   * y verlo acá antes evita la sorpresa.
   */
  abrenOtroLead: number;
  /** A quiénes, para poder nombrarlas en vez de dar sólo un número. */
  aQuienesAbrenOtro: string[];
  /** Grupos que se unieron pero cuyos nombres no se parecen. Mirar. */
  aRevisar: Persona[];
  /** Se llaman igual pero no comparten teléfono ni correo. No se unieron. */
  sospechas: Sospecha[];
}

export interface Plan {
  resumen: Resumen;
  destinos: Destino[];
  /** Las personas tal como quedaron agrupadas, para poder mostrarlas. */
  personas: Persona[];
}

/**
 * Cómo se nombra un grupo para poder señalarlo desde la pantalla.
 *
 * Se usa la lista de filas que lo componen y no su posición, porque la
 * posición cambia si el archivo se vuelve a leer o si el modo cambia, y
 * entonces «separar el tercero» pasaría a separar a otro.
 */
export const claveDePersona = (p: Persona): string => p.filas.join("-");

export interface OpcionesPlan {
  filas: readonly FilaImportada[];
  existentes: readonly ContactoConocido[];
  modo: Modo;
  /**
   * Grupos que alguien miró y decidió que NO son la misma persona.
   *
   * Cada fila del grupo se convierte en su propia ficha, y ninguna se cuelga
   * del cliente del CRM: si quien conoce a la gente dice que son dos personas,
   * el parecido de los datos no alcanza para contradecirlo.
   */
  separados?: readonly string[];
  /**
   * Los programas de los leads ABIERTOS que ya tiene cada contacto del CRM.
   *
   * Con esto el resumen puede decir cuántas filas le van a abrir un segundo
   * lead a alguien que ya está. Sin esto no cambia nada: el número sale en
   * cero y la pantalla no muestra el aviso.
   *
   * Sólo los abiertos: un lead cerrado no recibe nada, así que una fila que
   * cae en alguien que sólo tiene cerrados abre uno nuevo por otro motivo y no
   * es el caso del que habla este aviso.
   */
  leadsAbiertos?: ReadonlyMap<number, readonly (number | null)[]>;
}

/**
 * ¿Este lead que entra se suma a alguno que la persona ya tiene abierto?
 *
 * Es la misma regla que aplica el servidor en `cualAbsorbe`, escrita chiquita
 * para la vista previa: sin programa no contradice a ninguno y se suma al que
 * haya; con programa, se suma al del mismo programa o a uno que no tenga.
 *
 * Si acá dijera que sí y el servidor que no, la pantalla prometería un lead y
 * entrarían dos. Por eso está probada contra los mismos casos.
 */
export function seSumaAUnoAbierto(
  programaQueEntra: number | null,
  programasAbiertos: readonly (number | null)[],
): boolean {
  if (programasAbiertos.length === 0) return false;
  if (programaQueEntra == null) return true;
  return programasAbiertos.some((p) => p == null || p === programaQueEntra);
}

export function construirPlan({
  filas,
  existentes,
  modo,
  separados = [],
  leadsAbiertos,
}: OpcionesPlan): Plan {
  const validas = filas.filter((f) => f.errores.length === 0);
  const conError = filas.length - validas.length;

  // ------------------------------------------------------------------ crear
  // Sin mirar nada: cada fila es su propia persona. Se sigue agrupando para
  // poder mostrar lo que se va a duplicar, pero no se aplica.
  if (modo === "crear") {
    const { personas, sospechas } = agrupar({ filas: validas, existentes });
    return {
      personas,
      destinos: validas.map((f) => ({
        fila: f,
        unificarCon: null,
        grupo: null,
        nombre: f.nombre,
        telefono: f.telefono,
        correo: f.correo,
        pais: f.pais,
        fecha_nacimiento: f.fecha_nacimiento,
        edad: f.edad,
      })),
      resumen: {
        validas: validas.length,
        conError,
        fichasNuevas: validas.length,
        oportunidades: validas.length,
        seUnenAlCrm: 0,
        seJuntanEntreSi: 0,
        omitidas: 0,
        // «Crear» mete todo tal cual y no se cuelga de nadie, así que no hay
        // ningún contacto al que se le esté abriendo un lead de más.
        abrenOtroLead: 0,
        aQuienesAbrenOtro: [],
        aRevisar: [],
        sospechas,
      },
    };
  }

  const agrupado = agrupar({ filas: validas, existentes });
  const sospechas = agrupado.sospechas;

  // Un grupo que alguien separó se deshace en personas de a una. Se hace acá
  // y no dentro de `agrupar` para que la agrupación siga siendo sólo lo que
  // dicen los datos, y la decisión de la persona quede aparte y visible.
  const rotos = new Set(separados);
  // Se puede separar tanto un grupo de varias filas como una sola fila que
  // quedó pegada a un contacto del CRM. Ese segundo caso es justamente el que
  // más se va a usar: el archivo trae a alguien con el teléfono de la casa y
  // el CRM ya tenía a otra persona de la familia con ese mismo número.
  const personas: Persona[] = agrupado.personas.flatMap((p) =>
    rotos.has(claveDePersona(p)) && (p.filas.length > 1 || p.clienteId != null)
      ? p.filas.map((indice) => ({
          ...p,
          clienteId: null,
          nombre: validas[indice].nombre,
          telefono: validas[indice].telefono,
          correo: validas[indice].correo,
          filas: [indice],
          certeza: "alta" as const,
          otrosNombres: [],
        }))
      : [p],
  );

  const destinos: Destino[] = [];
  let fichasNuevas = 0;
  let seUnenAlCrm = 0;
  let seJuntanEntreSi = 0;
  let omitidas = 0;

  personas.forEach((p, i) => {
    // ----------------------------------------------------------- omitir
    // Ya está en el CRM: no entra nada de esta persona.
    if (modo === "omitir" && p.clienteId != null) {
      omitidas += p.filas.length;
      return;
    }

    // Aunque se omita lo repetido, dentro del archivo sigue habiendo que
    // decidir: de una persona que aparece tres veces entra una sola fila. Es
    // lo que hacía antes, dicho explícitamente.
    const filasDeLaPersona = modo === "omitir" ? p.filas.slice(0, 1) : p.filas;
    omitidas += p.filas.length - filasDeLaPersona.length;

    // La clave sólo hace falta cuando hay más de una fila creando la misma
    // ficha; mandarla siempre no rompe nada pero ensucia lo que viaja.
    const grupo =
      p.clienteId == null && filasDeLaPersona.length > 1 ? `p${i}` : null;

    if (p.clienteId == null) fichasNuevas += 1;
    if (p.clienteId != null) seUnenAlCrm += filasDeLaPersona.length;
    if (filasDeLaPersona.length > 1) seJuntanEntreSi += filasDeLaPersona.length - 1;

    const deLaPersona = filasDeLaPersona.map((i) => validas[i]);

    for (const indice of filasDeLaPersona) {
      destinos.push({
        fila: validas[indice],
        unificarCon: p.clienteId,
        grupo,
        // Los datos de la ficha son los del grupo, no los de la fila suelta:
        // por eso unir sirve, porque el teléfono que traía una completa el
        // hueco de la otra.
        nombre: p.nombre,
        telefono: p.telefono,
        correo: p.correo,
        pais: primeroQueHaya(deLaPersona, "pais"),
        fecha_nacimiento: primeroQueHaya(deLaPersona, "fecha_nacimiento"),
        edad: primeroQueHaya(deLaPersona, "edad"),
      });
    }
  });

  /*
   * En el orden del archivo, pero con las filas de una misma persona juntas.
   *
   * ------------------------------------------------------------------------
   * POR QUÉ NO ALCANZA CON EL ORDEN DEL ARCHIVO
   * ------------------------------------------------------------------------
   *
   * Acá se ordenaba sólo por línea, que es lo que uno quiere: los códigos
   * CRM-XXXX se asignan en ese orden y quien después compara la planilla con
   * el CRM puede seguir la lista.
   *
   * El problema aparece dos pasos más adelante. La pantalla manda las filas de
   * a doscientas, y el servidor crea UNA ficha por grupo DENTRO DE CADA LOTE.
   * `enLotes` evita cortar un grupo por la mitad, pero sólo puede hacerlo si
   * las filas del grupo están una al lado de la otra: mira la que sigue.
   *
   * Y en el orden del archivo casi nunca lo están. La misma persona
   * preguntando por dos programas distintos aparece en la fila 5 y en la 300
   * —las planillas de la escuela vienen ordenadas por programa o por fecha—,
   * así que el corte del lote cae en el medio, cada lote crea su propia ficha,
   * y esa persona termina duplicada. Es exactamente lo que avisó la escuela:
   * «siempre se repiten los leads y no se unifican».
   *
   * ------------------------------------------------------------------------
   * LO QUE HACE ESTE ORDEN
   * ------------------------------------------------------------------------
   *
   * Cada fila se ordena por la PRIMERA línea de su persona, y después por la
   * suya. O sea: la segunda aparición de alguien se adelanta hasta pegarse a
   * la primera, y todo lo demás queda donde estaba. El archivo se sigue
   * leyendo de arriba abajo; lo único que se mueve son las repeticiones, que
   * son pocas y que de todos modos no tienen un lugar propio en la lista.
   *
   * Sólo importa para las filas con `grupo` —las que van a crear una ficha
   * nueva entre varias—. Una fila que se une a un contacto que ya está en el
   * CRM viaja con su `unificarCon`, que el servidor resuelve igual en
   * cualquier lote.
   */
  const primeraDelGrupo = new Map<string, number>();
  for (const d of destinos) {
    if (d.grupo == null) continue;
    const previa = primeraDelGrupo.get(d.grupo);
    if (previa == null || d.fila.linea < previa) primeraDelGrupo.set(d.grupo, d.fila.linea);
  }

  const dondeVa = (d: Destino): number =>
    d.grupo != null ? (primeraDelGrupo.get(d.grupo) ?? d.fila.linea) : d.fila.linea;

  destinos.sort((a, b) => dondeVa(a) - dondeVa(b) || a.fila.linea - b.fila.linea);

  /*
   * Cuántos leads salen, que ya no es «uno por fila».
   *
   * Las filas de una misma persona se funden en un lead por programa, con la
   * misma regla que aplica el servidor. Contar filas acá prometería trescientos
   * leads y aparecerían doscientos ochenta, y la diferencia se leería como
   * filas perdidas.
   *
   * Es un piso, no el número exacto: el servidor ve además los leads que esas
   * personas ya tienen en el CRM y puede fundir con alguno de ésos, así que
   * puede terminar creando menos. Lo que no puede es crear más.
   */
  const persona = new Map<Destino, number>();
  personas.forEach((p, i) => {
    for (const d of destinos) {
      // `unificarCon` identifica a la persona cuando ya está en el CRM; el
      // índice del grupo, cuando es nueva.
      if (p.clienteId != null ? d.unificarCon === p.clienteId : d.grupo === `p${i}`) {
        persona.set(d, i);
      }
    }
  });

  let suelta = personas.length;
  const dePersona = destinos.map((d) => persona.get(d) ?? suelta++);

  const leads = agruparEnLeads(
    dePersona,
    destinos.map((d) => d.fila.producto_id),
  );

  /*
   * A quiénes de las que YA están en el CRM les vamos a abrir un lead más.
   *
   * Se cuenta por lead y no por fila: dos filas del mismo programa son un solo
   * lead nuevo, y decir «2» ahí sería contar dos veces la misma sorpresa.
   */
  const aQuienesAbrenOtro: string[] = [];
  if (leadsAbiertos && leadsAbiertos.size > 0) {
    for (const l of leads) {
      const primera = destinos[l.filas[0]];
      // Persona nueva: no le abre un segundo lead a nadie, le abre el primero.
      if (primera?.unificarCon == null) continue;

      const abiertos = leadsAbiertos.get(primera.unificarCon);
      // Sin leads abiertos no es el caso del que habla el aviso: no hay un
      // «segundo» lead, hay uno donde antes sólo había cerrados.
      if (!abiertos || abiertos.length === 0) continue;

      if (!seSumaAUnoAbierto(l.productoId, abiertos)) {
        aQuienesAbrenOtro.push(primera.nombre);
      }
    }
  }

  return {
    personas,
    destinos,
    resumen: {
      validas: validas.length,
      conError,
      fichasNuevas,
      oportunidades: leads.length,
      seUnenAlCrm,
      seJuntanEntreSi,
      omitidas,
      abrenOtroLead: aQuienesAbrenOtro.length,
      aQuienesAbrenOtro,
      aRevisar: personas.filter((p) => p.certeza === "revisar"),
      sospechas,
    },
  };
}

/**
 * Parte la lista en lotes sin cortar un grupo por la mitad.
 *
 * La pantalla manda de a 200 filas para no armar una petición gigante, pero
 * las filas de una misma persona tienen que viajar juntas: el servidor crea
 * una ficha por grupo *dentro de cada lote*, así que si tres filas de Ana
 * caen dos en un lote y una en el siguiente, Ana entra dos veces. Es
 * exactamente el problema que esta pantalla existe para evitar.
 *
 * Por eso el tope es orientativo: un lote puede pasarse un poco antes que
 * cortar un grupo. Los grupos son de dos o tres filas, así que el exceso es
 * mínimo.
 */
export function enLotes<T extends { grupo: string | null }>(
  destinos: readonly T[],
  tope: number,
): T[][] {
  const lotes: T[][] = [];
  let actual: T[] = [];

  for (let i = 0; i < destinos.length; i += 1) {
    actual.push(destinos[i]);

    const siguiente = destinos[i + 1];
    // Se corta cuando se llegó al tope y lo que sigue no es del mismo grupo.
    const mismoGrupo =
      siguiente != null && siguiente.grupo != null && siguiente.grupo === destinos[i].grupo;

    if (actual.length >= tope && !mismoGrupo) {
      lotes.push(actual);
      actual = [];
    }
  }

  if (actual.length > 0) lotes.push(actual);
  return lotes;
}
